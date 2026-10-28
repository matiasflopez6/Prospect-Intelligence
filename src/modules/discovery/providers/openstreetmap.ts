import { getEnv } from "@/lib/config/env";
import { ProviderError } from "@/lib/errors";
import { RateLimiter, requestJson, type FetchLike } from "../lib/http";
import { classifySocial, dedupeSocials, ensureProtocol } from "../lib/normalize";
import { resolveNiche, type NicheProfile } from "../lib/niche";
import type { DiscoveredBusiness, DiscoveryProvider, DiscoveryQuery, ProviderContext } from "../types";

/**
 * OpenStreetMap: Nominatim (geocodifica la ubicación) + Overpass (negocios de esa zona).
 * Sin clave. La política de uso de OSM exige un User-Agent que identifique la aplicación;
 * OSM_CONTACT (email o URL) es opcional y se añade a ese User-Agent.
 *
 * Limitaciones reales de la fuente (se muestran tal cual, no se rellenan): OSM no tiene valoraciones ni
 * reseñas, y teléfono/web/horarios solo aparecen cuando algún colaborador los cargó.
 */

const PROVIDER = "openstreetmap";
const DEFAULT_NOMINATIM = "https://nominatim.openstreetmap.org/search";
const FALLBACK_OVERPASS = ["https://overpass.kumi.systems/api/interpreter"];
/** Techo de elementos que se piden a Overpass (la zona puede tener muchos más). */
const MAX_ELEMENTS = 1500;

export interface OsmDeps {
  fetchImpl?: FetchLike;
  nominatimUrl?: string;
  /** Instancias de Overpass a probar en orden. */
  overpassUrls?: string[];
  contact?: () => string | undefined;
  nominatimLimiter?: RateLimiter;
  overpassLimiter?: RateLimiter;
  retries?: number;
  backoffMs?: number;
}

interface NominatimResult {
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  display_name?: string;
  boundingbox?: [string, string, string, string]; // south, north, west, east
  class?: string;
  type?: string;
  importance?: number;
  address?: Record<string, string>;
}

export interface GeocodedPlace {
  displayName: string;
  /** Id de área de Overpass cuando el lugar es una relación/vía (límite administrativo). */
  areaId?: number;
  bbox?: { south: number; north: number; west: number; east: number };
  city?: string;
  region?: string;
  country?: string;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string;
}

export function createOpenStreetMapProvider(deps: OsmDeps = {}): DiscoveryProvider {
  const nominatimLimiter = deps.nominatimLimiter ?? new RateLimiter(1100); // política OSM: ≤ 1 req/s
  const overpassLimiter = deps.overpassLimiter ?? new RateLimiter(1000);
  const geocodeCache = new Map<string, GeocodedPlace>();

  const userAgent = () => {
    const contact = (deps.contact ?? (() => getEnv().OSM_CONTACT))();
    return `ProspectIntelligence/0.1 (${contact ?? "+https://github.com/matiasflopez6/Prospect-Intelligence"})`;
  };

  async function geocode(location: string, ctx: ProviderContext): Promise<GeocodedPlace> {
    const cached = geocodeCache.get(location);
    if (cached) return cached;
    const url = new URL(deps.nominatimUrl ?? DEFAULT_NOMINATIM);
    url.searchParams.set("q", location);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "es");
    const results = await requestJson<NominatimResult[]>(
      url.toString(),
      { headers: { "User-Agent": userAgent(), Accept: "application/json" } },
      { provider: PROVIDER, fetchImpl: deps.fetchImpl, limiter: nominatimLimiter, signal: ctx.signal, retries: deps.retries, backoffMs: deps.backoffMs },
    );
    const place = pickPlace(results);
    if (!place) throw new ProviderError(PROVIDER, `No se encontró la ubicación "${location}" en Nominatim`);
    geocodeCache.set(location, place);
    return place;
  }

  async function overpass(query: string, ctx: ProviderContext): Promise<OverpassElement[]> {
    const urls = deps.overpassUrls ?? [getEnv().OVERPASS_URL, ...FALLBACK_OVERPASS];
    let lastError: unknown;
    for (const url of urls) {
      try {
        const res = await requestJson<OverpassResponse>(
          url,
          {
            method: "POST",
            headers: { "User-Agent": userAgent(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({ data: query }).toString(),
          },
          { provider: PROVIDER, fetchImpl: deps.fetchImpl, limiter: overpassLimiter, signal: ctx.signal, timeoutMs: 90_000, retries: deps.retries ?? 1, backoffMs: deps.backoffMs },
        );
        // Overpass devuelve 200 con "remark" si se queda sin tiempo/memoria: los datos pueden ser parciales.
        if (res.remark && /error|timed out|out of memory/i.test(res.remark) && !res.elements?.length) {
          throw new ProviderError(PROVIDER, `Overpass: ${res.remark}`);
        }
        return res.elements ?? [];
      } catch (e) {
        if (ctx.signal?.aborted) throw e;
        lastError = e;
        ctx.log(`Overpass ${new URL(url).host} falló: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw lastError;
  }

  return {
    id: PROVIDER,
    label: "OpenStreetMap",
    description: "Fuente abierta y gratuita, sin clave. Sin valoraciones ni reseñas; teléfono, web y horarios solo si están cargados en el mapa.",
    requiredEnv: [],
    availability() {
      return {
        configured: true,
        missingEnv: [],
        note: "No requiere clave. OSM_CONTACT (opcional) identifica tu aplicación ante OpenStreetMap, como pide su política de uso.",
      };
    },
    async search(query: DiscoveryQuery, ctx: ProviderContext): Promise<DiscoveredBusiness[]> {
      const place = await geocode(query.location, ctx);
      ctx.log(`Ubicación resuelta: ${place.displayName}`);
      const resolved = resolveNiche(query.niche);
      if (!resolved.profile && resolved.keywords.length === 0) {
        throw new ProviderError(PROVIDER, `No se pudo interpretar el nicho "${query.niche}"`);
      }
      if (!resolved.profile) {
        ctx.log(`Nicho "${query.niche}" sin etiqueta OSM conocida: se busca por nombre (${resolved.keywords.join(", ")}); la precisión es menor.`);
      }
      const elements = await overpass(buildOverpassQuery(place, resolved.profile, resolved.keywords), ctx);
      const fetchedAt = new Date();
      const businesses = elements
        .map((el) => toBusiness(el, place, resolved.profile, fetchedAt))
        .filter((b): b is DiscoveredBusiness => b !== null);
      ctx.log(`Overpass devolvió ${elements.length} elementos, ${businesses.length} con nombre`);
      return businesses.sort((a, b) => completeness(b) - completeness(a)).slice(0, Math.max(query.limit, 1));
    },
  };
}

function pickPlace(results: NominatimResult[]): GeocodedPlace | undefined {
  // Preferimos límites administrativos/lugares (ciudades) sobre calles o negocios homónimos.
  const ranked = [...results].sort((a, b) => placeRank(b) - placeRank(a));
  const r = ranked[0];
  if (!r) return undefined;
  const addr = r.address ?? {};
  const [south, north, west, east] = (r.boundingbox ?? []).map(Number);
  const place: GeocodedPlace = {
    displayName: r.display_name ?? "",
    city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county,
    region: addr.state ?? addr.region,
    country: addr.country,
  };
  if (r.osm_type === "relation" && r.osm_id) place.areaId = 3_600_000_000 + r.osm_id;
  else if (r.osm_type === "way" && r.osm_id) place.areaId = 2_400_000_000 + r.osm_id;
  if ([south, north, west, east].every((n) => n !== undefined && Number.isFinite(n))) {
    place.bbox = { south: south!, north: north!, west: west!, east: east! };
  }
  if (place.areaId === undefined && !place.bbox) return undefined;
  return place;
}

function placeRank(r: NominatimResult): number {
  let s = r.importance ?? 0;
  if (r.class === "boundary" || r.class === "place") s += 1;
  if (r.osm_type === "relation") s += 0.5;
  return s;
}

function escapeOverpass(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildOverpassQuery(place: GeocodedPlace, profile: NicheProfile | undefined, keywords: string[]): string {
  const scope = place.areaId
    ? `area(${place.areaId})->.a;`
    : `// bbox`;
  const filter = place.areaId
    ? "(area.a)"
    : `(${place.bbox!.south},${place.bbox!.west},${place.bbox!.north},${place.bbox!.east})`;
  const clauses: string[] = [];
  if (profile) {
    for (const [k, v] of profile.tags) {
      clauses.push(v ? `nwr["${k}"="${escapeOverpass(v)}"]${filter};` : `nwr["${k}"]${filter};`);
    }
  } else {
    const kw = escapeOverpass(keywords.join("|"));
    clauses.push(`nwr["name"~"${kw}",i][~"^(amenity|shop|office|healthcare|craft|tourism|leisure)$"~"."]${filter};`);
  }
  return `[out:json][timeout:60];\n${scope}\n(\n  ${clauses.join("\n  ")}\n);\nout tags center ${MAX_ELEMENTS};`;
}

const HUMAN_CATEGORY: Record<string, string> = {
  dentist: "Dentista",
  clinic: "Clínica",
  doctors: "Médico",
  doctor: "Médico",
  hospital: "Hospital",
  pharmacy: "Farmacia",
  veterinary: "Veterinaria",
};

function first(value: string | undefined): string | undefined {
  const v = value?.split(";")[0]?.trim();
  return v || undefined;
}

function tag(t: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = first(t[k]);
    if (v) return v;
  }
  return undefined;
}

function socialFromTag(platform: string, value: string | undefined): { platform: string; url: string } | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.includes(".")) return classifySocial(value);
  const handle = value.replace(/^@/, "").trim();
  if (!handle) return undefined;
  const base: Record<string, string> = {
    facebook: "https://www.facebook.com/",
    instagram: "https://www.instagram.com/",
    x: "https://x.com/",
    youtube: "https://www.youtube.com/@",
    tiktok: "https://www.tiktok.com/@",
    linkedin: "https://www.linkedin.com/company/",
  };
  return base[platform] ? { platform, url: base[platform] + handle } : undefined;
}

export function toBusiness(
  el: OverpassElement,
  place: GeocodedPlace,
  profile: NicheProfile | undefined,
  fetchedAt: Date,
): DiscoveredBusiness | null {
  const t = el.tags ?? {};
  const name = t.name?.trim() || t["name:es"]?.trim() || t.brand?.trim();
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const address = t["addr:full"] ?? ([street, t["addr:suburb"] ?? t["addr:neighbourhood"]].filter(Boolean).join(", ") || undefined);
  const website = tag(t, "website", "contact:website", "url");
  const matchedValue = profile?.tags.map(([k]) => t[k]).find(Boolean);

  const socials = [
    socialFromTag("facebook", tag(t, "contact:facebook", "facebook")),
    socialFromTag("instagram", tag(t, "contact:instagram", "instagram")),
    socialFromTag("x", tag(t, "contact:twitter", "twitter")),
    socialFromTag("youtube", tag(t, "contact:youtube", "youtube")),
    socialFromTag("tiktok", tag(t, "contact:tiktok")),
    socialFromTag("linkedin", tag(t, "contact:linkedin")),
  ].filter((s): s is { platform: string; url: string } => Boolean(s));

  const whatsapp = tag(t, "contact:whatsapp", "whatsapp");
  const business: DiscoveredBusiness = {
    provider: PROVIDER,
    externalId: `${el.type}/${el.id}`,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    name,
    category: profile?.label ?? (matchedValue ? HUMAN_CATEGORY[matchedValue] ?? matchedValue.replace(/_/g, " ") : undefined),
    description: t.description?.trim() || undefined,
    address,
    city: t["addr:city"] ?? place.city,
    region: t["addr:state"] ?? place.region,
    country: place.country,
    lat,
    lng,
    phone: tag(t, "phone", "contact:phone", "contact:mobile", "mobile"),
    email: tag(t, "email", "contact:email"),
    website: website ? ensureProtocol(website) : undefined,
    whatsapp,
    openingHours: t.opening_hours ? [t.opening_hours] : undefined,
    socialLinks: socials.length ? dedupeSocials(socials) : undefined,
    raw: t,
    fetchedAt,
  };
  return business;
}

/** Cuántos datos útiles trae un elemento: se usa para ordenar cuando hay más resultados que el límite pedido. */
function completeness(b: DiscoveredBusiness): number {
  return (
    (b.website ? 3 : 0) +
    (b.phone ? 2 : 0) +
    (b.email ? 1 : 0) +
    (b.openingHours ? 1 : 0) +
    (b.address ? 1 : 0) +
    (b.socialLinks?.length ? 1 : 0) +
    (b.whatsapp ? 1 : 0)
  );
}

export const openStreetMapProvider = createOpenStreetMapProvider();
