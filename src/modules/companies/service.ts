import { and, asc, desc, eq, exists, gte, lte, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { CRM_STATUSES, SCORE_TIERS, SERVICE_KEYS, type CrmStatus } from "@/domain";
import { getDb, tables, type Db } from "@/lib/db";
import type { CompanyFilters, CompanyListQuery, CompanyListRow, CompanySortKey, Page } from "./types";

export type Company = typeof tables.companies.$inferSelect;

export function getCompany(id: number): Company | undefined {
  return getDb().select().from(tables.companies).where(eq(tables.companies.id, id)).get();
}

export const COMPANY_PAGE_SIZE = 25;

const c = tables.companies;
const crm = tables.crmEntries;

/** Escapa % _ \ para usar el texto del usuario dentro de LIKE. */
const like = (v: string) => `%${v.trim().replace(/[\\%_]/g, "\\$&")}%`;

function buildWhere(f: CompanyFilters): SQL | undefined {
  const w: (SQL | undefined)[] = [];
  const q = f.q?.trim();
  if (q) w.push(sql`(${c.name} like ${like(q)} escape '\\' or ${c.normalizedName} like ${like(q)} escape '\\')`);
  if (f.niche?.trim()) w.push(sql`${c.niche} like ${like(f.niche)} escape '\\'`);
  if (f.location?.trim()) w.push(sql`${c.location} like ${like(f.location)} escape '\\'`);
  if (f.scoreMin !== undefined) w.push(gte(c.score, f.scoreMin));
  if (f.scoreMax !== undefined) w.push(lte(c.score, f.scoreMax));
  if (f.tier && SCORE_TIERS.includes(f.tier)) w.push(eq(c.scoreTier, f.tier));
  if (f.opportunitiesMin !== undefined) w.push(gte(c.opportunityCount, f.opportunitiesMin));
  if (f.ratingMin !== undefined) w.push(gte(c.rating, f.ratingMin));
  if (f.reviewsMin !== undefined) w.push(gte(c.reviewCount, f.reviewsMin));
  if (f.crmStatus && CRM_STATUSES.includes(f.crmStatus)) {
    // Sin fila CRM equivale a «Nueva».
    w.push(f.crmStatus === "new" ? sql`coalesce(${crm.status}, 'new') = 'new'` : eq(crm.status, f.crmStatus));
  }
  if (f.ownerId !== undefined) w.push(eq(crm.ownerId, f.ownerId));
  const openOpp = (extra: SQL) =>
    exists(
      getDb()
        .select({ one: sql`1` })
        .from(tables.opportunities)
        .where(and(eq(tables.opportunities.companyId, c.id), eq(tables.opportunities.status, "open"), extra)),
    );
  if (f.opportunityType) w.push(openOpp(eq(tables.opportunities.type, f.opportunityType)));
  if (f.service && SERVICE_KEYS.includes(f.service)) w.push(openOpp(eq(tables.opportunities.serviceKey, f.service)));
  if (f.searchId !== undefined) {
    w.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(tables.searchCompanies)
          .where(and(eq(tables.searchCompanies.companyId, c.id), eq(tables.searchCompanies.searchId, f.searchId))),
      ),
    );
  }
  return and(...w);
}

function orderBy(sort: CompanySortKey, dir: "asc" | "desc"): SQL[] {
  const d = dir === "asc" ? asc : desc;
  const nullsLast = (col: AnyColumn) => sql`${col} is null`;
  switch (sort) {
    case "name":
      return [d(c.normalizedName)];
    case "rating":
      return [nullsLast(c.rating), d(c.rating), desc(c.reviewCount)];
    case "reviews":
      return [nullsLast(c.reviewCount), d(c.reviewCount)];
    case "opportunities":
      return [d(c.opportunityCount), desc(c.score)];
    case "createdAt":
      return [d(c.createdAt), d(c.id)];
    case "score":
    default:
      return [nullsLast(c.score), d(c.score), asc(c.normalizedName)];
  }
}

/**
 * Listado con búsqueda y filtros (nombre, nicho, ubicación, score, nº de oportunidades,
 * problema, servicio, estado CRM, valoración, reseñas), orden y paginación.
 */
export function listCompanies(query: CompanyListQuery, db: Db = getDb()): Page<CompanyListRow> {
  const owner = alias(tables.members, "owner");
  const pageSize = Math.min(Math.max(query.pageSize ?? COMPANY_PAGE_SIZE, 1), 200);
  const where = buildWhere(query);

  const total =
    db
      .select({ n: sql<number>`count(*)` })
      .from(c)
      .leftJoin(crm, eq(crm.companyId, c.id))
      .where(where)
      .get()?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(query.page ?? 1) || 1, 1), pages);

  const rows = db
    .select({
      id: c.id,
      name: c.name,
      niche: c.niche,
      location: c.location,
      website: c.website,
      rating: c.rating,
      reviewCount: c.reviewCount,
      score: c.score,
      scoreTier: c.scoreTier,
      opportunityCount: c.opportunityCount,
      topServiceKey: c.topServiceKey,
      crmStatus: sql<CrmStatus>`coalesce(${crm.status}, 'new')`,
      ownerName: owner.name,
      nextAction: crm.nextAction,
      followUpAt: crm.followUpAt,
      analysisStatus: c.analysisStatus,
    })
    .from(c)
    .leftJoin(crm, eq(crm.companyId, c.id))
    .leftJoin(owner, eq(owner.id, crm.ownerId))
    .where(where)
    .orderBy(...orderBy(query.sort ?? "score", query.dir ?? "desc"))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return { rows, total, page, pageSize };
}

export interface CompanyFilterOptions {
  niches: string[];
  locations: string[];
  opportunityTypes: string[];
  services: string[];
  owners: { id: number; name: string }[];
}

/** Valores reales presentes en la base para poblar los selectores de filtro. */
export function getFilterOptions(db: Db = getDb()): CompanyFilterOptions {
  const distinct = (col: SQLiteColumn) =>
    db
      .selectDistinct({ v: col })
      .from(c)
      .where(sql`${col} is not null and ${col} != ''`)
      .orderBy(asc(col))
      .all()
      .map((r) => String(r.v));
  const opp = (col: SQLiteColumn) =>
    db
      .selectDistinct({ v: col })
      .from(tables.opportunities)
      .where(eq(tables.opportunities.status, "open"))
      .all()
      .map((r) => String(r.v));
  return {
    niches: distinct(c.niche),
    locations: distinct(c.location),
    opportunityTypes: opp(tables.opportunities.type),
    services: opp(tables.opportunities.serviceKey),
    owners: db.select({ id: tables.members.id, name: tables.members.name }).from(tables.members).orderBy(asc(tables.members.name)).all(),
  };
}
