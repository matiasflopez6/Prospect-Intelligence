import { desc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

type Opportunity = typeof tables.opportunities.$inferSelect;
type EvidenceRow = typeof tables.evidence.$inferSelect;
export type OpportunityWithEvidence = Opportunity & { evidence: EvidenceRow[] };

/** Oportunidades de la empresa (abiertas primero) ordenadas por severidad × confianza, con sus evidencias. */
export function listOpportunities(companyId: number): OpportunityWithEvidence[] {
  const db = getDb();
  const rows = db.select().from(tables.opportunities).where(eq(tables.opportunities.companyId, companyId)).orderBy(desc(tables.opportunities.id)).all();
  if (rows.length === 0) return [];
  const links = db
    .select({ opportunityId: tables.opportunityEvidence.opportunityId, evidence: tables.evidence })
    .from(tables.opportunityEvidence)
    .innerJoin(tables.evidence, eq(tables.evidence.id, tables.opportunityEvidence.evidenceId))
    .where(inArray(tables.opportunityEvidence.opportunityId, rows.map((r) => r.id)))
    .all();
  const byOpp = new Map<number, EvidenceRow[]>();
  for (const l of links) byOpp.set(l.opportunityId, [...(byOpp.get(l.opportunityId) ?? []), l.evidence]);
  return rows
    .map((o) => ({ ...o, evidence: byOpp.get(o.id) ?? [] }))
    .sort((a, b) => Number(a.status === "dismissed") - Number(b.status === "dismissed") || b.severity * b.confidence - a.severity * a.confidence);
}

