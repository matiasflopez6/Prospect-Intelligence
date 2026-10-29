/**
 * Limitador de peticiones por minuto (ventana deslizante), una por clave (p. ej. un modelo de Gemini).
 * Garantiza que nunca se envíen más de `limit` peticiones en cualquier ventana de 60 s, así que
 * tampoco en ningún minuto natural. Quien excede el límite espera su turno en lugar de fallar.
 * El estado vive en `globalThis` porque Next puede cargar este módulo más de una vez (servidor y
 * instrumentation) y la cuota es del proceso, no del módulo.
 */

const WINDOW_MS = 60_000;
const SAFETY_MS = 250;

export interface LimiterClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: LimiterClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

const g = globalThis as unknown as { __llmRateWindows?: Map<string, number[]> };
const windows: Map<string, number[]> = (g.__llmRateWindows ??= new Map());

/** Espera hasta tener hueco bajo `limit` peticiones/minuto para `key` y lo reserva. Devuelve ms esperados. */
export async function acquireSlot(key: string, limit: number, clock: LimiterClock = realClock): Promise<number> {
  const stamps = windows.get(key) ?? [];
  windows.set(key, stamps);
  const start = clock.now();
  for (;;) {
    const now = clock.now();
    while (stamps.length > 0 && now - stamps[0]! >= WINDOW_MS + SAFETY_MS) stamps.shift();
    if (stamps.length < limit) {
      stamps.push(now);
      return now - start;
    }
    await clock.sleep(Math.max(50, stamps[0]! + WINDOW_MS + SAFETY_MS - now));
  }
}

/** Solo para tests. */
export function resetRateLimiter(): void {
  windows.clear();
}
