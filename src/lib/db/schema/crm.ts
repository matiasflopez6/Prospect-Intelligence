import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, ts, updatedAt } from "./_helpers";
import { companies } from "./discovery";

/** Personas que pueden ser responsables de una empresa. */
export const members = sqliteTable("members", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: createdAt(),
});

/** Estado CRM actual de una empresa (1:1). Se crea al descubrir la empresa. */
export const crmEntries = sqliteTable(
  "crm_entries",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["new", "analyzed", "priority", "contacted", "replied", "meeting", "proposal", "won", "lost"],
    })
      .notNull()
      .default("new"),
    ownerId: integer("owner_id").references(() => members.id, { onDelete: "set null" }),
    nextAction: text("next_action"),
    followUpAt: ts("follow_up_at"),
    lastContactedAt: ts("last_contacted_at"),
    lostReason: text("lost_reason"),
    statusChangedAt: ts("status_changed_at").notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("crm_entries_company_uq").on(t.companyId),
    index("crm_entries_status_idx").on(t.status),
    index("crm_entries_followup_idx").on(t.followUpAt),
  ],
);

export const crmNotes = sqliteTable(
  "crm_notes",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => members.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("crm_notes_company_idx").on(t.companyId)],
);
