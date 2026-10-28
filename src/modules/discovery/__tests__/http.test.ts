import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/errors";
import { RateLimiter, requestJson } from "../lib/http";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("requestJson", () => {
  it("reintenta ante 503 y devuelve la respuesta buena", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(json({ ok: 1 }));
    const res = await requestJson<{ ok: number }>("https://x.test", {}, { provider: "t", fetchImpl, backoffMs: 1 });
    expect(res.ok).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("no reintenta ante 4xx (error de petición) y lo tipa como ProviderError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad key", { status: 403 }));
    const err = (await requestJson("https://x.test", {}, { provider: "t", fetchImpl, backoffMs: 1 }).catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("agota los reintentos con 429 y respeta Retry-After", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("slow down", { status: 429, headers: { "retry-after": "0" } }));
    const err = (await requestJson("https://x.test", {}, { provider: "t", fetchImpl, retries: 2, backoffMs: 1 }).catch((e: unknown) => e)) as ProviderError;
    expect(err.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("convierte fallos de red en ProviderError tras reintentar", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const err = (await requestJson("https://x.test", {}, { provider: "t", fetchImpl, retries: 1, backoffMs: 1 }).catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toContain("Fallo de red");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falla con ProviderError si la respuesta no es JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(requestJson("https://x.test", {}, { provider: "t", fetchImpl })).rejects.toThrow(/JSON/);
  });
});

describe("RateLimiter", () => {
  it("separa las peticiones por el intervalo mínimo", async () => {
    const limiter = new RateLimiter(40);
    const t0 = Date.now();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(75);
  });
});
