import { and, count, countDistinct, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { CRM_STATUSES, type CrmStatus } from "@/domain";
import { getDb, tables, type Db } from "@/lib/db";

export interface DashboardData {
  found: number;
  analyzed: number;
  /** Empresas con análisis pendiente o en curso. */
  analyzing: number;
  searches: number;
  /** Prioridad alta (puntuación ≥ umbral) y todavía abiertas en el CRM. */
  priorityCount: number;
  /** Seguimientos vencidos y de los próximos 7 días en empresas abiertas. */
  followUps: { overdue: number; upcoming: number };
  topProspects: {
    id: number;
    name: string;
    niche: string | null;
    city: string | null;
    score: number;
    scoreTier: "high" | "medium" | "low" | null;
    opportunityCount: number;
    topServiceKey: string | null;
    status: CrmStatus;
  }[];
  /** 10 tramos de 10 puntos (0–9, … , 90–100) sobre empresas puntuadas. */
  scoreBuckets: number[];
  scored: number;
  problems: { type: string; companies: number }[];
  services: { serviceKey: string; companies: number; highImpact: number }[];
  pipeline: { status: CrmStatus; count: number }[];
  activity: { id: number; type: string; message: string; createdAt: Date; companyId: number | null; companyName: string | null }[];
}

const OPEN_CRM: CrmStatus[] = ["won", "lost"];

/** Agregados reales sobre la base de datos; nada se estima ni se rellena con ejemplos. */
export function getDashboard(db: Db = getDb(), now: Date = new Date()): DashboardData {
  const c = tables.companies;
  const crm = tables.crmEntries;
  const one = <T,>(v: T | undefined, fallback: T) => v ?? fallback;

  const found = one(db.select({ n: count() }).from(c).get()?.n, 0);
  const analyzed = one(db.select({ n: count() }).from(c).where(eq(c.analysisStatus, "done")).get()?.n, 0);
  const analyzing = one(db.select({ n: count() }).from(c).where(inArray(c.analysisStatus, ["pending", "running"])).get()?.n, 0);
  const searches = one(db.select({ n: count() }).from(tables.searches).get()?.n, 0);

  const openCrm = sql`coalesce(${crm.status}, 'new') not in ('won','lost')`;
  const priorityCount = one(
    db.select({ n: count() }).from(c).leftJoin(crm, eq(crm.companyId, c.id)).where(and(eq(c.scoreTier, "high"), openCrm)).get()?.n,
    0,
  );

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime();
  const followBase = and(sql`${crm.followUpAt} is not null`, notInArray(crm.status, OPEN_CRM));
  const overdue = one(db.select({ n: count() }).from(crm).where(and(followBase, sql`${crm.followUpAt} < ${startOfToday}`)).get()?.n, 0);
  const upcoming = one(
    db.select({ n: count() }).from(crm).where(and(followBase, sql`${crm.followUpAt} >= ${startOfToday} and ${crm.followUpAt} < ${horizon}`)).get()?.n,
    0,
  );

  const topProspects = db
    .select({
      id: c.id,
      name: c.name,
      niche: c.niche,
      city: c.city,
      score: c.score,
      scoreTier: c.scoreTier,
      opportunityCount: c.opportunityCount,
      topServiceKey: c.topServiceKey,
      status: sql<CrmStatus>`coalesce(${crm.status}, 'new')`,
    })
    .from(c)
    .leftJoin(crm, eq(crm.companyId, c.id))
    .where(and(sql`${c.score} is not null`, sql`coalesce(${crm.status}, 'new') in ('new','analyzed','priority')`))
    .orderBy(desc(c.score), desc(c.opportunityCount))
    .limit(8)
    .all()
    .filter((r): r is typeof r & { score: number } => r.score != null);

  const scoreBuckets = new Array<number>(10).fill(0);
  const bucketRows = db
    .select({ b: sql<number>`min(${c.score} / 10, 9)`, n: count() })
    .from(c)
    .where(sql`${c.score} is not null`)
    .groupBy(sql`min(${c.score} / 10, 9)`)
    .all();
  for (const r of bucketRows) scoreBuckets[Math.max(0, Math.min(9, r.b))] = r.n;
  const scored = scoreBuckets.reduce((a, b) => a + b, 0);

  const o = tables.opportunities;
  const problems = db
    .select({ type: o.type, companies: countDistinct(o.companyId) })
    .from(o)
    .where(eq(o.status, "open"))
    .groupBy(o.type)
    .orderBy(desc(countDistinct(o.companyId)), o.type)
    .limit(8)
    .all();
  const services = db
    .select({
      serviceKey: o.serviceKey,
      companies: countDistinct(o.companyId),
      highImpact: sql<number>`count(distinct case when ${o.impact} = 'high' then ${o.companyId} end)`,
    })
    .from(o)
    .where(eq(o.status, "open"))
    .groupBy(o.serviceKey)
    .orderBy(desc(countDistinct(o.companyId)), desc(sql`count(distinct case when ${o.impact} = 'high' then ${o.companyId} end)`))
    .limit(8)
    .all();

  const byStatus = new Map<string, number>(
    db
      .select({ status: sql<string>`coalesce(${crm.status}, 'new')`, n: count() })
      .from(c)
      .leftJoin(crm, eq(crm.companyId, c.id))
      .groupBy(sql`coalesce(${crm.status}, 'new')`)
      .all()
      .map((r) => [r.status, r.n]),
  );
  const pipeline = CRM_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));

  const a = tables.activityLog;
  const activity = db
    .select({ id: a.id, type: a.type, message: a.message, createdAt: a.createdAt, companyId: a.companyId, companyName: c.name })
    .from(a)
    .leftJoin(c, eq(c.id, a.companyId))
    .orderBy(desc(a.createdAt), desc(a.id))
    .limit(12)
    .all();

  return {
    found,
    analyzed,
    analyzing,
    searches,
    priorityCount,
    followUps: { overdue, upcoming },
    topProspects,
    scoreBuckets,
    scored,
    problems,
    services,
    pipeline,
    activity,
  };
}
