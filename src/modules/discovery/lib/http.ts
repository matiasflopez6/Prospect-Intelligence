import { ProviderError } from "@/lib/errors";

export type FetchLike = typeof fetch;

/** Serializa las peticiones a un mismo servicio respetando un intervalo mínimo entre ellas. */
export class RateLimiter {
  private nextSlot = 0;
  constructor(private readonly minIntervalMs: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    const delay = slot - now;
    if (delay > 0) await sleep(delay, signal);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Cancelado"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("Cancelado"));
      },
      { once: true },
    );
  });
}

export interface RequestOptions {
  provider: string;
  fetchImpl?: FetchLike;
  limiter?: RateLimiter;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Reintentos ante 429/5xx/errores de red (no incluye el primer intento). */
  retries?: number;
  /** Base del backoff exponencial en ms. */
  backoffMs?: number;
}

/** Pausa pedida por el servidor (Retry-After en segundos o fecha), acotada. */
function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
  const date = Date.parse(h);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 30_000);
}

/** fetch con timeout, rate limit, reintentos con backoff y errores tipados (ProviderError). */
export async function requestJson<T>(url: string, init: RequestInit, opts: RequestOptions): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await opts.limiter?.wait(opts.signal);
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let waitMs = backoff * 2 ** attempt;
    try {
      const res = await fetchImpl(url, { ...init, signal });
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          throw new ProviderError(opts.provider, "Respuesta no válida (se esperaba JSON)", res.status);
        }
      }
      const body = (await res.text().catch(() => "")).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new ProviderError(opts.provider, `HTTP ${res.status}${body ? `: ${body}` : ""}`, res.status);
      if (!retryable) throw lastError;
      waitMs = retryAfterMs(res) ?? waitMs;
    } catch (e) {
      if (e instanceof ProviderError && e.status !== undefined && e.status < 500 && e.status !== 429) throw e;
      if (opts.signal?.aborted) throw e;
      if (!(e instanceof ProviderError)) {
        lastError = new ProviderError(opts.provider, `Fallo de red: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (attempt < retries) await sleep(waitMs, opts.signal);
  }
  throw lastError;
}
