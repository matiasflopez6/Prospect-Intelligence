import { getEnv } from "../config/env";
import { MissingCredentialError, ProviderError } from "../errors";
import { acquireSlot, resetRateLimiter, type LimiterClock } from "./rate-limiter";
import type { CompleteTextInput } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 90_000;
/** Intentos por modelo ante errores 5xx/red (no cuenta los 429, que tienen su propio presupuesto). */
const MAX_SERVER_ATTEMPTS = 3;
/** Espera máxima por un único 429; Google suele pedir entre 1 s y 60 s. */
const MAX_RATE_WAIT_MS = 65_000;
/** Tras agotar la cuota diaria de un modelo no se vuelve a intentar durante este tiempo (la cuota se renueva a diario). */
const DAILY_COOLDOWN_MS = 60 * 60_000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] };
}

export interface GeminiDeps {
  fetchImpl?: typeof fetch;
  clock?: LimiterClock;
}

const g = globalThis as unknown as { __geminiDailyBlocked?: Map<string, number> };
const dailyBlocked: Map<string, number> = (g.__geminiDailyBlocked ??= new Map());

/** Solo para tests. */
export function resetGeminiState(): void {
  dailyBlocked.clear();
  resetRateLimiter();
}

const realClock: LimiterClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Segundos que Google pide esperar: cabecera Retry-After o `RetryInfo.retryDelay` ("23s", "0.5s"). */
function retryDelayMs(res: Response, data: GeminiResponse): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const info = data.error?.details?.find((d) => d["@type"]?.endsWith("RetryInfo"));
  const secs = info?.retryDelay ? parseFloat(info.retryDelay) : NaN;
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : undefined;
}

/** Un 429 por cuota diaria no se arregla esperando: hay que cambiar de modelo. */
function isDailyQuota(data: GeminiResponse): boolean {
  const ids = (data.error?.details ?? []).flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "");
  return ids.some((id) => /PerDay/i.test(id)) || /per day|daily/i.test(data.error?.message ?? "");
}

/**
 * Proveedor Google AI Studio (Gemini) vía la API REST Generative Language. La clave viaja en la
 * cabecera `x-goog-api-key`, nunca en la URL, para que no aparezca en errores ni registros.
 *
 * Cuotas: cada petición pasa por un limitador de GEMINI_RPM por minuto y modelo, de modo que el plan
 * gratuito no se desborda. Si aun así llega un 429 por minuto, se espera lo que indique Google
 * (Retry-After / retryDelay) y se reintenta; solo se cambia de modelo cuando se agotan los reintentos
 * o la cuota diaria. Los modelos de respaldo se configuran con GEMINI_FALLBACK_MODELS.
 */
export async function geminiComplete(input: CompleteTextInput, deps: GeminiDeps = {}): Promise<string> {
  const { fetchImpl = fetch, clock = realClock } = deps;
  const { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODELS, GEMINI_RPM, GEMINI_MAX_RETRIES } = getEnv();
  if (!GEMINI_API_KEY) throw new MissingCredentialError("Google AI Studio (Gemini)", ["GEMINI_API_KEY"]);
  const fallbacks = GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  const models = [...new Set([input.model ?? GEMINI_MODEL, ...fallbacks])];
  // Los modelos con "thinking" gastan parte del presupuesto de salida razonando: damos margen.
  const maxOutputTokens = Math.max(4096, (input.maxTokens ?? 2048) * 2);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    generationConfig: { maxOutputTokens, ...(input.json ? { responseMimeType: "application/json" } : {}) },
  });

  const errors: string[] = [];
  let sawQuota = false;
  for (const model of models) {
    // Un modelo con la cuota diaria agotada se salta, salvo que sea el último recurso.
    const blockedUntil = dailyBlocked.get(model) ?? 0;
    if (blockedUntil > clock.now() && model !== models[models.length - 1]) {
      errors.push(`${model}: cuota diaria agotada`);
      sawQuota = true;
      continue;
    }
    let serverAttempts = 0;
    let rateRetries = 0;
    modelLoop: for (;;) {
      await acquireSlot(model, GEMINI_RPM, clock);
      try {
        const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data = (await res.json().catch(() => ({}))) as GeminiResponse;
        if (res.ok) {
          if (data.promptFeedback?.blockReason) throw new ProviderError("gemini", `Solicitud bloqueada por el proveedor (${data.promptFeedback.blockReason})`);
          const cand = data.candidates?.[0];
          const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
          if (!text) throw new ProviderError("gemini", `Respuesta vacía (finishReason: ${cand?.finishReason ?? "desconocido"})`);
          if (cand?.finishReason === "MAX_TOKENS") throw new ProviderError("gemini", "La respuesta se cortó por límite de tokens");
          return text;
        }
        const detail = `${model}: HTTP ${res.status}: ${data.error?.message ?? res.statusText}`;
        // 404 = modelo retirado o sin acceso: no tiene sentido reintentarlo, pasamos al siguiente.
        if (res.status === 404) {
          errors.push(detail);
          break modelLoop;
        }
        if (res.status === 429) {
          sawQuota = true;
          if (isDailyQuota(data)) {
            dailyBlocked.set(model, clock.now() + DAILY_COOLDOWN_MS);
            errors.push(`${model}: cuota diaria agotada`);
            break modelLoop;
          }
          if (rateRetries >= GEMINI_MAX_RETRIES) {
            errors.push(`${detail} (tras ${rateRetries} reintentos)`);
            break modelLoop;
          }
          const wait = Math.min(MAX_RATE_WAIT_MS, retryDelayMs(res, data) ?? Math.min(MAX_RATE_WAIT_MS, 2000 * 2 ** rateRetries)) + 250;
          rateRetries++;
          await clock.sleep(wait);
          continue;
        }
        if (res.status < 500) throw new ProviderError("gemini", detail, res.status);
        errors.push(detail);
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Error de servidor o de red: reintento con backoff y luego siguiente modelo.
      if (++serverAttempts >= MAX_SERVER_ATTEMPTS) break;
      await clock.sleep(500 * 2 ** (serverAttempts - 1));
    }
  }
  const summary = errors.slice(-3).join(" | ");
  throw new ProviderError(
    "gemini",
    sawQuota ? `Cuota de Gemini agotada o saturada en todos los modelos (${summary})` : `No disponible (${summary})`,
    sawQuota ? 429 : undefined,
  );
}
