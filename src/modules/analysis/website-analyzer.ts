import { getEnv } from "@/lib/config/env";
import { extractPageSignals, type PageSignals } from "./html-signals";
import { normalizeWebsiteUrl, safeFetchHtml, type SafeFetchOptions } from "./safe-fetch";
import type { WebsiteAnalyzer, WebsiteSignals } from "./types";

const MAX_EXTRA_PAGES = 2;
const BOOKING_PATH = /(reserva|booking|turno|cita|appointment|agenda)/i;

export interface WebsiteAnalyzerOptions extends SafeFetchOptions {
  /** Consulta PageSpeed Insights (red externa, lenta). Por defecto activo salvo allowPrivate. */
  pageSpeed?: boolean;
  pageSpeedFetch?: typeof fetch;
}

/** Analizador real: descarga la portada y hasta 2 páginas relevantes (contacto/reservas) del mismo dominio. */
export function createWebsiteAnalyzer(opts: WebsiteAnalyzerOptions = {}): WebsiteAnalyzer {
  return {
    async analyze({ url }) {
      return analyzeWebsite(url, opts);
    },
  };
}

export async function analyzeWebsite(url: string, opts: WebsiteAnalyzerOptions = {}): Promise<WebsiteSignals> {
  const fetchedAt = new Date();
  const normalized = normalizeWebsiteUrl(url);
  if (!normalized) {
    return { url, fetchedAt, reachable: false, fetchError: "La dirección web no es válida", fetchErrorKind: "invalid-url" };
  }

  // Si la URL guardada es https y falla por TLS/conexión, se reintenta por http para distinguir "sin HTTPS" de "caída".
  let home = await safeFetchHtml(normalized.toString(), opts);
  if (!home.ok && normalized.protocol === "https:" && (home.kind === "tls" || home.kind === "refused")) {
    const http = new URL(normalized);
    http.protocol = "http:";
    const retry = await safeFetchHtml(http.toString(), opts);
    if (retry.ok) home = retry;
  }
  if (!home.ok) {
    return {
      url: normalized.toString(),
      finalUrl: home.finalUrl,
      fetchedAt,
      reachable: false,
      httpStatus: home.status,
      fetchError: home.message,
      fetchErrorKind: home.kind,
    };
  }

  const pages: PageSignals[] = [extractPageSignals(home.html, home.finalUrl)];
  const homePage = pages[0]!;

  // Páginas adicionales: contacto y reservas (una de cada), del mismo origen.
  const visited = new Set([home.finalUrl.replace(/\/$/, "")]);
  const queue: string[] = [];
  for (const kind of ["contact", "booking"] as const) {
    const link = homePage.followLinks.find((l) => l.kind === kind && !visited.has(l.url.replace(/\/$/, "")));
    if (link) queue.push(link.url);
  }
  for (const next of queue.slice(0, MAX_EXTRA_PAGES)) {
    const res = await safeFetchHtml(next, opts);
    if (res.ok) {
      visited.add(next.replace(/\/$/, ""));
      pages.push(extractPageSignals(res.html, res.finalUrl));
    }
  }

  const signals = mergePages(normalized.toString(), home, pages, fetchedAt);

  if ((opts.pageSpeed ?? !opts.allowPrivate) && signals.https) {
    signals.performance = await fetchPageSpeed(home.finalUrl, opts.pageSpeedFetch ?? fetch);
  }
  return signals;
}

function uniq<T>(items: T[], key: (item: T) => string = (i) => String(i)): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Une las señales de varias páginas en un único WebsiteSignals. La portada manda para título/H1/etc. */
export function mergePages(
  requestedUrl: string,
  home: Extract<Awaited<ReturnType<typeof safeFetchHtml>>, { ok: true }>,
  pages: PageSignals[],
  fetchedAt: Date,
): WebsiteSignals {
  const first = pages[0]!;
  const bookingUrlsAll = uniq(pages.flatMap((p) => p.bookingUrls));
  const bookingVendor = pages.map((p) => p.bookingVendor).find(Boolean);
  const bookingPathLinks = uniq(
    pages.flatMap((p) => p.ctas.filter((c) => c.kind === "booking" && c.href && !/^(tel|mailto|whatsapp):|wa\.me/i.test(c.href) && BOOKING_PATH.test(safePath(c.href))).map((c) => c.href!)),
  );
  const bookingDetected = Boolean(bookingVendor) || bookingPathLinks.length > 0;
  const chatVendor = pages.map((p) => p.chatVendor).find(Boolean);
  const forms = pages.flatMap((p) => p.forms);
  const social = uniq(pages.flatMap((p) => p.social), (s) => `${s.platform}|${s.url.toLowerCase()}`);
  const phones = uniq(pages.flatMap((p) => p.phones)).slice(0, 6);
  const emails = uniq(pages.flatMap((p) => p.emails)).slice(0, 6);
  const whatsappLinks = uniq(pages.flatMap((p) => p.whatsappLinks)).slice(0, 4);
  const ctas = uniq(pages.flatMap((p) => p.ctas), (c) => `${c.kind}|${c.text.toLowerCase()}`).slice(0, 25);
  const hints = uniq(pages.flatMap((p) => p.responsiveHints));
  const finalUrl = home.finalUrl;

  return {
    url: requestedUrl,
    finalUrl,
    fetchedAt,
    reachable: true,
    httpStatus: home.status,
    https: finalUrl.startsWith("https:"),
    responseTimeMs: home.ttfbMs,
    htmlBytes: home.bytes,
    title: first.title,
    metaDescription: first.metaDescription,
    h1: first.h1,
    lang: first.lang,
    textExcerpt: first.text.slice(0, 600),
    wordCount: first.wordCount,
    copyrightYear: first.copyrightYear,
    likelyClientRendered: first.likelyClientRendered,
    mobile: { viewportMeta: first.viewportMeta, responsiveHints: hints },
    contact: {
      phones,
      emails,
      whatsappLinks,
      whatsappWidget: pages.some((p) => p.whatsappWidget),
      hasClickToCall: pages.some((p) => p.hasClickToCall),
      hasContactPage: pages.some((p) => p.isContactPage) || first.followLinks.some((l) => l.kind === "contact"),
    },
    forms: { count: forms.length, items: forms },
    booking: { detected: bookingDetected, vendor: bookingVendor, urls: uniq([...bookingUrlsAll, ...bookingPathLinks]).slice(0, 4) },
    chat: { detected: Boolean(chatVendor), vendor: chatVendor },
    ctas,
    social,
    tech: {
      cms: pages.map((p) => p.tech.cms).find(Boolean),
      analytics: uniq(pages.flatMap((p) => p.tech.analytics)),
      pixels: uniq(pages.flatMap((p) => p.tech.pixels)),
      crm: uniq(pages.flatMap((p) => p.tech.crm)),
    },
    pagesVisited: pages.map((p) => p.url),
  };
}

function safePath(href: string): string {
  try {
    return new URL(href).pathname;
  } catch {
    return href;
  }
}

/** PageSpeed Insights (móvil). Cualquier fallo (cuota, red, timeout) devuelve undefined: es una señal opcional. */
export async function fetchPageSpeed(url: string, fetchImpl: typeof fetch = fetch): Promise<WebsiteSignals["performance"]> {
  const key = getEnv().PAGESPEED_API_KEY;
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("category", "performance");
  if (key) api.searchParams.set("key", key);
  try {
    const res = await fetchImpl(api, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number | null } };
        audits?: Record<string, { numericValue?: number }>;
      };
    };
    const lh = json.lighthouseResult;
    const score = lh?.categories?.performance?.score;
    if (score == null) return undefined;
    return {
      source: "pagespeed",
      mobileScore: Math.round(score * 100),
      lcpMs: round(lh?.audits?.["largest-contentful-paint"]?.numericValue),
      cls: lh?.audits?.["cumulative-layout-shift"]?.numericValue,
      tbtMs: round(lh?.audits?.["total-blocking-time"]?.numericValue),
    };
  } catch {
    return undefined;
  }
}

function round(n: number | undefined): number | undefined {
  return n == null ? undefined : Math.round(n);
}
