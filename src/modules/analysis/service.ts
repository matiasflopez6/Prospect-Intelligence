import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { enqueueJob, listJobs } from "../jobs/service";
import type { Finding, WebsiteSignals } from "./types";

type EvidenceRow = typeof tables.evidence.$inferSelect;

export interface StoredFinding extends Omit<Finding, "evidence" | "positive"> {
  positive: boolean;
  evidenceIds: number[];
}

export interface AnalysisView {
  id: number;
  status: "running" | "done" | "failed";
  error: string | null;
  summary: string | null;
  quality: Record<string, number>;
  findings: (StoredFinding & { evidence: EvidenceRow[] })[];
  signals: WebsiteSignals | null;
  model: string | null;
  notes: string[];
  createdAt: Date;
  finishedAt: Date | null;
}

export type AnalysisState =
  | { kind: "in_progress"; progress: number; label: string | null }
  | { kind: "never" }
  | { kind: "failed"; error: string }
  | { kind: "done"; analysis: AnalysisView; previousAnalyses: number };

/** Trabajo de análisis pendiente o en curso para la empresa (si lo hay). */
export function getActiveAnalysisJob(companyId: number) {
  return listJobs({ companyId, limit: 20 }).find((j) => j.type === "company.analyze" && (j.status === "queued" || j.status === "running"));
}

export function getLatestAnalysis(companyId: number): AnalysisView | undefined {
  const db = getDb();
  const row = db
    .select()
    .from(tables.analyses)
    .where(and(eq(tables.analyses.companyId, companyId), eq(tables.analyses.status, "done")))
    .orderBy(desc(tables.analyses.id))
    .limit(1)
    .get();
  if (!row) return undefined;
  const findings = ((row.findings ?? []) as StoredFinding[]).filter(Boolean);
  const ids = [...new Set(findings.flatMap((f) => f.evidenceIds ?? []))];
  const evidence = ids.length ? db.select().from(tables.evidence).where(inArray(tables.evidence.id, ids)).all() : [];
  const byId = new Map(evidence.map((e) => [e.id, e]));
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    summary: row.summary,
    quality: row.quality ?? {},
    findings: findings.map((f) => ({ ...f, evidence: (f.evidenceIds ?? []).map((id) => byId.get(id)).filter((e): e is EvidenceRow => Boolean(e)) })),
    signals: (row.signals as WebsiteSignals | null) ?? null,
    model: row.model,
    notes: row.notes ?? [],
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

/** Estado que la ficha debe mostrar para el análisis de la empresa. */
export function getAnalysisState(companyId: number): AnalysisState {
  const job = getActiveAnalysisJob(companyId);
  if (job) return { kind: "in_progress", progress: job.progress, label: job.progressLabel };
  const analysis = getLatestAnalysis(companyId);
  if (analysis) {
    const total = getDb().select({ id: tables.analyses.id }).from(tables.analyses).where(and(eq(tables.analyses.companyId, companyId), eq(tables.analyses.status, "done"))).all().length;
    return { kind: "done", analysis, previousAnalyses: total - 1 };
  }
  const company = getDb().select({ status: tables.companies.analysisStatus, error: tables.companies.analysisError }).from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (company?.status === "failed") return { kind: "failed", error: company.error ?? "Error desconocido" };
  return { kind: "never" };
}

/** Evidencias del último análisis y qué oportunidades/hallazgos las usan. */
export function listEvidence(companyId: number) {
  const db = getDb();
  const latest = db
    .select({ id: tables.analyses.id })
    .from(tables.analyses)
    .where(and(eq(tables.analyses.companyId, companyId), eq(tables.analyses.status, "done")))
    .orderBy(desc(tables.analyses.id))
    .limit(1)
    .get();
  if (!latest) return [];
  const rows = db.select().from(tables.evidence).where(and(eq(tables.evidence.companyId, companyId), eq(tables.evidence.analysisId, latest.id))).all();
  const links = rows.length
    ? db
        .select({ evidenceId: tables.opportunityEvidence.evidenceId, title: tables.opportunities.title })
        .from(tables.opportunityEvidence)
        .innerJoin(tables.opportunities, eq(tables.opportunities.id, tables.opportunityEvidence.opportunityId))
        .where(and(inArray(tables.opportunityEvidence.evidenceId, rows.map((r) => r.id)), eq(tables.opportunities.status, "open")))
        .all()
    : [];
  const usedBy = new Map<number, string[]>();
  for (const l of links) usedBy.set(l.evidenceId, [...(usedBy.get(l.evidenceId) ?? []), l.title]);
  return rows.map((e) => ({ ...e, usedBy: usedBy.get(e.id) ?? [] }));
}

/** Encola un (re)análisis salvo que ya haya uno pendiente. Devuelve el id del trabajo. */
export function requestAnalysis(companyId: number): { jobId: number; alreadyRunning: boolean } {
  const active = getActiveAnalysisJob(companyId);
  if (active) return { jobId: active.id, alreadyRunning: true };
  return { jobId: enqueueJob({ type: "company.analyze", payload: { companyId }, companyId }), alreadyRunning: false };
}
