import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("base de datos + runner de trabajos", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = ":memory:";
  });
  afterAll(async () => {
    (await import("./runner")).stopJobRunner();
  });

  it("migra el esquema y persiste una búsqueda", async () => {
    const { getDb, tables } = await import("@/lib/db");
    const row = getDb()
      .insert(tables.searches)
      .values({ niche: "clínicas dentales", location: "Salta, Argentina", targetCount: 10 })
      .returning()
      .get();
    expect(row.status).toBe("queued");
  });

  it("un trabajo que lanza un error queda 'failed' con el mensaje (no se pierde ni se inventa resultado)", async () => {
    const { enqueueJob, getJob } = await import("./service");
    const jobId = enqueueJob({ type: "discovery.run", payload: { searchId: 999_999 } });
    for (let i = 0; i < 50 && getJob(jobId)?.status !== "failed"; i++) await new Promise((r) => setTimeout(r, 100));
    const job = getJob(jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/no existe/);
  });
});
