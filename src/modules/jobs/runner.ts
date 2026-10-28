import { and, asc, eq, sql } from "drizzle-orm";
import { getEnv } from "@/lib/config/env";
import { getDb, tables } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { jobHandlers, type JobContext } from "./handlers";

/**
 * Runner de trabajos en proceso, respaldado por la tabla `jobs`.
 * - Arranca desde src/instrumentation.ts al iniciar el servidor Next.
 * - Al arrancar, los trabajos "running" huérfanos (caída del proceso) vuelven a "queued".
 * - Concurrencia configurable con JOB_CONCURRENCY.
 */

interface RunnerState {
  started: boolean;
  active: number;
  timer?: NodeJS.Timeout;
}

const g = globalThis as unknown as { __jobRunner?: RunnerState };
const state: RunnerState = (g.__jobRunner ??= { started: false, active: 0 });

const POLL_MS = 2000;

export function startJobRunner(): void {
  if (state.started) return;
  state.started = true;
  const db = getDb();
  db.update(tables.jobs)
    .set({ status: "queued", startedAt: null })
    .where(eq(tables.jobs.status, "running"))
    .run();
  state.timer = setInterval(() => void tick(), POLL_MS);
  state.timer.unref?.();
  void tick();
}

export function stopJobRunner(): void {
  if (state.timer) clearInterval(state.timer);
  state.started = false;
}

/** Despierta al runner sin esperar al siguiente sondeo. */
export function kickRunner(): void {
  if (!state.started) startJobRunner();
  else void tick();
}

async function tick(): Promise<void> {
  const max = getEnv().JOB_CONCURRENCY;
  while (state.active < max) {
    const job = claimNext();
    if (!job) return;
    state.active++;
    void execute(job).finally(() => {
      state.active--;
      void tick();
    });
  }
}

function claimNext() {
  const db = getDb();
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(tables.jobs)
      .where(eq(tables.jobs.status, "queued"))
      .orderBy(asc(tables.jobs.id))
      .limit(1)
      .get();
    if (!next) return undefined;
    return tx
      .update(tables.jobs)
      .set({ status: "running", startedAt: new Date(), attempts: sql`${tables.jobs.attempts} + 1` })
      .where(and(eq(tables.jobs.id, next.id), eq(tables.jobs.status, "queued")))
      .returning()
      .get();
  });
}

async function execute(job: typeof tables.jobs.$inferSelect): Promise<void> {
  const db = getDb();
  const ctx: JobContext = {
    setProgress(percent, label) {
      db.update(tables.jobs)
        .set({ progress: Math.max(0, Math.min(100, Math.round(percent))), progressLabel: label ?? null })
        .where(eq(tables.jobs.id, job.id))
        .run();
    },
  };
  try {
    const result = await jobHandlers[job.type](job, ctx);
    db.update(tables.jobs)
      .set({ status: "succeeded", progress: 100, result: result ?? null, error: null, finishedAt: new Date() })
      .where(eq(tables.jobs.id, job.id))
      .run();
  } catch (e) {
    const retry = job.attempts < job.maxAttempts;
    console.error(`[jobs] ${job.type} #${job.id} falló:`, e);
    db.update(tables.jobs)
      .set({
        status: retry ? "queued" : "failed",
        error: errorMessage(e),
        finishedAt: retry ? null : new Date(),
      })
      .where(eq(tables.jobs.id, job.id))
      .run();
  }
}
