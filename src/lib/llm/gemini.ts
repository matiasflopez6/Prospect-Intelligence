import { getEnv } from "../config/env";
import { MissingCredentialError, ProviderError } from "../errors";
import type { CompleteTextInput } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 4;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Proveedor Google AI Studio (Gemini) vía la API REST Generative Language. La clave viaja en la
 * cabecera `x-goog-api-key`, nunca en la URL, para que no aparezca en errores ni registros.
 */
export async function geminiComplete(input: CompleteTextInput, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = getEnv();
  if (!GEMINI_API_KEY) throw new MissingCredentialError("Google AI Studio (Gemini)", ["GEMINI_API_KEY"]);
  const model = input.model ?? GEMINI_MODEL;
  // Los modelos con "thinking" gastan parte del presupuesto de salida razonando: damos margen.
  const maxOutputTokens = Math.max(4096, (input.maxTokens ?? 2048) * 2);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    generationConfig: { maxOutputTokens, ...(input.json ? { responseMimeType: "application/json" } : {}) },
  });

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${data.error?.message ?? res.statusText}`;
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable) throw new ProviderError("gemini", lastError, res.status);
      } else {
        if (data.promptFeedback?.blockReason) throw new ProviderError("gemini", `Solicitud bloqueada por el proveedor (${data.promptFeedback.blockReason})`);
        const cand = data.candidates?.[0];
        const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
        if (!text) throw new ProviderError("gemini", `Respuesta vacía (finishReason: ${cand?.finishReason ?? "desconocido"})`);
        if (cand?.finishReason === "MAX_TOKENS") throw new ProviderError("gemini", "La respuesta se cortó por límite de tokens");
        return text;
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }
  throw new ProviderError("gemini", `No disponible tras ${MAX_ATTEMPTS} intentos (${lastError})`);
}
