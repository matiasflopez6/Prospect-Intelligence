import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basicSignals } from "./__fixtures__/builders";
import type { WebsiteAnalyzer, WebsiteSignals } from "./types";

const ctx = { setProgress() {} };

let tables: typeof import("@/lib/db").tables;
let db: ReturnType<typeof import("@/lib/db").getDb>;
let analyzeCompany: typeof import("./pipeline").analyzeCompany;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  delete process.env.ANTHROPIC_API_KEY;
  const mod = await import("@/lib/db");
  tables = mod.tables;
  db = mod.getDb();
  ({ analyzeCompany } = await import("./pipeline"));
});
afterAll(async () => {
  (await import("../jobs/runner")).stopJobRunner();
});

function analyzerReturning(signals: WebsiteSignals): WebsiteAnalyzer {
  return { analyze: async () => signals };
}

function seedCompany(over: Partial<typeof tables.companies.$inferInsert> = {}) {
  const row = db
    .insert(tables.companies)
    .values({ name: "Clínica Dental Sonrisa", normalizedName: `clinica dental sonrisa ${Math.random()}`, niche: "clínicas dentales", category: "Clínica dental", city: "Salta", location: "Salta, Argentina", phone: "+54 387 422 1234", website: "https://clinicasonrisa.example", rating: 4.6, reviewCount: 120, ...over })
    .returning()
    .get();
  db.insert(tables.crmEntries).values({ companyId: row.id }).run();
  return row;
}

describe("analyzeCompany (pipeline completo, persistencia real)", () => {
  it("analiza, persiste análisis, evidencias, oportunidades, puntuación y avanza el CRM", async () => {
    const company = seedCompany();
    const search = db.insert(tables.searches).values({ niche: "clínicas dentales", location: "Salta", targetCount: 5 }).returning().get();
    db.insert(tables.searchCompanies).values({ searchId: search.id, companyId: company.id }).run();

    const result = await analyzeCompany(company.id, ctx, { analyzer: analyzerReturning(basicSignals()) });

    expect(result.opportunities).toBeGreaterThan(2);
    expect(result.score).toBeGreaterThan(0);

    const analysis = db.select().from(tables.analyses).where(eq(tables.analyses.companyId, company.id)).get()!;
    expect(analysis.status).toBe("done");
    expect(analysis.summary).toMatch(/Clínica Dental Sonrisa/);
    expect((analysis.signals as unknown as WebsiteSignals).reachable).toBe(true);
    expect(analysis.notes?.join(" ")).toMatch(/ANTHROPIC_API_KEY/);
    expect(analysis.model).toBe("reglas-v1");

    const opps = db.select().from(tables.opportunities).where(eq(tables.opportunities.companyId, company.id)).all();
    expect(opps).toHaveLength(result.opportunities);
    for (const o of opps) {
      const links = db.select().from(tables.opportunityEvidence).where(eq(tables.opportunityEvidence.opportunityId, o.id)).all();
      expect(links.length, `evidencia de «${o.title}»`).toBeGreaterThan(0);
    }

    const score = db.select().from(tables.scores).where(eq(tables.scores.companyId, company.id)).get()!;
    expect(score.total).toBe(result.score);
    expect((score.components as unknown[]).length).toBe(8);

    const updated = db.select().from(tables.companies).where(eq(tables.companies.id, company.id)).get()!;
    expect(updated).toMatchObject({ score: result.score, opportunityCount: opps.length, analysisStatus: "done" });
    expect(updated.topServiceKey).toBeTruthy();
    expect(updated.analyzedAt).toBeInstanceOf(Date);

    const crm = db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, company.id)).get()!;
    expect(crm.status).toBe("analyzed");

    const social = db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, company.id)).all();
    expect(social.map((s) => s.platform)).toEqual(["instagram"]);

    const activity = db.select().from(tables.activityLog).where(eq(tables.activityLog.companyId, company.id)).all();
    expect(activity.some((a) => a.type === "company.analyzed")).toBe(true);

    expect(db.select().from(tables.searches).where(eq(tables.searches.id, search.id)).get()!.analyzedCount).toBe(1);
  });

  it("reanalizar conserva el historial, reutiliza evidencias y no duplica oportunidades", async () => {
    const company = seedCompany();
    const analyzer = analyzerReturning(basicSignals());
    const first = await analyzeCompany(company.id, ctx, { analyzer });
    const evidenceBefore = db.select().from(tables.evidence).where(eq(tables.evidence.companyId, company.id)).all();
    const second = await analyzeCompany(company.id, ctx, { analyzer });

    expect(second.analysisId).not.toBe(first.analysisId);
    expect(db.select().from(tables.analyses).where(eq(tables.analyses.companyId, company.id)).all()).toHaveLength(2);
    expect(db.select().from(tables.scores).where(eq(tables.scores.companyId, company.id)).all()).toHaveLength(2);
    expect(db.select().from(tables.opportunities).where(eq(tables.opportunities.companyId, company.id)).all()).toHaveLength(second.opportunities);
    const evidenceAfter = db.select().from(tables.evidence).where(eq(tables.evidence.companyId, company.id)).all();
    expect(evidenceAfter.map((e) => e.id).sort()).toEqual(evidenceBefore.map((e) => e.id).sort());
  });

  it("no retrocede el CRM ni reabre oportunidades descartadas", async () => {
    const company = seedCompany();
    const analyzer = analyzerReturning(basicSignals());
    await analyzeCompany(company.id, ctx, { analyzer });
    db.update(tables.crmEntries).set({ status: "contacted" }).where(eq(tables.crmEntries.companyId, company.id)).run();
    db.update(tables.opportunities).set({ status: "dismissed" }).where(and(eq(tables.opportunities.companyId, company.id), eq(tables.opportunities.type, "no_whatsapp"))).run();

    await analyzeCompany(company.id, ctx, { analyzer });

    expect(db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, company.id)).get()!.status).toBe("contacted");
    const whatsapp = db.select().from(tables.opportunities).where(and(eq(tables.opportunities.companyId, company.id), eq(tables.opportunities.type, "no_whatsapp"))).all();
    expect(whatsapp).toHaveLength(1);
    expect(whatsapp[0]!.status).toBe("dismissed");
  });

  it("una empresa sin web se analiza sin llamar al analizador y sin inventar ausencias de la web", async () => {
    const company = seedCompany({ website: null, websiteDomain: null });
    const analyzer: WebsiteAnalyzer = { analyze: async () => { throw new Error("no debería llamarse"); } };
    const result = await analyzeCompany(company.id, ctx, { analyzer });
    expect(result.websiteReachable).toBe(false);
    const types = db.select().from(tables.opportunities).where(eq(tables.opportunities.companyId, company.id)).all().map((o) => o.type);
    expect(types).toContain("poor_website");
    expect(types).not.toContain("no_whatsapp");
  });

  it("una web inaccesible se analiza igualmente, con aviso y sin afirmar ausencias", async () => {
    const company = seedCompany();
    const down: WebsiteSignals = { url: company.website!, fetchedAt: new Date(), reachable: false, fetchError: "La web no respondió a tiempo", fetchErrorKind: "timeout" };
    const result = await analyzeCompany(company.id, ctx, { analyzer: analyzerReturning(down) });
    expect(result.notes.join(" ")).toMatch(/No se pudo leer la web/);
    const ev = db.select().from(tables.evidence).where(eq(tables.evidence.companyId, company.id)).all();
    expect(ev.some((e) => e.kind === "absence")).toBe(false);
  });

  it("completa email, teléfono y WhatsApp solo cuando faltan, sin pisar datos existentes", async () => {
    const company = seedCompany({ phone: "+54 387 000 0000", email: null, whatsapp: null });
    const signals = basicSignals({ contact: { phones: ["+54 387 422 1234"], emails: ["info@clinicasonrisa.example"], whatsappLinks: ["https://wa.me/5493874221234?text=Hola"], hasClickToCall: true, hasContactPage: true } });
    await analyzeCompany(company.id, ctx, { analyzer: analyzerReturning(signals) });
    const updated = db.select().from(tables.companies).where(eq(tables.companies.id, company.id)).get()!;
    expect(updated.phone).toBe("+54 387 000 0000");
    expect(updated.email).toBe("info@clinicasonrisa.example");
    expect(updated.whatsapp).toBe("+5493874221234");
  });

  it("si el análisis falla marca el error y lo propaga (el runner lo muestra)", async () => {
    const company = seedCompany();
    const analyzer: WebsiteAnalyzer = { analyze: async () => { throw new Error("fallo inesperado"); } };
    await expect(analyzeCompany(company.id, ctx, { analyzer })).rejects.toThrow("fallo inesperado");
    const row = db.select().from(tables.companies).where(eq(tables.companies.id, company.id)).get()!;
    expect(row.analysisStatus).toBe("failed");
    expect(row.analysisError).toBe("fallo inesperado");
    expect(db.select().from(tables.analyses).where(eq(tables.analyses.companyId, company.id)).get()!.status).toBe("failed");
  });

  it("empresa inexistente → error claro", async () => {
    await expect(analyzeCompany(99999, ctx)).rejects.toThrow(/no existe/);
  });
});
