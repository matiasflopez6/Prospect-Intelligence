import { desc, eq, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { listJobs } from "../jobs/service";

export type SearchRow = typeof tables.searches.$inferSelect;

export function listSearches(limit = 100): SearchRow[] {
  return getDb().select().from(tables.searches).orderBy(desc(tables.searches.id)).limit(limit).all();
}

export interface SearchResultRow {
  rank: number | null;
  id: number;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  score: number | null;
  scoreTier: "high" | "medium" | "low" | null;
  analysisStatus: "pending" | "running" | "done" | "failed";
  socialCount: number;
  sources: string[];
}

/** Búsqueda + empresas que devolvió + estado del trabajo en segundo plano. */
export function getSearchDetail(id: number) {
  const db = getDb();
  const search = db.select().from(tables.searches).where(eq(tables.searches.id, id)).get();
  if (!search) return undefined;

  const rows = db
    .select({
      rank: tables.searchCompanies.rank,
      id: tables.companies.id,
      name: tables.companies.name,
      category: tables.companies.category,
      city: tables.companies.city,
      address: tables.companies.address,
      phone: tables.companies.phone,
      email: tables.companies.email,
      website: tables.companies.website,
      rating: tables.companies.rating,
      reviewCount: tables.companies.reviewCount,
      score: tables.companies.score,
      scoreTier: tables.companies.scoreTier,
      analysisStatus: tables.companies.analysisStatus,
      socialCount: sql<number>`(select count(*) from ${tables.socialProfiles} where ${tables.socialProfiles.companyId} = ${tables.companies.id})`,
    })
    .from(tables.searchCompanies)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.searchCompanies.companyId))
    .where(eq(tables.searchCompanies.searchId, id))
    .orderBy(tables.searchCompanies.rank)
    .all();

  const sources = db
    .select({ companyId: tables.companySources.companyId, provider: tables.companySources.provider })
    .from(tables.companySources)
    .all();
  const byCompany = new Map<number, Set<string>>();
  for (const s of sources) byCompany.set(s.companyId, (byCompany.get(s.companyId) ?? new Set()).add(s.provider));

  const results: SearchResultRow[] = rows.map((r) => ({ ...r, sources: [...(byCompany.get(r.id) ?? [])] }));
  const job = listJobs({ searchId: id, limit: 5 }).find((j) => j.type === "discovery.run");
  return { search, results, job };
}
