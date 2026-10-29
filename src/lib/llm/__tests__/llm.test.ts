import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resetEnvCache } from "../../config/env";
import { geminiComplete } from "../gemini";
import { extractJson, getLlmInfo, isLlmConfigured } from "../index";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER", "GEMINI_MODEL"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetEnvCache();
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
    expect(getLlmInfo()).toEqual({ provider: "gemini", model: "gemini-flash-latest" });
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
  const ok = (text: string, extra: object = {}) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...extra }] }), { status: 200 });

  it("llama a generateContent con la clave en cabecera (no en la URL) y devuelve el texto", async () => {
    process.env.GEMINI_API_KEY = "secret-key";
    resetEnvCache();
    const fetchImpl = vi.fn(async () => ok(" hola ")) as unknown as typeof fetch;
    const out = await geminiComplete({ system: "S", prompt: "P", json: true, maxTokens: 1000 }, fetchImpl);
    expect(out).toBe("hola");
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
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
    expect(await geminiComplete({ system: "s", prompt: "p" }, f1 as unknown as typeof fetch)).toBe("ya");
    const f2 = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    await expect(geminiComplete({ system: "s", prompt: "p" }, f2 as unknown as typeof fetch)).rejects.toThrow(/API key not valid/);
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it("si el modelo configurado ya no existe (404) pasa al siguiente sin reintentar", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_MODEL = "gemini-retirado";
    resetEnvCache();
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "no longer available" } }), { status: 404 })).mockResolvedValueOnce(ok("listo"));
    expect(await geminiComplete({ system: "s", prompt: "p" }, f as unknown as typeof fetch)).toBe("listo");
    const urls = (f as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain("gemini-retirado");
    expect(urls[1]).toContain("gemini-flash-latest");
  });

  it("falla con claridad si la respuesta se corta o está bloqueada", async () => {
    process.env.GEMINI_API_KEY = "k";
    resetEnvCache();
    await expect(geminiComplete({ system: "s", prompt: "p" }, vi.fn(async () => ok("{", { finishReason: "MAX_TOKENS" })) as unknown as typeof fetch)).rejects.toThrow(/límite de tokens/);
    await expect(
      geminiComplete({ system: "s", prompt: "p" }, vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })) as unknown as typeof fetch),
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
