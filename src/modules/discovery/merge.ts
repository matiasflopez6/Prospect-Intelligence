import { distanceMeters, foldText, nameSimilarity, normalizeName, phoneKey, websiteDomain, dedupeSocials } from "./lib/normalize";
import type { DiscoveredBusiness, DiscoveredReview } from "./types";

/** Qué proveedor aportó datos a una empresa fusionada (procedencia por fuente). */
export interface BusinessSource {
  provider: string;
  externalId: string;
  sourceUrl?: string;
  /** Campos de la empresa que se tomaron de esta fuente. */
  fields: string[];
  raw?: unknown;
  fetchedAt: Date;
}

export type MergedBusiness = Omit<DiscoveredBusiness, "provider" | "externalId" | "sourceUrl" | "raw" | "fetchedAt"> & {
  sources: BusinessSource[];
  /** Campo → proveedor del que procede el valor (atribución por dato). */
  fieldSources: Record<string, string>;
  /** Clave de identificación en cada proveedor, para deduplicar contra la base de datos. */
  externalIds: Record<string, string>;
};

/** Orden de confianza al resolver conflictos entre fuentes (mayor prioridad primero). */
const PROVIDER_PRIORITY = ["google-places", "openstreetmap"];

const SCALAR_FIELDS = [
  "name", "category", "description", "address", "city", "region", "country", "lat", "lng", "phone", "email",
  "website", "whatsapp", "rating", "reviewCount", "priceLevel", "businessStatus", "openingHours",
] as const;

function priority(provider: string): number {
  const i = PROVIDER_PRIORITY.indexOf(provider);
  return i === -1 ? PROVIDER_PRIORITY.length : i;
}

function hasCoords(b: DiscoveredBusiness): b is DiscoveredBusiness & { lat: number; lng: number } {
  return typeof b.lat === "number" && typeof b.lng === "number";
}

function addressTokens(b: DiscoveredBusiness): Set<string> {
  return new Set(foldText(b.address ?? "").split(" ").filter((t) => t.length > 2));
}

/** ¿Son el mismo negocio? Reglas conservadoras: preferimos duplicar a fusionar negocios distintos. */
export function isSameBusiness(a: DiscoveredBusiness, b: DiscoveredBusiness): boolean {
  if (a.provider === b.provider && a.externalId === b.externalId) return true;

  const sim = nameSimilarity(a.name, b.name);
  const sameName = normalizeName(a.name) === normalizeName(b.name) && normalizeName(a.name) !== "";
  const dist = hasCoords(a) && hasCoords(b) ? distanceMeters(a, b) : undefined;

  const da = websiteDomain(a.website);
  const db = websiteDomain(b.website);
  // Misma web propia: mismo negocio salvo sucursales (mismo dominio pero en sitios distintos).
  if (da && da === db) return dist === undefined ? sim >= 0.34 : dist <= 300 || sim >= 0.6 && dist <= 1500;

  const pa = phoneKey(a.phone);
  const pb = phoneKey(b.phone);
  if (pa && pa === pb && (sim >= 0.3 || (dist !== undefined && dist <= 200))) return true;

  if (sameName || sim >= 0.75) {
    if (dist !== undefined) return dist <= 250;
    // Sin coordenadas en alguno: exige que compartan calle/número en la dirección.
    const ta = addressTokens(a);
    const tb = addressTokens(b);
    if (ta.size === 0 || tb.size === 0) return false;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / Math.min(ta.size, tb.size) >= 0.6;
  }
  return false;
}

/** Agrupa negocios duplicados (entre proveedores y dentro de uno) y devuelve uno fusionado por grupo. */
export function mergeBusinesses(list: DiscoveredBusiness[]): MergedBusiness[] {
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    const p = parent[i] ?? i;
    if (p === i) return i;
    return (parent[i] = find(p));
  };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a && b && find(i) !== find(j) && isSameBusiness(a, b)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, DiscoveredBusiness[]>();
  list.forEach((b, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), b]);
  });
  const merged = [...groups.values()].map(mergeGroup);
  // Confirmado por varias fuentes = más fiable; el orden previo (relevancia del proveedor) se mantiene como desempate.
  return merged
    .map((m, i) => ({ m, i }))
    .sort((x, y) => y.m.sources.length - x.m.sources.length || x.i - y.i)
    .map(({ m }) => m);
}

function empty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function mergeGroup(group: DiscoveredBusiness[]): MergedBusiness {
  const ordered = [...group].sort((a, b) => priority(a.provider) - priority(b.provider));
  const out: Partial<MergedBusiness> & Record<string, unknown> = {};
  const fieldSources: Record<string, string> = {};
  const sources = new Map<string, BusinessSource>();
  const externalIds: Record<string, string> = {};

  for (const b of ordered) {
    const key = `${b.provider}:${b.externalId}`;
    if (!sources.has(key)) {
      sources.set(key, { provider: b.provider, externalId: b.externalId, sourceUrl: b.sourceUrl, fields: [], raw: b.raw, fetchedAt: b.fetchedAt });
    }
    externalIds[b.provider] ??= b.externalId;
    const src = sources.get(key)!;
    for (const f of SCALAR_FIELDS) {
      const v = b[f];
      if (!empty(v) && empty(out[f])) {
        (out as Record<string, unknown>)[f] = v;
        fieldSources[f] = b.provider;
        src.fields.push(f);
      }
    }
  }

  const socialsFrom = ordered.find((b) => b.socialLinks?.length);
  if (socialsFrom) {
    out.socialLinks = dedupeSocials(ordered.flatMap((b) => b.socialLinks ?? []));
    fieldSources.socialLinks = socialsFrom.provider;
    sources.get(`${socialsFrom.provider}:${socialsFrom.externalId}`)?.fields.push("socialLinks");
  }
  const withReviews = ordered.find((b) => b.reviews?.length);
  if (withReviews) {
    out.reviews = withReviews.reviews as DiscoveredReview[];
    fieldSources.reviews = withReviews.provider;
    sources.get(`${withReviews.provider}:${withReviews.externalId}`)?.fields.push("reviews");
  }

  return { ...(out as Omit<MergedBusiness, "sources" | "fieldSources" | "externalIds">), sources: [...sources.values()], fieldSources, externalIds } as MergedBusiness;
}
