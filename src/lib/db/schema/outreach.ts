import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, ts, updatedAt } from "./_helpers";
import { opportunities } from "./analysis";
import { companies } from "./discovery";

/** Mensajes de contacto generados (uno por canal y versión). */
export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Oportunidad principal sobre la que se abre la conversación. */
    opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    channel: text("channel", { enum: ["email", "linkedin", "whatsapp"] }).notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    language: text("language").notNull().default("es"),
    status: text("status", { enum: ["draft", "approved", "sent"] }).notNull().default("draft"),
    /** IDs de evidence en los que se apoya el mensaje (trazabilidad: nada inventado). */
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<number[]>(),
    model: text("model"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("messages_company_idx").on(t.companyId)],
);

/** Informes comerciales. `content` es estructurado; el PDF es un derivado. */
export const reports = sqliteTable(
  "reports",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: ["generating", "ready", "failed"] }).notNull().default("generating"),
    /** Contenido estructurado: ver modules/reports/types.ts → ReportContent. */
    content: text("content", { mode: "json" }).$type<Record<string, unknown>>(),
    /** Ruta relativa del PDF dentro de REPORTS_DIR (data/reports). */
    pdfPath: text("pdf_path"),
    error: text("error"),
    model: text("model"),
    createdAt: createdAt(),
    generatedAt: ts("generated_at"),
  },
  (t) => [index("reports_company_idx").on(t.companyId)],
);
