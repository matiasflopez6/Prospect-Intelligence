import { desc, eq } from "drizzle-orm";
import type { JobStatus, JobType } from "@/domain";
import { getDb, tables } from "@/lib/db";
import { kickRunner } from "./runner";

export type Job = typeof tables.jobs.$inferSelect;

export interface EnqueueInput {
  type: JobType;
  payload: Record<string, unknown>;
  searchId?: number;
  companyId?: number;
  maxAttempts?: number;
}

/** Encola un trabajo en segundo plano y despierta al runner. Devuelve el id del trabajo. */
export function enqueueJob(input: EnqueueInput): number {
  const row = getDb()
    .insert(tables.jobs)
    .values({
      type: input.type,
      payload: input.payload,
      searchId: input.searchId,
      companyId: input.companyId,
      maxAttempts: input.maxAttempts ?? 1,
    })
    .returning({ id: tables.jobs.id })
    .get();
  kickRunner();
  return row.id;
}

export function getJob(id: number): Job | undefined {
  return getDb().select().from(tables.jobs).where(eq(tables.jobs.id, id)).get();
}

export function listJobs(opts: { status?: JobStatus; searchId?: number; companyId?: number; limit?: number } = {}): Job[] {
  const rows = getDb().select().from(tables.jobs).orderBy(desc(tables.jobs.id)).limit(opts.limit ?? 50).all();
  return rows.filter(
    (j) =>
      (!opts.status || j.status === opts.status) &&
      (!opts.searchId || j.searchId === opts.searchId) &&
      (!opts.companyId || j.companyId === opts.companyId),
  );
}
