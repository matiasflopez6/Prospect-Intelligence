import { and, desc, eq, inArray } from "drizzle-orm";
import type { JobType } from "@/domain";
import { getDb, tables, type Db } from "@/lib/db";

/** Trabajo en cola o en ejecución de este tipo para la empresa (para reanudar el seguimiento tras recargar). */
export function activeJobId(companyId: number, type: JobType, db: Db = getDb()): number | null {
  const row = db
    .select({ id: tables.jobs.id })
    .from(tables.jobs)
    .where(and(eq(tables.jobs.companyId, companyId), eq(tables.jobs.type, type), inArray(tables.jobs.status, ["queued", "running"])))
    .orderBy(desc(tables.jobs.id))
    .limit(1)
    .get();
  return row?.id ?? null;
}

/** Error del último trabajo de este tipo, solo si ese último intento falló. */
export function lastJobError(companyId: number, type: JobType, db: Db = getDb()): string | null {
  const row = db
    .select({ status: tables.jobs.status, error: tables.jobs.error })
    .from(tables.jobs)
    .where(and(eq(tables.jobs.companyId, companyId), eq(tables.jobs.type, type)))
    .orderBy(desc(tables.jobs.id))
    .limit(1)
    .get();
  return row?.status === "failed" ? (row.error ?? "El trabajo falló sin mensaje de error") : null;
}
