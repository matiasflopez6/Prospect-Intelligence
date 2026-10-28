import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tables: typeof import("@/lib/db").tables;
let db: ReturnType<typeof import("@/lib/db").getDb>;
let getDashboard: typeof import("./service").getDashboard;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  const mod = await import("@/lib/db");
  tables = mod.tables;
  db = mod.getDb();
  ({ getDashboard } = await import("./service"));
});
afterAll(async () => {
  (await import("../jobs/runner")).stopJobRunner();
});

describe("getDashboard", () => {
  it("con la base vacía devuelve ceros y listas vacías (sin datos de ejemplo)", () => {
    const d = getDashboard();
    expect(d).toMatchObject({ found: 0, analyzed: 0, priorityCount: 0, scored: 0, topProspects: [], problems: [], services: [], activity: [] });
    expect(d.scoreBuckets).toEqual(new Array(10).fill(0));
    expect(d.pipeline.every((p) => p.count === 0)).toBe(true);
  });

  it("agrega solo datos reales", () => {
    const mk = (name: string, over: Partial<typeof tables.companies.$inferInsert>, status: "new" | "analyzed" | "contacted" | "won", followUpAt?: Date) => {
      const row = db.insert(tables.companies).values({ name, normalizedName: name, ...over }).returning().get();
      db.insert(tables.crmEntries).values({ companyId: row.id, status, followUpAt }).run();
      return row;
    };
    const day = (n: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n, 12);
    const a = mk("A", { score: 100, scoreTier: "high", opportunityCount: 3, topServiceKey: "online_booking", analysisStatus: "done" }, "analyzed");
    mk("B", { score: 72, scoreTier: "high", analysisStatus: "done" }, "won"); // alta pero cerrada: no es prioritaria
    mk("C", { score: 5, scoreTier: "low", analysisStatus: "done" }, "contacted", day(-1));
    mk("D", {}, "new", day(2));
    const opp = (companyId: number, type: string, serviceKey: string, impact: "low" | "high") =>
      db.insert(tables.opportunities).values({ companyId, type, title: type, problem: "p", consequence: "c", proposedSolution: "s", serviceKey, impact, severity: 3, confidence: 0.8 }).run();
    opp(a.id, "no_booking", "online_booking", "high");
    opp(a.id, "no_whatsapp", "whatsapp_automation", "low");
    opp(a.id, "no_whatsapp", "whatsapp_automation", "low"); // misma empresa: cuenta una vez
    db.insert(tables.activityLog).values({ type: "company.analyzed", message: "Analizada", companyId: a.id }).run();

    const d = getDashboard();
    expect(d).toMatchObject({ found: 4, analyzed: 3, analyzing: 1, priorityCount: 1 });
    expect(d.followUps).toEqual({ overdue: 1, upcoming: 1 });
    expect(d.scoreBuckets[9]).toBe(1); // el 100 se agrupa en el último tramo
    expect(d.scoreBuckets[7]).toBe(1);
    expect(d.scoreBuckets[0]).toBe(1);
    expect(d.scored).toBe(3);
    expect(d.topProspects.map((p) => p.name)).toEqual(["A"]); // B ganada, C contactada, D sin puntuar
    expect(d.problems).toEqual([
      { type: "no_booking", companies: 1 },
      { type: "no_whatsapp", companies: 1 },
    ]);
    expect(d.services.find((s) => s.serviceKey === "online_booking")).toMatchObject({ companies: 1, highImpact: 1 });
    expect(d.pipeline.find((p) => p.status === "won")?.count).toBe(1);
    expect(d.activity[0]).toMatchObject({ companyName: "A", message: "Analizada" });
  });
});
