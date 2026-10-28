/** Minúsculas, sin tildes ni signos: base para comparar nombres. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NAME_STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "the", "and", "of", "sa", "srl", "sas", "sc", "s", "a", "l",
]);

export function normalizeName(name: string): string {
  return foldText(name)
    .split(" ")
    .filter((t) => t && !NAME_STOPWORDS.has(t))
    .join(" ");
}

export function nameTokens(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/** Similitud de Jaccard entre los tokens de dos nombres (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Solo dígitos; null si hay muy pocos para ser un teléfono. */
export function phoneDigits(phone: string | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D+/g, "");
  return d.length >= 7 ? d : null;
}

/** Clave comparable entre formatos (+54 387 ..., 0387 15 ...): últimos 8 dígitos. */
export function phoneKey(phone: string | undefined): string | null {
  const d = phoneDigits(phone);
  return d ? d.slice(-8) : null;
}

const SHARED_HOSTS = new Set([
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
  "wa.me", "whatsapp.com", "linktr.ee", "google.com", "goo.gl", "g.page", "maps.app.goo.gl",
  "wixsite.com", "business.site", "sites.google.com", "wordpress.com", "blogspot.com", "weebly.com",
]);

/** Dominio registrable aproximado (sin www.). null si no es una web propia (red social, constructor…). */
export function websiteDomain(url: string | undefined): string | null {
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  for (const shared of SHARED_HOSTS) if (host === shared || host.endsWith(`.${shared}`)) return null;
  return host;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(ensureProtocol(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ensureProtocol(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const SOCIAL_PLATFORMS: { platform: string; hosts: string[] }[] = [
  { platform: "facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { platform: "instagram", hosts: ["instagram.com"] },
  { platform: "linkedin", hosts: ["linkedin.com"] },
  { platform: "x", hosts: ["twitter.com", "x.com"] },
  { platform: "youtube", hosts: ["youtube.com", "youtu.be"] },
  { platform: "tiktok", hosts: ["tiktok.com"] },
];

/** Identifica la red social de una URL; undefined si no es un perfil reconocible. */
export function classifySocial(url: string): { platform: string; url: string } | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  const entry = SOCIAL_PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (!entry) return undefined;
  let u: URL;
  try {
    u = new URL(ensureProtocol(url));
  } catch {
    return undefined;
  }
  const path = u.pathname.replace(/\/+$/, "");
  // Descarta enlaces de compartir/plugins: no son el perfil del negocio.
  if (!path || /^\/(sharer|share|intent|plugins|dialog|tr|login|watch|embed|hashtag|explore|p|reel|reels|policy)(\/|\.php|$)/i.test(path)) {
    return undefined;
  }
  return { platform: entry.platform, url: `https://${u.hostname.replace(/^www\./, "www.")}${path}` };
}

export function dedupeSocials(links: { platform: string; url: string }[]): { platform: string; url: string }[] {
  const seen = new Set<string>();
  const out: { platform: string; url: string }[] = [];
  for (const l of links) {
    const key = l.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}
