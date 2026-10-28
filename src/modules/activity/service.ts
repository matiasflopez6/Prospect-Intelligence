import { desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

export interface ActivityInput {
  /** Clave con punto: "search.completed", "company.analyzed", "crm.status_changed"… */
  type: string;
  message: string;
  companyId?: number;
  searchId?: number;
  actor?: string;
  meta?: Record<string, unknown>;
}

/** Registra un evento visible en "actividad reciente" y en la línea de tiempo de la empresa. */
export function logActivity(input: ActivityInput): void {
  getDb()
    .insert(tables.activityLog)
    .values({
      type: input.type,
      message: input.message,
      companyId: input.companyId,
      searchId: input.searchId,
      actor: input.actor ?? "system",
      meta: input.meta,
    })
    .run();
}

export function listRecentActivity(opts: { limit?: number; companyId?: number } = {}) {
  const db = getDb();
  const q = db.select().from(tables.activityLog);
  const filtered = opts.companyId ? q.where(eq(tables.activityLog.companyId, opts.companyId)) : q;
  return filtered.orderBy(desc(tables.activityLog.createdAt), desc(tables.activityLog.id)).limit(opts.limit ?? 20).all();
}
