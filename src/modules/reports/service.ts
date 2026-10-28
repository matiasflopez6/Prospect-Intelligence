import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, tables, type Db } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { logActivity } from "../activity/service";
import type { JobContext } from "../jobs/handlers";
import { getSenderProfile } from "../profile/sender";
import { composeReportContent, ReportPrerequisiteError, type ReportSource } from "./compose";
import { renderReportHtml } from "./html";
import { renderPdf, resolveReportPath } from "./pdf";
import type { ReportContent } from "./types";

export type Report = typeof tables.reports.$inferSelect;

export interface ReportDeps {
  db?: Db;
  pdf?: typeof renderPdf;
  log?: typeof logActivity;
  now?: () => Date;
}

/** Carga los datos persistidos del último análisis completado. Sin análisis no hay informe. */
export function loadReportSource(companyId: number, db: Db): ReportSource {
  const company = db.select().from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!company) throw new ReportPrerequisiteError(`La empresa ${companyId} no existe.`);
  const analysis = db
    .select()
    .from(tables.analyses)
    .where(and(eq(tables.analyses.companyId, companyId), eq(tables.analyses.status, "done")))
    .orderBy(desc(tables.analyses.id))
    .limit(1)
    .get();
  if (!analysis) {
    throw new ReportPrerequisiteError("Esta empresa aún no tiene un análisis completado. Analízala antes de generar el informe.");
  }

  const opps = db
    .select()
    .from(tables.opportunities)
    .where(and(eq(tables.opportunities.companyId, companyId), eq(tables.opportunities.status, "open"), eq(tables.opportunities.analysisId, analysis.id)))
    .all();
  const evidence = db
    .select()
    .from(tables.evidence)
    .where(and(eq(tables.evidence.companyId, companyId), eq(tables.evidence.analysisId, analysis.id)))
    .orderBy(tables.evidence.id)
    .all();
  const links = opps.length
    ? db.select().from(tables.opportunityEvidence).where(inArray(tables.opportunityEvidence.opportunityId, opps.map((o) => o.id))).all()
    : [];
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const score = db.select().from(tables.scores).where(eq(tables.scores.companyId, companyId)).orderBy(desc(tables.scores.id)).limit(1).get();
  const socials = db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, companyId)).all();

  return {
    company,
    analysis: { summary: analysis.summary, quality: analysis.quality, findings: analysis.findings },
    opportunities: opps.map((o) => ({
      ...o,
      evidence: links.filter((l) => l.opportunityId === o.id).flatMap((l) => evById.get(l.evidenceId) ?? []),
    })),
    evidence,
    score: score ? { total: score.total, tier: score.tier } : undefined,
    socialPlatforms: [...new Set(socials.map((s) => s.platform))],
    sender: getSenderProfile(db),
  };
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "empresa";

async function writePdf(report: Pick<Report, "id" | "companyId">, content: ReportContent, deps: ReportDeps): Promise<string> {
  const buffer = await (deps.pdf ?? renderPdf)(renderReportHtml(content), `${content.company.name} · Informe de oportunidades de mejora`);
  const relative = path.join(String(report.companyId), `informe-${slug(content.company.name)}-${report.id}.pdf`);
  const full = resolveReportPath(relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return relative;
}

/**
 * Construye ReportContent a partir de los datos persistidos (sin inventar), lo guarda en `reports`
 * y renderiza el PDF en REPORTS_DIR. Si el PDF falla, el contenido se conserva (status "failed")
 * y se puede reintentar con `regeneratePdf`.
 */
export async function generateReport(companyId: number, deps: ReportDeps = {}): Promise<number> {
  const db = deps.db ?? getDb();
  const log = deps.log ?? logActivity;
  const now = deps.now?.() ?? new Date();
  const content = composeReportContent(loadReportSource(companyId, db), now);

  const row = db
    .insert(tables.reports)
    .values({ companyId, title: `Informe de oportunidades — ${content.company.name}`, status: "generating", content: content as unknown as Record<string, unknown> })
    .returning()
    .get();
  try {
    const pdfPath = await writePdf(row, content, deps);
    db.update(tables.reports).set({ status: "ready", pdfPath, generatedAt: new Date(), error: null }).where(eq(tables.reports.id, row.id)).run();
  } catch (e) {
    db.update(tables.reports).set({ status: "failed", error: errorMessage(e) }).where(eq(tables.reports.id, row.id)).run();
    throw e;
  }
  log({ type: "report.generated", message: `Informe generado para «${content.company.name}»`, companyId, meta: { reportId: row.id } });
  return row.id;
}

/** Vuelve a renderizar el PDF de un informe existente a partir de su contenido guardado. */
export async function regeneratePdf(reportId: number, deps: ReportDeps = {}): Promise<void> {
  const db = deps.db ?? getDb();
  const report = getReport(reportId, db);
  if (!report?.content) throw new Error("El informe no existe o no tiene contenido guardado.");
  db.update(tables.reports).set({ status: "generating", error: null }).where(eq(tables.reports.id, reportId)).run();
  try {
    const pdfPath = await writePdf(report, report.content as unknown as ReportContent, deps);
    db.update(tables.reports).set({ status: "ready", pdfPath, generatedAt: new Date() }).where(eq(tables.reports.id, reportId)).run();
  } catch (e) {
    db.update(tables.reports).set({ status: "failed", error: errorMessage(e) }).where(eq(tables.reports.id, reportId)).run();
    throw e;
  }
}

export async function generateReportForJob(payload: Record<string, unknown>, ctx: JobContext) {
  ctx.setProgress(15, "Reuniendo análisis y evidencias");
  const companyId = Number(payload.companyId);
  if (payload.reportId) {
    ctx.setProgress(50, "Generando PDF");
    await regeneratePdf(Number(payload.reportId));
    return { reportId: Number(payload.reportId) };
  }
  ctx.setProgress(50, "Maquetando y generando PDF");
  const reportId = await generateReport(companyId);
  ctx.setProgress(100, "Listo");
  return { reportId };
}

export function getReport(id: number, db: Db = getDb()): Report | undefined {
  return db.select().from(tables.reports).where(eq(tables.reports.id, id)).get();
}

export function listReports(opts: { companyId?: number; limit?: number } = {}, db: Db = getDb()) {
  const q = db
    .select({
      id: tables.reports.id,
      companyId: tables.reports.companyId,
      companyName: tables.companies.name,
      title: tables.reports.title,
      status: tables.reports.status,
      error: tables.reports.error,
      pdfPath: tables.reports.pdfPath,
      createdAt: tables.reports.createdAt,
      generatedAt: tables.reports.generatedAt,
    })
    .from(tables.reports)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.reports.companyId));
  return (opts.companyId ? q.where(eq(tables.reports.companyId, opts.companyId)) : q)
    .orderBy(desc(tables.reports.id))
    .limit(opts.limit ?? 100)
    .all();
}
