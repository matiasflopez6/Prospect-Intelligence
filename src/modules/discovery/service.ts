import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { NotImplementedError } from "@/lib/errors";
import { logActivity } from "../activity/service";
import type { JobContext } from "../jobs/handlers";
import { enqueueJob } from "../jobs/service";

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

/**
 * Ejecuta una búsqueda: consulta los proveedores, deduplica, persiste empresas (+ company_sources,
 * social_profiles, reviews, crm_entries con estado "new"), actualiza contadores y, si autoAnalyze,
 * encola "company.analyze" por empresa.
 * TODO(sesión discovery).
 */
export async function runDiscovery(_searchId: number, _ctx: JobContext): Promise<unknown> {
  throw new NotImplementedError("discovery/service → runDiscovery");
}
