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

  it("un trabajo cuyo módulo no está implementado falla con mensaje explícito (no inventa datos)", async () => {
    const { createSearch, getSearch } = await import("../discovery/service");
    const { getJob, listJobs } = await import("./service");
    const searchId = createSearch({ niche: "x", location: "y", targetCount: 5 });
    expect(getSearch(searchId)).toBeDefined();
    const jobId = listJobs({ searchId })[0]!.id;
    for (let i = 0; i < 50 && getJob(jobId)?.status !== "failed"; i++) await new Promise((r) => setTimeout(r, 100));
    const job = getJob(jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/No implementado/);
  });
});
