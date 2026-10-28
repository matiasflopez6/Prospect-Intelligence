import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, ts } from "./_helpers";
import { companies } from "./discovery";

/** Una ejecución de análisis de una empresa. Se conserva el historial. */
export const analyses = sqliteTable(
  "analyses",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull().default("running"),
    error: text("error"),
    websiteUrl: text("website_url"),
    /** Señales técnicas extraídas de la web (estructura: ver modules/analysis/types.ts). */
    signals: text("signals", { mode: "json" }).$type<Record<string, unknown>>(),
    /** Interpretación redactada: qué significa lo encontrado y por qué importa. */
    summary: text("summary"),
    /** Subpuntuaciones de calidad (claridad, CTA, móvil…), 0–100. */
    quality: text("quality", { mode: "json" }).$type<Record<string, number>>(),
    /** Hallazgos interpretados (ver modules/analysis/types.ts → Finding). */
    findings: text("findings", { mode: "json" }).$type<unknown[]>(),
    /** Qué modelo/versión produjo la interpretación. */
    model: text("model"),
    /** Avisos del análisis visibles al usuario (p. ej. "sin ANTHROPIC_API_KEY: interpretación por reglas"). */
    notes: text("notes", { mode: "json" }).$type<string[]>(),
    createdAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("analyses_company_idx").on(t.companyId)],
);

/** Hecho concreto y citable que respalda un hallazgo u oportunidad. */
export const evidence = sqliteTable(
  "evidence",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    analysisId: integer("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["listing", "website", "review", "social", "absence", "other"] }).notNull(),
    /** Clave estable, p. ej. "website.no_whatsapp". */
    key: text("key"),
    label: text("label").notNull(),
    /** Lo observado, en lenguaje claro. */
    detail: text("detail").notNull(),
    sourceUrl: text("source_url"),
    /** Cita literal/extracto cuando existe. */
    excerpt: text("excerpt"),
    observedAt: ts("observed_at").notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_company_idx").on(t.companyId), index("evidence_analysis_idx").on(t.analysisId)],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    analysisId: integer("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    /** Clave de OPPORTUNITY_TYPES o texto libre si el motor detecta otro tipo. */
    type: text("type").notNull(),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    consequence: text("consequence").notNull(),
    proposedSolution: text("proposed_solution").notNull(),
    /** Clave de SERVICES. */
    serviceKey: text("service_key").notNull(),
    impact: text("impact", { enum: ["low", "medium", "high"] }).notNull(),
    impactNote: text("impact_note"),
    /** 1–5 */
    severity: integer("severity").notNull(),
    /** 0–1: confianza en que el problema es real con la evidencia disponible. */
    confidence: real("confidence").notNull(),
    status: text("status", { enum: ["open", "dismissed"] }).notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    index("opportunities_company_idx").on(t.companyId),
    index("opportunities_type_idx").on(t.type),
    index("opportunities_service_idx").on(t.serviceKey),
  ],
);

export const opportunityEvidence = sqliteTable(
  "opportunity_evidence",
  {
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.evidenceId] })],
);

/** Puntuaciones con desglose. Se conserva el historial; la última se copia a companies.score. */
export const scores = sqliteTable(
  "scores",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    analysisId: integer("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
    total: integer("total").notNull(), // 0–100
    tier: text("tier", { enum: ["high", "medium", "low"] }).notNull(),
    /** Confianza global del análisis, 0–1. */
    confidence: real("confidence").notNull(),
    /** Desglose: ver modules/scoring/types.ts → ScoreComponent[]. */
    components: text("components", { mode: "json" }).$type<unknown[]>().notNull(),
    methodVersion: text("method_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scores_company_idx").on(t.companyId)],
);
