import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tables: typeof import("@/lib/db").tables;
let db: ReturnType<typeof import("@/lib/db").getDb>;
let svc: typeof import("./service");

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  const mod = await import("@/lib/db");
  tables = mod.tables;
  db = mod.getDb();
  svc = await import("./service");

  const mk = (name: string, over: Partial<typeof tables.companies.$inferInsert>, status: "new" | "analyzed" | "priority" | "contacted" = "analyzed", ownerId?: number) => {
    const row = db.insert(tables.companies).values({ name, normalizedName: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), ...over }).returning().get();
    db.insert(tables.crmEntries).values({ companyId: row.id, status, ownerId }).run();
    return row;
  };
  const ana = db.insert(tables.members).values({ name: "Ana" }).returning().get();
  const a = mk("Clínica Dental Sonrisa", { niche: "clínicas dentales", location: "Salta, Argentina", score: 82, scoreTier: "high", opportunityCount: 4, rating: 4.7, reviewCount: 210, analysisStatus: "done" }, "priority", ana.id);
  const b = mk("Odontología Norte", { niche: "clínicas dentales", location: "Salta, Argentina", score: 45, scoreTier: "medium", opportunityCount: 2, rating: 4.1, reviewCount: 30, analysisStatus: "done" });
  mk("Dentista 100%_Raro", { niche: "clínicas dentales", location: "Tucumán, Argentina" }, "new");
  mk("Veterinaria Sur", { niche: "veterinarias", location: "Salta, Argentina", score: 60, scoreTier: "medium", opportunityCount: 1, rating: 3.2, reviewCount: 8, analysisStatus: "done" });
  const opp = (companyId: number, type: string, serviceKey: string, status: "open" | "dismissed" = "open") =>
    db.insert(tables.opportunities).values({ companyId, type, title: type, problem: "p", consequence: "c", proposedSolution: "s", serviceKey, impact: "high", severity: 3, confidence: 0.8, status }).run();
  opp(a.id, "no_whatsapp", "whatsapp_automation");
  opp(a.id, "no_booking", "online_booking");
  opp(b.id, "no_booking", "online_booking", "dismissed");
});
afterAll(async () => {
  (await import("../jobs/runner")).stopJobRunner();
});

const names = (q: Parameters<typeof import("./service").listCompanies>[0]) => svc.listCompanies(q).rows.map((r) => r.name);

describe("listCompanies", () => {
  it("ordena por puntuación con las no analizadas al final", () => {
    expect(names({})).toEqual(["Clínica Dental Sonrisa", "Veterinaria Sur", "Odontología Norte", "Dentista 100%_Raro"]);
    expect(names({ sort: "score", dir: "asc" })[0]).toBe("Odontología Norte");
  });
  it("busca por nombre ignorando tildes y trata % y _ como texto", () => {
    expect(names({ q: "clinica" })).toEqual(["Clínica Dental Sonrisa"]);
    expect(names({ q: "100%_" })).toEqual(["Dentista 100%_Raro"]);
    expect(names({ q: "%" })).toEqual(["Dentista 100%_Raro"]);
  });
  it("filtra por nicho, ubicación, puntuación, oportunidades, valoración y reseñas", () => {
    expect(names({ niche: "veterin" })).toEqual(["Veterinaria Sur"]);
    expect(names({ location: "Tucumán" })).toEqual(["Dentista 100%_Raro"]);
    expect(names({ scoreMin: 50 })).toEqual(["Clínica Dental Sonrisa", "Veterinaria Sur"]);
    expect(names({ opportunitiesMin: 2 })).toEqual(["Clínica Dental Sonrisa", "Odontología Norte"]);
    expect(names({ ratingMin: 4.5 })).toEqual(["Clínica Dental Sonrisa"]);
    expect(names({ reviewsMin: 100 })).toEqual(["Clínica Dental Sonrisa"]);
    expect(names({ tier: "medium" })).toEqual(["Veterinaria Sur", "Odontología Norte"]);
  });
  it("filtra por problema y servicio solo con oportunidades abiertas", () => {
    expect(names({ opportunityType: "no_whatsapp" })).toEqual(["Clínica Dental Sonrisa"]);
    expect(names({ service: "online_booking" })).toEqual(["Clínica Dental Sonrisa"]); // la de Norte está descartada
  });
  it("filtra por estado CRM y responsable", () => {
    expect(names({ crmStatus: "new" })).toEqual(["Dentista 100%_Raro"]);
    expect(names({ crmStatus: "priority" })).toEqual(["Clínica Dental Sonrisa"]);
    const owner = db.select().from(tables.members).get()!;
    expect(svc.listCompanies({ ownerId: owner.id }).rows[0]).toMatchObject({ name: "Clínica Dental Sonrisa", ownerName: "Ana", crmStatus: "priority" });
  });
  it("pagina y ajusta páginas fuera de rango", () => {
    const p = svc.listCompanies({ pageSize: 3, page: 99 });
    expect(p).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(p.rows).toHaveLength(1);
  });
  it("expone valores reales para los selectores", () => {
    const o = svc.getFilterOptions();
    expect(o.niches).toEqual(["clínicas dentales", "veterinarias"]);
    expect(o.opportunityTypes.sort()).toEqual(["no_booking", "no_whatsapp"]);
    expect(o.owners.map((m) => m.name)).toEqual(["Ana"]);
  });
});
