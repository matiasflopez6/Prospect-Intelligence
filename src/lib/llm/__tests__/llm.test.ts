import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resetEnvCache } from "../../config/env";
import { geminiComplete, resetGeminiState } from "../gemini";
import { acquireSlot, resetRateLimiter, type LimiterClock } from "../rate-limiter";
import { extractJson, getLlmInfo, isLlmConfigured } from "../index";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "GEMINI_RPM", "GEMINI_MAX_RETRIES"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetEnvCache();
  resetGeminiState();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("getLlmInfo", () => {
  it("sin claves no hay IA", () => {
    expect(getLlmInfo()).toBeUndefined();
    expect(isLlmConfigured()).toBe(false);
  });
  it("usa Gemini si solo hay clave de Gemini", () => {
    process.env.GEMINI_API_KEY = "g";
    resetEnvCache();
    expect(getLlmInfo()).toEqual({ provider: "gemini", model: "gemini-3.5-flash-lite" });
  });
  it("con ambas prefiere Anthropic salvo LLM_PROVIDER", () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.ANTHROPIC_API_KEY = "a";
    resetEnvCache();
    expect(getLlmInfo()?.provider).toBe("anthropic");
    process.env.LLM_PROVIDER = "gemini";
    resetEnvCache();
    expect(getLlmInfo()?.provider).toBe("gemini");
  });
  it("LLM_PROVIDER sin clave de ese proveedor cae al que sí tiene clave", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.LLM_PROVIDER = "gemini";
    resetEnvCache();
    expect(getLlmInfo()?.provider).toBe("anthropic");
  });
});

describe("geminiComplete", () => {
  const fakeClock = (start = 1_000_000) => {
    let t = start;
    const slept: number[] = [];
    const clock: LimiterClock = { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } };
    return { clock, slept };
  };
  const ok = (text: string, extra: object = {}) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...extra }] }), { status: 200 });

  it("llama a generateContent con la clave en cabecera (no en la URL) y devuelve el texto", async () => {
    process.env.GEMINI_API_KEY = "secret-key";
    resetEnvCache();
    const fetchImpl = vi.fn(async () => ok(" hola ")) as unknown as typeof fetch;
    const out = await geminiComplete({ system: "S", prompt: "P", json: true, maxTokens: 1000 }, { fetchImpl, clock: fakeClock().clock });
    expect(out).toBe("hola");
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("S");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(2000);
  });

  it("reintenta en 429/5xx y no en 4xx", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    const f1 = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(ok("ya"));
    expect(await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f1 as unknown as typeof fetch, clock: fakeClock().clock })).toBe("ya");
    const f2 = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    await expect(geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f2 as unknown as typeof fetch, clock: fakeClock().clock })).rejects.toThrow(/API key not valid/);
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it("si el modelo configurado ya no existe (404) pasa al siguiente sin reintentar", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_MODEL = "gemini-retirado";
    resetEnvCache();
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "no longer available" } }), { status: 404 })).mockResolvedValueOnce(ok("listo"));
    expect(await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock: fakeClock().clock })).toBe("listo");
    const urls = (f as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain("gemini-retirado");
    expect(urls[1]).toContain("gemini-3.8-flash");
  });

  const err429 = (extra: object = {}) => new Response(JSON.stringify({ error: { message: "quota", ...extra } }), { status: 429 });
  const calls = (f: unknown) => (f as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);

  it("ante un 429 por minuto espera el retryDelay de Google y reintenta en vez de fallar", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    const { clock, slept } = fakeClock();
    const f = vi.fn()
      .mockResolvedValueOnce(err429({ details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "23s" }] }))
      .mockResolvedValueOnce(ok("ok tras esperar"));
    expect(await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock })).toBe("ok tras esperar");
    expect(slept[0]).toBeGreaterThanOrEqual(23_000);
    expect(slept[0]).toBeLessThan(25_000);
    expect(new Set(calls(f)).size).toBe(1); // mismo modelo, sin saltar al de respaldo
  });

  it("respeta la cabecera Retry-After", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    const { clock, slept } = fakeClock();
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "7" } }))
      .mockResolvedValueOnce(ok("ok"));
    await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock });
    expect(slept[0]).toBeGreaterThanOrEqual(7_000);
    expect(slept[0]).toBeLessThan(8_000);
  });

  it("si el 429 persiste agota los reintentos y pasa al modelo de respaldo; sin ninguno disponible falla indicando cuota", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_MAX_RETRIES = "2";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-3.8-flash";
    resetEnvCache();
    const f = vi.fn().mockResolvedValueOnce(err429()).mockResolvedValueOnce(err429()).mockResolvedValueOnce(err429()).mockResolvedValueOnce(ok("desde 3.8"));
    expect(await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock: fakeClock().clock })).toBe("desde 3.8");
    expect(calls(f).map((u) => u.match(/models\/([^:]+):/)![1])).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]);

    resetGeminiState();
    const all429 = vi.fn(async () => err429());
    await expect(geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: all429 as unknown as typeof fetch, clock: fakeClock().clock })).rejects.toMatchObject({ status: 429, message: /Cuota de Gemini agotada/ });
  });

  it("la cuota diaria no se espera: salta al siguiente modelo y recuerda que el primero está agotado", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-3.8-flash";
    resetEnvCache();
    const { clock, slept } = fakeClock();
    const daily = () => err429({ details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] });
    const f = vi.fn().mockResolvedValueOnce(daily()).mockImplementation(async () => ok("ok"));
    await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock });
    expect(slept).toEqual([]);
    expect(calls(f)).toHaveLength(2);
    await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock });
    expect(calls(f).slice(2).every((u) => u.includes("gemini-3.8-flash"))).toBe(true);
  });

  it("limita las peticiones a GEMINI_RPM por minuto antes de enviarlas", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_RPM = "3";
    resetEnvCache();
    const { clock } = fakeClock();
    const sentAt: number[] = [];
    const f = vi.fn(async () => { sentAt.push(clock.now()); return ok("ok"); });
    for (let i = 0; i < 7; i++) await geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: f as unknown as typeof fetch, clock });
    // En cualquier ventana de 60 s hay como máximo 3 peticiones.
    for (const t of sentAt) expect(sentAt.filter((x) => x >= t && x < t + 60_000).length).toBeLessThanOrEqual(3);
    expect(sentAt[6]! - sentAt[0]!).toBeGreaterThanOrEqual(120_000);
  });

  it("falla con claridad si la respuesta se corta o está bloqueada", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    await expect(geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: vi.fn(async () => ok("{", { finishReason: "MAX_TOKENS" })) as unknown as typeof fetch, clock: fakeClock().clock })).rejects.toThrow(/límite de tokens/);
    await expect(
      geminiComplete({ system: "s", prompt: "p" }, { fetchImpl: vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })) as unknown as typeof fetch, clock: fakeClock().clock }),
    ).rejects.toThrow(/bloqueada/);
  });

  it("sin clave lanza MissingCredentialError", async () => {
    await expect(geminiComplete({ system: "s", prompt: "p" })).rejects.toMatchObject({ name: "MissingCredentialError" });
  });
});

describe("completeJson con Gemini", () => {
  it("valida el JSON y reintenta una vez si no cumple el esquema", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    const responses = ["no es json", '```json\n{"a": 1}\n```'];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: responses.shift()! }] } }] }), { status: 200 }));
    const { completeJson } = await import("../index");
    expect(await completeJson({ system: "s", prompt: "p", schema: z.object({ a: z.number() }) })).toEqual({ a: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it("extractJson ignora vallas de código y texto alrededor", () => {
    expect(extractJson('texto {"x":1} fin')).toBe('{"x":1}');
  });
});

describe("acquireSlot", () => {
  it("cuenta cada modelo por separado", async () => {
    resetRateLimiter();
    let t = 0;
    const clock: LimiterClock = { now: () => t, sleep: async (ms) => { t += ms; } };
    expect(await acquireSlot("a", 1, clock)).toBe(0);
    expect(await acquireSlot("b", 1, clock)).toBe(0);
    expect(await acquireSlot("a", 1, clock)).toBeGreaterThanOrEqual(60_000);
  });
});
