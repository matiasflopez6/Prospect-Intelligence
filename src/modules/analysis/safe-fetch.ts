import dns from "node:dns/promises";
import net from "node:net";
import type { FetchErrorKind } from "./types";

/**
 * Descarga de páginas de terceros con las protecciones mínimas necesarias: solo http(s),
 * sin direcciones privadas/locales (SSRF), redirecciones validadas salto a salto, límite de
 * tamaño y de tiempo. Nunca lanza por errores de red: devuelve un resultado con `ok: false`.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; ProspectIntelligenceBot/1.0; +analisis-comercial)";
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_TIMEOUT_MS = 12_000;

export interface FetchedPage {
  ok: true;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  /** Tiempo hasta recibir las cabeceras (aprox. TTFB) medido desde este servidor. */
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  truncated: boolean;
  redirects: number;
}

export interface FetchFailure {
  ok: false;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  kind: FetchErrorKind;
  message: string;
}

export type FetchResult = FetchedPage | FetchFailure;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Solo para tests contra servidores locales. */
  allowPrivate?: boolean;
  fetchImpl?: typeof fetch;
}

/** Añade esquema si falta y valida que sea una URL http(s) utilizable. */
export function normalizeWebsiteUrl(raw: string): URL | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname.includes(".") && !net.isIP(url.hostname)) return undefined;
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.startsWith("[") ? address.slice(1, -1) : address;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
  }
  return false;
}

async function assertPublicHost(url: URL, allowPrivate: boolean): Promise<FetchFailure | undefined> {
  if (allowPrivate) return undefined;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const blocked = (message: string): FetchFailure => ({ ok: false, requestedUrl: url.toString(), kind: "blocked", message });
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return blocked("Dirección local no permitida");
  }
  if (net.isIP(host)) return isPrivateAddress(host) ? blocked("Dirección IP privada no permitida") : undefined;
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.some((a) => isPrivateAddress(a.address))) return blocked("El dominio resuelve a una dirección privada");
  } catch (e) {
    return { ok: false, requestedUrl: url.toString(), kind: "dns", message: `No se pudo resolver el dominio (${(e as NodeJS.ErrnoException).code ?? "DNS"})` };
  }
  return undefined;
}

function classifyError(e: unknown): { kind: FetchErrorKind; message: string } {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err.cause?.code ?? "";
  if (err.name === "TimeoutError" || err.name === "AbortError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return { kind: "timeout", message: "La web no respondió a tiempo" };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { kind: "dns", message: "El dominio no se pudo resolver" };
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return { kind: "refused", message: "La conexión fue rechazada o interrumpida" };
  if (/CERT|SSL|TLS|self.signed|certificate/i.test(code) || /certificate|TLS|SSL/i.test(err.cause?.message ?? "")) {
    return { kind: "tls", message: "Error de certificado HTTPS" };
  }
  return { kind: "other", message: err.cause?.message ?? err.message ?? "Error de red desconocido" };
}

async function readBody(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    chunks.push(value);
    if (bytes >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const contentType = res.headers.get("content-type") ?? "";
  const declared = contentType.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  let charset = declared;
  if (!charset) {
    const sniff = buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i);
    charset = sniff?.[1]?.toLowerCase();
  }
  let text: string;
  try {
    text = new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    text = buf.toString("utf8");
  }
  return { text, bytes, truncated };
}

export async function safeFetchHtml(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchResult> {
  const start = performance.now();
  const doFetch = opts.fetchImpl ?? fetch;
  const initial = normalizeWebsiteUrl(rawUrl);
  if (!initial) return { ok: false, requestedUrl: rawUrl, kind: "invalid-url", message: "La dirección web no es válida" };
  let url: URL = initial;
  const requestedUrl = url.toString();
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const guard = await assertPublicHost(url, opts.allowPrivate ?? false);
      if (guard) return { ...guard, requestedUrl };
      const headersStart = performance.now();
      const res: Response = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "es-ES,es;q=0.9,en;q=0.5",
        },
      });
      const ttfbMs = Math.round(performance.now() - headersStart);

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel().catch(() => undefined);
        const next: URL = new URL(res.headers.get("location")!, url);
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          return { ok: false, requestedUrl, finalUrl: url.toString(), status: res.status, kind: "blocked", message: "Redirección a un protocolo no permitido" };
        }
        url = next;
        continue;
      }

      const finalUrl = url.toString();
      if (res.status >= 400) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, requestedUrl, finalUrl, status: res.status, kind: "http", message: `La web respondió con HTTP ${res.status}` };
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, requestedUrl, finalUrl, status: res.status, kind: "not-html", message: `Contenido no HTML (${contentType.split(";")[0]})` };
      }
      const body = await readBody(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
      return {
        ok: true,
        requestedUrl,
        finalUrl,
        status: res.status,
        html: body.text,
        ttfbMs,
        totalMs: Math.round(performance.now() - start),
        bytes: body.bytes,
        truncated: body.truncated,
        redirects: hop,
      };
    }
    return { ok: false, requestedUrl, finalUrl: url.toString(), kind: "other", message: "Demasiadas redirecciones" };
  } catch (e) {
    const { kind, message } = classifyError(e);
    return { ok: false, requestedUrl, finalUrl: url.toString(), kind, message };
  }
}
