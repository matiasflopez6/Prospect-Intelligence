import { lookup } from "node:dns/promises";
import net from "node:net";
import { classifySocial, dedupeSocials, ensureProtocol, hostOf } from "./lib/normalize";
import type { FetchLike } from "./lib/http";

/**
 * Enriquecimiento ligero desde la web propia del negocio: email, redes sociales enlazadas y WhatsApp.
 * No es el análisis de calidad de la web (eso es del módulo de análisis): solo recoge datos de contacto
 * públicos de la home y, si hace falta, de una página de contacto.
 *
 * Seguridad: solo http(s), se bloquean hosts que resuelven a redes privadas/locales (SSRF), con límites de
 * tamaño, tiempo y redirecciones, y se respeta robots.txt.
 */

const USER_AGENT = "ProspectIntelligenceBot/0.1 (+https://github.com/matiasflopez6/Prospect-Intelligence)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_PAGES = 3;

export interface WebsiteEnrichment {
  finalUrl?: string;
  pagesVisited: string[];
  emails: string[];
  /** Mejor email para contacto (mismo dominio que la web, no genérico de sistema). */
  email?: string;
  socialLinks: { platform: string; url: string }[];
  whatsapp?: string;
  phones: string[];
  /** Si no se pudo leer la web, por qué (no es un error del sistema: p. ej. robots o 403). */
  note?: string;
}

export interface WebsiteDeps {
  fetchImpl?: FetchLike;
  /** Para tests: omite la resolución DNS. */
  skipDnsCheck?: boolean;
  signal?: AbortSignal;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublicHost(url: URL, skipDns: boolean): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Protocolo no permitido");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Host local no permitido");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("IP privada no permitida");
    return;
  }
  if (skipDns) return;
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("El host resuelve a una red privada");
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

interface Fetched {
  url: string;
  html: string;
}

async function fetchPage(start: string, deps: WebsiteDeps, opts: { anyText?: boolean } = {}): Promise<Fetched> {
  const f = deps.fetchImpl ?? fetch;
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, deps.skipDnsCheck ?? false);
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await f(url.toString(), {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es,en;q=0.8" },
      signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirección sin destino (HTTP ${res.status})`);
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!opts.anyText && type && !/html|xml/i.test(type)) throw new Error(`Contenido no HTML (${type})`);
    return { url: url.toString(), html: await readLimited(res) };
  }
  throw new Error("Demasiadas redirecciones");
}

/** Reglas Disallow del grupo "*" de robots.txt. Si no se puede leer, se asume permitido. */
async function robotsDisallowed(origin: string, deps: WebsiteDeps): Promise<string[]> {
  try {
    const { html } = await fetchPage(`${origin}/robots.txt`, deps, { anyText: true }).catch(() => ({ html: "" }));
    const rules: string[] = [];
    let applies = false;
    for (const raw of html.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
      if (!m) continue;
      const field = (m[1] ?? "").toLowerCase();
      const value = (m[2] ?? "").trim();
      if (field === "user-agent") applies = value === "*" || /prospectintelligence/i.test(value);
      else if (applies && field === "disallow" && value) rules.push(value);
    }
    return rules;
  } catch {
    return [];
  }
}

function allowedByRobots(url: string, disallowed: string[]): boolean {
  const u = new URL(url);
  const path = u.pathname + u.search;
  return !disallowed.some((rule) => {
    const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    return new RegExp(`^${pattern}`).test(path);
  });
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const JUNK_EMAIL_DOMAINS = /(^|\.)(example\.(com|org)|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|domain\.com|email\.com|yoursite\.com|tudominio\.com)$/i;
const JUNK_EMAIL_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|root|usuario|user|name|nombre|email|correo|tucorreo|you)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|avif|css|js|woff2?|ico)$/i;

/** Decodifica entidades básicas y ofuscaciones habituales (&#64;, [at], (arroba)). */
function deobfuscate(html: string): string {
  return html
    .replace(/&#(x?[0-9a-f]+);/gi, (_, n: string) => {
      const code = n.toLowerCase().startsWith("x") ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&commat;|&#64;/gi, "@")
    .replace(/\s*[\[(]\s*(?:at|arroba)\s*[\])]\s*/gi, "@")
    .replace(/&amp;/gi, "&");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function extractEmails(html: string): string[] {
  const text = deobfuscate(html);
  const found = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    for (const part of safeDecode(m[1] ?? "").split(",")) found.add(part.trim().toLowerCase());
  }
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => {
    const [local = "", domain = ""] = e.split("@");
    return Boolean(local && domain) && !ASSET_EXT.test(e) && !JUNK_EMAIL_DOMAINS.test(domain) && !JUNK_EMAIL_LOCAL.test(local) && local.length <= 64;
  });
}

export function extractWhatsapp(html: string): string | undefined {
  const text = deobfuscate(html);
  const wa = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?[^"'\s]*?phone=|web\.whatsapp\.com\/send\?[^"'\s]*?phone=|whatsapp:\/\/send\?[^"'\s]*?phone=)\+?(\d{8,15})/i.exec(text);
  return wa ? `+${wa[1]}` : undefined;
}

export function extractTelLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of deobfuscate(html).matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const tel = safeDecode(m[1] ?? "").trim();
    if (tel.replace(/\D/g, "").length >= 7) out.add(tel);
  }
  return [...out];
}

export function extractSocialLinks(html: string): { platform: string; url: string }[] {
  const links: { platform: string; url: string }[] = [];
  for (const m of deobfuscate(html).matchAll(/href=["'](https?:\/\/[^"'#\s]+)/gi)) {
    const s = classifySocial(m[1] ?? "");
    if (s) links.push(s);
  }
  return dedupeSocials(links);
}

/** Enlaces internos a páginas de contacto (para buscar email si la home no lo trae). */
export function findContactLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const baseHost = hostOf(base);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? "";
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ");
    if (!/contact|contacto|contactanos|contactenos|nosotros|about|donde-estamos|ubicacion/i.test(`${href} ${label}`)) continue;
    try {
      const u = new URL(href, base);
      if (hostOf(u.toString()) !== baseHost || !/^https?:$/.test(u.protocol)) continue;
      out.add(u.toString());
    } catch {
      /* enlace inválido */
    }
  }
  return [...out].slice(0, MAX_PAGES - 1);
}

/** Elige el email de contacto más probable: del dominio de la web y con buzones comerciales primero. */
export function pickBestEmail(emails: string[], websiteHost: string | null): string | undefined {
  const preferredLocal = /^(info|contacto|contact|hola|ventas|consultas|turnos|reservas|administracion|recepcion|secretaria)/i;
  const score = (e: string) => {
    const [local = "", domain = ""] = e.split("@");
    let s = 0;
    if (websiteHost && (domain === websiteHost || domain.endsWith(`.${websiteHost}`) || websiteHost.endsWith(`.${domain}`))) s += 4;
    if (preferredLocal.test(local)) s += 2;
    if (/^(gmail|hotmail|outlook|yahoo)\./i.test(domain)) s += 1; // negocios pequeños usan correo personal: sigue siendo válido
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

export async function enrichFromWebsite(website: string, deps: WebsiteDeps = {}): Promise<WebsiteEnrichment> {
  const result: WebsiteEnrichment = { pagesVisited: [], emails: [], socialLinks: [], phones: [] };
  let start: URL;
  try {
    start = new URL(ensureProtocol(website));
    if (!hostOf(start.toString())) throw new Error("URL inválida");
  } catch {
    result.note = "URL de la web no válida";
    return result;
  }

  const disallowed = await robotsDisallowed(start.origin, deps);
  if (!allowedByRobots(start.toString(), disallowed)) {
    result.note = "robots.txt no permite leer la web";
    return result;
  }

  const queue = [start.toString()];
  const seen = new Set<string>();
  const allHtml: string[] = [];
  while (queue.length && result.pagesVisited.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!allowedByRobots(url, disallowed)) continue;
    try {
      const page = await fetchPage(url, deps);
      result.pagesVisited.push(page.url);
      if (result.pagesVisited.length === 1) {
        result.finalUrl = page.url;
        // Tras redirecciones, comprobamos robots del destino sin volver a pedirlo: se asume el mismo sitio.
        queue.push(...findContactLinks(page.html, page.url));
      }
      allHtml.push(page.html);
      // Si la home ya trae email, no hace falta visitar más páginas.
      if (extractEmails(page.html).length > 0) break;
    } catch (e) {
      if (result.pagesVisited.length === 0) result.note = `No se pudo leer la web: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const html = allHtml.join("\n");
  result.emails = extractEmails(html);
  result.email = pickBestEmail(result.emails, hostOf(result.finalUrl ?? start.toString()));
  result.socialLinks = extractSocialLinks(html);
  result.whatsapp = extractWhatsapp(html);
  result.phones = extractTelLinks(html);
  return result;
}
