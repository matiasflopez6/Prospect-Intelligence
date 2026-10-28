import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { logActivity } from "../activity/service";
import type { JobContext } from "../jobs/handlers";
import { detectOpportunities, type DetectionResult } from "../opportunities/engine";
import type { OpportunityContext, OpportunityDraft } from "../opportunities/types";
import { scoreCompany } from "../scoring/engine";
import type { ScoreResult, ScoringInput } from "../scoring/types";
import { buildFacts } from "./facts";
import { createInterpreter } from "./interpreter";
import { createWebsiteAnalyzer } from "./website-analyzer";
import type { AnalysisInput, AnalysisInterpretation, AnalysisInterpreter, EvidenceDraft, WebsiteAnalyzer, WebsiteSignals } from "./types";

type Db = ReturnType<typeof getDb>;
type Company = typeof tables.companies.$inferSelect;

/** Dependencias sustituibles (tests y futuras variantes). Por defecto, las implementaciones reales. */
export interface PipelineDeps {
  analyzer: WebsiteAnalyzer;
  interpreter: AnalysisInterpreter;
  detect: (ctx: OpportunityContext) => Promise<DetectionResult>;
  score: (input: ScoringInput) => ScoreResult;
}

export interface AnalyzeCompanyResult {
  companyId: number;
  analysisId: number;
  score: number;
  tier: ScoreResult["tier"];
  opportunities: number;
  evidence: number;
  websiteReachable: boolean;
  model: string;
  notes: string[];
}

/**
 * Orquesta el análisis completo de una empresa:
 *   1. WebsiteAnalyzer.analyze → señales (si tiene web)
 *   2. AnalysisInterpreter.interpret → resumen + hallazgos + evidencias (tablas analyses, evidence)
 *   3. detectOpportunities → oportunidades (tabla opportunities + opportunity_evidence)
 *   4. scoreCompany → puntuación (tabla scores + columnas desnormalizadas de companies)
 *   5. Actualiza companies.analysisStatus, crm_entries.status ("new" → "analyzed") y activity_log
 *
 * Reanalizar es seguro: se conserva el historial de análisis y puntuaciones; las oportunidades
 * abiertas se sustituyen por las nuevas y las descartadas por el usuario siguen descartadas.
 */
export async function analyzeCompany(companyId: number, ctx: JobContext, deps: Partial<PipelineDeps> = {}): Promise<AnalyzeCompanyResult> {
  const db = getDb();
  const company = db.select().from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!company) throw new Error(`La empresa ${companyId} no existe`);

  const analyzer = deps.analyzer ?? createWebsiteAnalyzer();
  const interpreter = deps.interpreter ?? createInterpreter();
  const detect = deps.detect ?? detectOpportunities;
  const score = deps.score ?? scoreCompany;

  const analysis = db
    .insert(tables.analyses)
    .values({ companyId, status: "running", websiteUrl: company.website })
    .returning({ id: tables.analyses.id })
    .get();
  db.update(tables.companies).set({ analysisStatus: "running", analysisError: null }).where(eq(tables.companies.id, companyId)).run();

  try {
    ctx.setProgress(5, "Cargando datos de la empresa");
    const reviews = db.select().from(tables.reviews).where(eq(tables.reviews.companyId, companyId)).all();
    const knownSocial = db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, companyId)).all();

    let signals: WebsiteSignals | undefined;
    if (company.website?.trim()) {
      ctx.setProgress(10, "Analizando la web");
      signals = await analyzer.analyze({ companyId, url: company.website });
    }

    const socialProfiles = mergeSocial(knownSocial, signals);
    ctx.setProgress(50, "Interpretando el negocio");
    const input: AnalysisInput = { company, signals, reviews, socialProfiles };
    const interpretation = await interpreter.interpret(input);

    ctx.setProgress(70, "Detectando oportunidades");
    const detection = await detect({ company, signals, interpretation, reviews, socialProfiles });

    // Oportunidades que el usuario descartó antes: no se reabren al reanalizar.
    const dismissedTypes = new Set(
      db
        .select({ type: tables.opportunities.type })
        .from(tables.opportunities)
        .where(and(eq(tables.opportunities.companyId, companyId), eq(tables.opportunities.status, "dismissed")))
        .all()
        .map((r) => r.type),
    );
    const drafts = detection.drafts.filter((d) => !dismissedTypes.has(d.type));

    ctx.setProgress(85, "Calculando la puntuación");
    const facts = buildFacts({ company, signals, reviews, socialProfiles });
    const s = facts.situation;
    const scoreResult = score({
      company,
      opportunities: drafts,
      websiteReachable: Boolean(signals?.reachable),
      context: {
        quality: interpretation.quality,
        hasWebsite: s.hasWebsiteUrl,
        phone: s.phone,
        email: s.email,
        whatsapp: s.whatsapp,
        recentReviews: s.recentReviewsInSample,
        sampleSize: s.sampleSize,
      },
    });

    const aiNotes = [interpretation.fallbackReason, detection.fallbackReason].filter((n): n is string => Boolean(n));
    // Si ambas etapas cayeron por el mismo motivo (sin clave de IA), se avisa una sola vez.
    const notes = aiNotes.every((n) => n.startsWith("Sin ANTHROPIC_API_KEY"))
      ? aiNotes.length ? ["Sin ANTHROPIC_API_KEY: la interpretación y la redacción de oportunidades usan reglas deterministas basadas en evidencias (sin IA)."] : []
      : [...new Set(aiNotes)];
    if (signals && !signals.reachable) notes.push(`No se pudo leer la web: ${signals.fetchError ?? "error desconocido"}`);
    if (signals?.likelyClientRendered) notes.push("La web carga su contenido con JavaScript: las ausencias detectadas (chat, reservas…) son menos fiables.");

    ctx.setProgress(92, "Guardando resultados");
    const evidenceCount = persist(db, {
      company,
      analysisId: analysis.id,
      signals,
      interpretation,
      drafts,
      scoreResult,
      model: interpretation.model === detection.model ? detection.model : `${interpretation.model ?? "—"} / ${detection.model}`,
      notes,
      socialFound: signals?.social ?? [],
    });

    logActivity({
      type: "company.analyzed",
      message: `Analizada ${company.name}: puntuación ${scoreResult.total}/100, ${drafts.length} oportunidad(es)`,
      companyId,
      meta: { analysisId: analysis.id, score: scoreResult.total, tier: scoreResult.tier, opportunities: drafts.length },
    });
    ctx.setProgress(100, "Análisis completado");

    return {
      companyId,
      analysisId: analysis.id,
      score: scoreResult.total,
      tier: scoreResult.tier,
      opportunities: drafts.length,
      evidence: evidenceCount,
      websiteReachable: Boolean(signals?.reachable),
      model: interpretation.model ?? "—",
      notes,
    };
  } catch (e) {
    const message = errorMessage(e);
    db.update(tables.analyses).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(tables.analyses.id, analysis.id)).run();
    db.update(tables.companies).set({ analysisStatus: "failed", analysisError: message }).where(eq(tables.companies.id, companyId)).run();
    logActivity({ type: "company.analysis_failed", message: `Falló el análisis de ${company.name}: ${message}`, companyId });
    throw e;
  }
}

function mergeSocial(known: { platform: string; url: string }[], signals?: WebsiteSignals) {
  const map = new Map<string, { platform: string; url: string }>();
  for (const s of [...known, ...(signals?.social ?? [])]) map.set(s.url.toLowerCase(), { platform: s.platform, url: s.url });
  return [...map.values()];
}

interface PersistInput {
  company: Company;
  analysisId: number;
  signals?: WebsiteSignals;
  interpretation: AnalysisInterpretation;
  drafts: OpportunityDraft[];
  scoreResult: ScoreResult;
  model: string;
  notes: string[];
  socialFound: { platform: string; url: string }[];
}

/** Escribe todo el resultado en una única transacción: o queda completo o no queda nada a medias. */
function persist(db: Db, p: PersistInput): number {
  return db.transaction((tx) => {
    const companyId = p.company.id;

    // --- Evidencias (una fila por empresa y clave; se reutiliza para no romper referencias de mensajes/informes) ---
    const all = new Map<string, EvidenceDraft>();
    const collect = (list: EvidenceDraft[]) => {
      for (const e of list) all.set(e.key ?? `${e.kind}:${e.label}`, { ...e, key: e.key ?? `${e.kind}:${e.label}` });
    };
    p.interpretation.findings.forEach((f) => collect(f.evidence));
    p.drafts.forEach((d) => collect(d.evidence));

    const existing = tx.select().from(tables.evidence).where(and(eq(tables.evidence.companyId, companyId), isNotNull(tables.evidence.key))).all();
    const existingByKey = new Map(existing.map((e) => [e.key!, e.id]));
    const evidenceIds = new Map<string, number>();
    const observedAt = new Date();
    for (const [key, e] of all) {
      const values = { kind: e.kind, label: e.label, detail: e.detail, sourceUrl: e.sourceUrl ?? null, excerpt: e.excerpt ?? null, analysisId: p.analysisId, observedAt };
      const prev = existingByKey.get(key);
      if (prev) {
        tx.update(tables.evidence).set(values).where(eq(tables.evidence.id, prev)).run();
        evidenceIds.set(key, prev);
      } else {
        const row = tx.insert(tables.evidence).values({ companyId, key, ...values }).returning({ id: tables.evidence.id }).get();
        evidenceIds.set(key, row.id);
      }
    }

    // --- Análisis ---
    const findings = p.interpretation.findings.map((f) => ({
      key: f.key,
      title: f.title,
      explanation: f.explanation,
      severity: f.severity,
      positive: f.positive ?? false,
      evidenceIds: f.evidence.map((e) => evidenceIds.get(e.key ?? `${e.kind}:${e.label}`)).filter((id): id is number => id != null),
    }));
    tx.update(tables.analyses)
      .set({
        status: "done",
        signals: p.signals ? (JSON.parse(JSON.stringify(p.signals)) as Record<string, unknown>) : null,
        summary: p.interpretation.summary,
        quality: p.interpretation.quality,
        findings,
        model: p.model,
        notes: p.notes,
        finishedAt: new Date(),
      })
      .where(eq(tables.analyses.id, p.analysisId))
      .run();

    // --- Oportunidades: se sustituyen las abiertas anteriores ---
    tx.delete(tables.opportunities).where(and(eq(tables.opportunities.companyId, companyId), eq(tables.opportunities.status, "open"))).run();
    for (const d of p.drafts) {
      const opp = tx
        .insert(tables.opportunities)
        .values({
          companyId,
          analysisId: p.analysisId,
          type: d.type,
          title: d.title,
          problem: d.problem,
          consequence: d.consequence,
          proposedSolution: d.proposedSolution,
          serviceKey: d.serviceKey,
          impact: d.impact,
          impactNote: d.impactNote ?? null,
          severity: d.severity,
          confidence: d.confidence,
        })
        .returning({ id: tables.opportunities.id })
        .get();
      const links = d.evidence
        .map((e) => evidenceIds.get(e.key ?? `${e.kind}:${e.label}`))
        .filter((id): id is number => id != null);
      for (const evidenceId of new Set(links)) {
        tx.insert(tables.opportunityEvidence).values({ opportunityId: opp.id, evidenceId }).run();
      }
    }

    // --- Puntuación ---
    tx.insert(tables.scores)
      .values({
        companyId,
        analysisId: p.analysisId,
        total: p.scoreResult.total,
        tier: p.scoreResult.tier,
        confidence: p.scoreResult.confidence,
        components: p.scoreResult.components,
        methodVersion: p.scoreResult.methodVersion,
      })
      .run();

    // --- Resumen desnormalizado + datos de contacto hallados en la web ---
    const top = [...p.drafts].sort((a, b) => b.severity * b.confidence - a.severity * a.confidence)[0];
    const contact = p.signals?.reachable ? contactUpdates(p.company, p.signals) : {};
    tx.update(tables.companies)
      .set({
        ...contact,
        score: p.scoreResult.total,
        scoreTier: p.scoreResult.tier,
        opportunityCount: p.drafts.length,
        topServiceKey: top?.serviceKey ?? null,
        analyzedAt: new Date(),
        analysisStatus: "done",
        analysisError: null,
      })
      .where(eq(tables.companies.id, companyId))
      .run();
    if (Object.keys(contact).length > 0 && p.signals) {
      tx.insert(tables.companySources)
        .values({ companyId, provider: "website", url: p.signals.finalUrl ?? p.signals.url, fields: Object.keys(contact) })
        .run();
    }

    // --- Redes enlazadas en la web ---
    for (const s of p.socialFound) {
      tx.insert(tables.socialProfiles)
        .values({ companyId, platform: s.platform, url: s.url, handle: handleFrom(s.url), foundVia: "website" })
        .onConflictDoNothing()
        .run();
    }

    // --- CRM: Nueva → Analizada (nunca retrocede un estado más avanzado) ---
    const crm = tx.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, companyId)).get();
    if (!crm) {
      tx.insert(tables.crmEntries).values({ companyId, status: "analyzed" }).run();
    } else if (crm.status === "new") {
      tx.update(tables.crmEntries).set({ status: "analyzed", statusChangedAt: new Date() }).where(eq(tables.crmEntries.id, crm.id)).run();
    }

    // --- Contador de empresas analizadas de las búsquedas que la incluyen (recalculado: idempotente) ---
    const searchIds = tx
      .select({ id: tables.searchCompanies.searchId })
      .from(tables.searchCompanies)
      .where(eq(tables.searchCompanies.companyId, companyId))
      .all()
      .map((r) => r.id);
    if (searchIds.length) {
      for (const searchId of searchIds) {
        const row = tx
          .select({ n: sql<number>`count(*)` })
          .from(tables.searchCompanies)
          .innerJoin(tables.companies, eq(tables.companies.id, tables.searchCompanies.companyId))
          .where(and(eq(tables.searchCompanies.searchId, searchId), eq(tables.companies.analysisStatus, "done")))
          .get();
        tx.update(tables.searches).set({ analyzedCount: Number(row?.n ?? 0) }).where(eq(tables.searches.id, searchId)).run();
      }
    }

    return evidenceIds.size;
  });
}

/** Solo rellena huecos: nunca pisa un dato que ya vino de una fuente anterior. */
function contactUpdates(company: Company, signals: WebsiteSignals): Partial<Pick<Company, "email" | "phone" | "whatsapp">> {
  const out: Partial<Pick<Company, "email" | "phone" | "whatsapp">> = {};
  if (!company.email && signals.contact?.emails[0]) out.email = signals.contact.emails[0];
  if (!company.phone && signals.contact?.phones[0]) out.phone = signals.contact.phones[0];
  if (!company.whatsapp && signals.contact?.whatsappLinks[0]) {
    const number = whatsappNumber(signals.contact.whatsappLinks[0]);
    if (number) out.whatsapp = number;
  }
  return out;
}

export function whatsappNumber(link: string): string | undefined {
  const m = link.match(/wa\.me\/(\+?\d{8,15})|[?&]phone=(\+?\d{8,15})/i);
  const digits = m?.[1] ?? m?.[2];
  return digits ? `+${digits.replace(/^\+/, "")}` : undefined;
}

function handleFrom(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts.find((p) => !["company", "in", "channel", "c", "user", "school"].includes(p));
    return last ? last.replace(/^@/, "") : null;
  } catch {
    return null;
  }
}
