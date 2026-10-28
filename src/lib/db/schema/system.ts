import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, ts } from "./_helpers";
import { companies, searches } from "./discovery";

/** Cola de trabajos persistente (ejecutada por el runner en proceso). */
export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type", {
      enum: ["discovery.run", "company.analyze", "message.generate", "report.generate"],
    }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] })
      .notNull()
      .default("queued"),
    /** 0–100, opcional, para mostrar barra de progreso. */
    progress: integer("progress").notNull().default(0),
    progressLabel: text("progress_label"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(1),
    error: text("error"),
    result: text("result", { mode: "json" }),
    searchId: integer("search_id").references(() => searches.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.createdAt), index("jobs_search_idx").on(t.searchId)],
);

/** Registro de actividad: alimenta "actividad reciente" y la línea de tiempo de cada empresa. */
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: id(),
    /** p. ej. "search.completed", "company.analyzed", "crm.status_changed", "message.generated" */
    type: text("type").notNull(),
    message: text("message").notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    searchId: integer("search_id").references(() => searches.id, { onDelete: "cascade" }),
    actor: text("actor"), // nombre del miembro o "system"
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt), index("activity_company_idx").on(t.companyId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedAt: ts("updated_at").$defaultFn(() => new Date()),
});
