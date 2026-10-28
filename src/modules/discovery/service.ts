import { and, eq } from "drizzle-orm";
import { getDb, tables, type Db } from "@/lib/db";
import { errorMessage, MissingCredentialError } from "@/lib/errors";
import { logActivity } from "../activity/service";
import type { JobContext } from "../jobs/handlers";
import { enqueueJob } from "../jobs/service";
import { nameSimilarity, normalizeName, websiteDomain } from "./lib/normalize";
import { mergeBusinesses, type MergedBusiness } from "./merge";
import { discoveryProviders, getProvider } from "./registry";
import type { DiscoveredBusiness, DiscoveryProvider } from "./types";
import { enrichFromWebsite, type WebsiteEnrichment } from "./website";

export interface CreateSearchInput {
  niche: string;
  location: string;
  targetCount: number;
  /** null/undefined = todos los proveedores configurados. */
  providers?: string[] | null;
  autoAnalyze?: boolean;
}

/** Crea la búsqueda y encola el trabajo "discovery.run". Devuelve el id de la búsqueda. */
export function createSearch(input: CreateSearchInput): number {
  const db = getDb();
  const search = db
    .insert(tables.searches)
    .values({
      niche: input.niche.trim(),
      location: input.location.trim(),
      targetCount: input.targetCount,
      providers: input.providers ?? null,
      autoAnalyze: input.autoAnalyze ?? true,
    })
    .returning({ id: tables.searches.id })
    .get();
  logActivity({
    type: "search.created",
    message: `Nueva búsqueda: ${input.niche} en ${input.location}`,
    searchId: search.id,
  });
  enqueueJob({ type: "discovery.run", payload: { searchId: search.id }, searchId: search.id });
  return search.id;
}

export function getSearch(id: number) {
  return getDb().select().from(tables.searches).where(eq(tables.searches.id, id)).get();
}

export interface DiscoveryDeps {
  /** Por defecto, el registro de proveedores. */
  providers?: DiscoveryProvider[];
  enrichWebsite?: (url: string) => Promise<WebsiteEnrichment>;
  enqueue?: typeof enqueueJob;
  db?: Db;
  log?: (message: string) => void;
}

type ProviderResults = Record<string, { status: string; found: number; error?: string }>;

const WEBSITE_CONCURRENCY = 4;

/**
 * Ejecuta una búsqueda: consulta los proveedores, deduplica, completa email/redes desde la web de cada
 * negocio, persiste empresas (+ company_sources, social_profiles, reviews, crm_entries con estado "new"),
 * actualiza contadores y, si autoAnalyze, encola "company.analyze" por empresa.
 *
 * Solo se guardan datos devueltos por una fuente real; si un proveedor no está configurado o falla se
 * registra en `providerResults` y la búsqueda queda "partial"/"failed", nunca se rellena con datos inventados.
 */
export async function runDiscovery(searchId: number, ctx: JobContext, deps: DiscoveryDeps = {}): Promise<unknown> {
  const db = deps.db ?? getDb();
  const log = deps.log ?? ((m: string) => console.info(`[discovery #${searchId}] ${m}`));
  const search = db.select().from(tables.searches).where(eq(tables.searches.id, searchId)).get();
  if (!search) throw new Error(`Búsqueda ${searchId} no existe`);

  db.update(tables.searches).set({ status: "running", startedAt: new Date(), error: null }).where(eq(tables.searches.id, searchId)).run();
  const providerResults: ProviderResults = {};

  try {
    ctx.setProgress(5, "Consultando fuentes");
    const registry = deps.providers ?? discoveryProviders;
    const requested = search.providers
      ? search.providers.map((id) => registry.find((p) => p.id === id) ?? getProvider(id)).filter((p): p is DiscoveryProvider => Boolean(p))
      : registry;

    const runnable: DiscoveryProvider[] = [];
    for (const p of requested) {
      const a = p.availability();
      if (a.configured) runnable.push(p);
      else providerResults[p.id] = { status: "skipped", found: 0, error: `Falta configurar: ${a.missingEnv.join(", ")}` };
    }
    if (runnable.length === 0) {
      const missing = [...new Set(requested.flatMap((p) => p.availability().missingEnv))];
      throw new MissingCredentialError("una fuente de descubrimiento", missing);
    }

    const query = { niche: search.niche, location: search.location, limit: search.targetCount };
    const settled = await Promise.allSettled(
      runnable.map((p) => p.search(query, { log: (m) => log(`${p.id}: ${m}`) })),
    );
    const found: DiscoveredBusiness[] = [];
    settled.forEach((r, i) => {
      const p = runnable[i]!;
      if (r.status === "fulfilled") {
        providerResults[p.id] = { status: "ok", found: r.value.length };
        found.push(...r.value);
      } else {
        providerResults[p.id] = { status: "failed", found: 0, error: errorMessage(r.reason) };
        log(`${p.id} falló: ${errorMessage(r.reason)}`);
      }
    });
    const failedProviders = Object.values(providerResults).filter((r) => r.status === "failed").length;
    const okProviders = Object.values(providerResults).filter((r) => r.status === "ok").length;
    if (okProviders === 0) {
      const detail = Object.entries(providerResults).map(([id, r]) => `${id}: ${r.error}`).join(" | ");
      throw new Error(`Ninguna fuente respondió. ${detail}`);
    }

    ctx.setProgress(40, "Deduplicando");
    const merged = mergeBusinesses(found).slice(0, search.targetCount);

    ctx.setProgress(50, "Leyendo las webs de los negocios");
    const enrichWebsite = deps.enrichWebsite ?? ((url: string) => enrichFromWebsite(url));
    const enrichments = new Map<MergedBusiness, WebsiteEnrichment>();
    let done = 0;
    const withSite = merged.filter((b) => b.website);
    await mapLimit(withSite, WEBSITE_CONCURRENCY, async (b) => {
      try {
        enrichments.set(b, await enrichWebsite(b.website!));
      } catch (e) {
        log(`Web de "${b.name}" no legible: ${errorMessage(e)}`);
      }
      ctx.setProgress(50 + Math.round((++done / Math.max(withSite.length, 1)) * 35));
    });

    ctx.setProgress(88, "Guardando empresas");
    const { companyIds, created } = persist(db, searchId, search, merged, enrichments);

    const status = failedProviders > 0 || Object.values(providerResults).some((r) => r.status === "skipped") ? "partial" : "completed";
    db.update(tables.searches)
      .set({ status, foundCount: companyIds.length, providerResults, finishedAt: new Date() })
      .where(eq(tables.searches.id, searchId))
      .run();
    logActivity({
      type: "search.completed",
      message: `Búsqueda "${search.niche} en ${search.location}": ${companyIds.length} empresas (${created} nuevas)`,
      searchId,
      meta: { providerResults, created },
    });

    if (search.autoAnalyze) {
      const enqueue = deps.enqueue ?? enqueueJob;
      const pending = db
        .select({ id: tables.companies.id, status: tables.companies.analysisStatus })
        .from(tables.companies)
        .all()
        .filter((c) => companyIds.includes(c.id) && c.status === "pending");
      for (const c of pending) enqueue({ type: "company.analyze", payload: { companyId: c.id }, companyId: c.id, searchId });
    }
    ctx.setProgress(100, "Completado");
    return { searchId, status, found: companyIds.length, created, providerResults };
  } catch (e) {
    db.update(tables.searches)
      .set({ status: "failed", error: errorMessage(e), providerResults, finishedAt: new Date() })
      .where(eq(tables.searches.id, searchId))
      .run();
    logActivity({ type: "search.failed", message: `Búsqueda fallida: ${errorMessage(e)}`, searchId });
    throw e;
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

type Search = NonNullable<ReturnType<typeof getSearch>>;

/** Busca una empresa ya guardada: por id externo, o por dominio + nombre parecido, o por nombre + ciudad. */
function findExisting(db: Db, b: MergedBusiness): typeof tables.companies.$inferSelect | undefined {
  const googleId = b.externalIds["google-places"];
  const osmId = b.externalIds["openstreetmap"];
  if (googleId) {
    const hit = db.select().from(tables.companies).where(eq(tables.companies.googlePlaceId, googleId)).get();
    if (hit) return hit;
  }
  if (osmId) {
    const hit = db.select().from(tables.companies).where(eq(tables.companies.osmId, osmId)).get();
    if (hit) return hit;
  }
  const domain = websiteDomain(b.website);
  if (domain) {
    const hit = db
      .select()
      .from(tables.companies)
      .where(eq(tables.companies.websiteDomain, domain))
      .all()
      .find((c) => nameSimilarity(c.name, b.name) >= 0.34);
    if (hit) return hit;
  }
  const norm = normalizeName(b.name);
  return db
    .select()
    .from(tables.companies)
    .where(eq(tables.companies.normalizedName, norm))
    .all()
    .find((c) => !c.city || !b.city || c.city.toLowerCase() === b.city.toLowerCase());
}

function handleFromUrl(url: string): string | undefined {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0];
    return seg ? seg.replace(/^@/, "") : undefined;
  } catch {
    return undefined;
  }
}

function persist(
  db: Db,
  searchId: number,
  search: Search,
  merged: MergedBusiness[],
  enrichments: Map<MergedBusiness, WebsiteEnrichment>,
): { companyIds: number[]; created: number } {
  const companyIds: number[] = [];
  let created = 0;

  db.transaction((tx) => {
    merged.forEach((b, rank) => {
      const site = enrichments.get(b);
      const siteSocialUrls = new Set(site?.socialLinks.map((l) => l.url));
      const email = b.email ?? site?.email;
      const whatsapp = b.whatsapp ?? site?.whatsapp;
      const socials = [...(b.socialLinks ?? [])];
      for (const l of site?.socialLinks ?? []) if (!socials.some((s) => s.url === l.url)) socials.push(l);

      const values = {
        name: b.name,
        normalizedName: normalizeName(b.name),
        category: b.category ?? null,
        description: b.description ?? null,
        address: b.address ?? null,
        city: b.city ?? null,
        region: b.region ?? null,
        country: b.country ?? null,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        phone: b.phone ?? null,
        email: email ?? null,
        website: b.website ?? null,
        websiteDomain: websiteDomain(b.website),
        whatsapp: whatsapp ?? null,
        rating: b.rating ?? null,
        reviewCount: b.reviewCount ?? null,
        priceLevel: b.priceLevel ?? null,
        businessStatus: b.businessStatus ?? null,
        openingHours: b.openingHours ?? null,
        googlePlaceId: b.externalIds["google-places"] ?? null,
        osmId: b.externalIds["openstreetmap"] ?? null,
      };

      const existing = findExisting(tx as unknown as Db, b);
      let companyId: number;
      if (existing) {
        companyId = existing.id;
        // Completa lo que faltaba; los datos con valor se conservan salvo los que cambian con el tiempo.
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(values)) {
          const current = (existing as Record<string, unknown>)[k];
          if (v !== null && (current === null || current === undefined)) patch[k] = v;
        }
        for (const k of ["rating", "reviewCount", "businessStatus", "openingHours"] as const) {
          if (values[k] !== null) patch[k] = values[k];
        }
        if (!existing.niche) patch.niche = search.niche;
        if (!existing.location) patch.location = search.location;
        if (Object.keys(patch).length) tx.update(tables.companies).set(patch).where(eq(tables.companies.id, companyId)).run();
      } else {
        companyId = tx
          .insert(tables.companies)
          .values({ ...values, niche: search.niche, location: search.location })
          .returning({ id: tables.companies.id })
          .get().id;
        tx.insert(tables.crmEntries).values({ companyId, status: "new" }).run();
        created++;
      }
      companyIds.push(companyId);

      tx.insert(tables.searchCompanies).values({ searchId, companyId, rank: rank + 1 }).onConflictDoNothing().run();

      for (const src of b.sources) {
        tx.delete(tables.companySources)
          .where(
            and(eq(tables.companySources.companyId, companyId), eq(tables.companySources.provider, src.provider), eq(tables.companySources.externalId, src.externalId)),
          )
          .run();
        tx.insert(tables.companySources)
          .values({ companyId, provider: src.provider, externalId: src.externalId, url: src.sourceUrl, fields: src.fields, raw: src.raw ?? null, fetchedAt: src.fetchedAt })
          .run();
      }
      if (site && site.pagesVisited.length > 0) {
        const fields = [
          ...(b.email === undefined && site.email ? ["email"] : []),
          ...(b.whatsapp === undefined && site.whatsapp ? ["whatsapp"] : []),
          ...(site.socialLinks.length ? ["socialLinks"] : []),
        ];
        tx.delete(tables.companySources)
          .where(and(eq(tables.companySources.companyId, companyId), eq(tables.companySources.provider, "website")))
          .run();
        tx.insert(tables.companySources)
          .values({
            companyId,
            provider: "website",
            externalId: site.finalUrl ?? b.website,
            url: site.finalUrl ?? b.website,
            fields,
            raw: { pagesVisited: site.pagesVisited, emails: site.emails, phones: site.phones },
          })
          .run();
      }

      for (const link of socials) {
        tx.insert(tables.socialProfiles)
          .values({
            companyId,
            platform: link.platform,
            url: link.url,
            handle: handleFromUrl(link.url),
            foundVia: siteSocialUrls.has(link.url) && !(b.socialLinks ?? []).some((s) => s.url === link.url) ? "website" : b.fieldSources.socialLinks ?? "website",
          })
          .onConflictDoNothing()
          .run();
      }

      if (b.reviews?.length) {
        const source = b.fieldSources.reviews ?? "unknown";
        tx.delete(tables.reviews).where(and(eq(tables.reviews.companyId, companyId), eq(tables.reviews.source, source))).run();
        for (const r of b.reviews) {
          tx.insert(tables.reviews)
            .values({
              companyId,
              source,
              author: r.author,
              rating: r.rating,
              text: r.text,
              language: r.language,
              publishedAt: r.publishedAt,
              ownerReplied: r.ownerReplied,
              ownerReplyText: r.ownerReplyText,
            })
            .run();
        }
      }
    });
  });
  return { companyIds, created };
}
