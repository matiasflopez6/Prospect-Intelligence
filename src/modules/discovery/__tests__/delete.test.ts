import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/config/env";
import { tables, type Db } from "@/lib/db";
import { openDatabase } from "@/lib/db/client";
import { seedAnalyzedCompany } from "@/test/seed";
import { getDashboard } from "../../dashboard/service";
import { deleteSearch, planSearchDeletion } from "../delete";
import { runDiscovery } from "../service";
import type { DiscoveryProvider } from "../types";

let db: Db;
let reportsDir: string;

beforeEach(() => {
  const handle = openDatabase(":memory:");
  db = handle.db;
  (globalThis as unknown as { __prospectDb?: unknown }).__prospectDb = handle;
  reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "del-reports-"));
  process.env.REPORTS_DIR = reportsDir;
  resetEnvCache();
});

const newSearch = (niche = "clínicas dentales") =>
  db.insert(tables.searches).values({ niche, location: "Ciudad Prueba", targetCount: 10, status: "completed" }).returning({ id: tables.searches.id }).get().id;

function company(name: string, searchIds: number[], crm: Partial<typeof tables.crmEntries.$inferInsert> = {}) {
  const row = db.insert(tables.companies).values({ name, normalizedName: name.toLowerCase() }).returning().get();
  db.insert(tables.crmEntries).values({ companyId: row.id, status: "new", ...crm }).run();
  for (const searchId of searchIds) db.insert(tables.searchCompanies).values({ searchId, companyId: row.id }).run();
  return row.id;
}

const exists = (id: number) => Boolean(db.select().from(tables.companies).where(eq(tables.companies.id, id)).get());

describe("deleteSearch", () => {
  it("devuelve undefined si la búsqueda no existe", async () => {
    expect(planSearchDeletion(999, db)).toBeUndefined();
    expect(await deleteSearch(999, db)).toBeUndefined();
  });

  it("elimina empresas solo de esta búsqueda sin trabajo comercial y conserva el resto", async () => {
    const s1 = newSearch();
    const s2 = newSearch("estudios contables");
    const fresh = company("Solo aquí", [s1]);
    const analyzed = company("Analizada", [s1], { status: "analyzed" });
    const shared = company("En dos búsquedas", [s1, s2]);
    const advanced = company("Contactada", [s1], { status: "contacted" });
    const withNote = company("Con nota", [s1]);
    db.insert(tables.crmNotes).values({ companyId: withNote, body: "Llamar el lunes" }).run();
    const withOwner = company("Con responsable", [s1]);
    const member = db.insert(tables.members).values({ name: "Ana" }).returning().get();
    db.update(tables.crmEntries).set({ ownerId: member.id }).where(eq(tables.crmEntries.companyId, withOwner)).run();
    const withFollowUp = company("Con seguimiento", [s1], { followUpAt: new Date() });
    const sentMessage = company("Mensaje enviado", [s1]);
    db.insert(tables.messages).values({ companyId: sentMessage, channel: "email", body: "Hola", status: "sent" }).run();
    const draftMessage = company("Solo borrador", [s1]);
    db.insert(tables.messages).values({ companyId: draftMessage, channel: "email", body: "Hola", status: "draft" }).run();

    const plan = planSearchDeletion(s1, db)!;
    expect(plan).toMatchObject({ total: 9, keepShared: 1, keepWorked: 5 });
    expect(plan.removeIds.sort()).toEqual([fresh, analyzed, draftMessage].sort());

    const result = await deleteSearch(s1, db);
    expect(result).toMatchObject({ removedCompanies: 3, keptCompanies: 6, wasActive: false });

    expect([fresh, analyzed, draftMessage].some(exists)).toBe(false);
    for (const id of [shared, advanced, withNote, withOwner, withFollowUp, sentMessage]) expect(exists(id)).toBe(true);
    expect(db.select().from(tables.searches).where(eq(tables.searches.id, s1)).get()).toBeUndefined();
    expect(db.select().from(tables.searches).where(eq(tables.searches.id, s2)).get()).toBeDefined();
    // La empresa compartida sigue enlazada a la otra búsqueda; el CRM de lo conservado queda intacto.
    expect(db.select().from(tables.searchCompanies).where(eq(tables.searchCompanies.companyId, shared)).all().map((r) => r.searchId)).toEqual([s2]);
    expect(db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, advanced)).get()?.status).toBe("contacted");
    expect(db.select().from(tables.messages).where(eq(tables.messages.companyId, draftMessage)).all()).toHaveLength(0);
    expect(db.select().from(tables.crmEntries).all()).toHaveLength(6);
  });

  it("borra con la empresa su análisis, oportunidades, puntuaciones, informes y PDF", async () => {
    const s = newSearch();
    const { company: c } = seedAnalyzedCompany(db);
    db.insert(tables.searchCompanies).values({ searchId: s, companyId: c.id }).run();
    db.insert(tables.crmEntries).values({ companyId: c.id, status: "analyzed" }).run();
    const pdfRel = path.join(String(c.id), "informe.pdf");
    fs.mkdirSync(path.join(reportsDir, String(c.id)), { recursive: true });
    fs.writeFileSync(path.join(reportsDir, pdfRel), "%PDF");
    db.insert(tables.reports).values({ companyId: c.id, title: "Informe", status: "ready", pdfPath: pdfRel }).run();
    const other = company("Otra", [newSearch("otro")]);
    fs.mkdirSync(path.join(reportsDir, String(other)), { recursive: true });
    fs.writeFileSync(path.join(reportsDir, String(other), "x.pdf"), "%PDF");

    await deleteSearch(s, db);

    expect(exists(c.id)).toBe(false);
    for (const t of [tables.analyses, tables.evidence, tables.opportunities, tables.scores, tables.reports] as const) {
      expect(db.select().from(t).all()).toHaveLength(0);
    }
    expect(fs.existsSync(path.join(reportsDir, String(c.id)))).toBe(false);
    expect(fs.existsSync(path.join(reportsDir, String(other), "x.pdf"))).toBe(true); // no toca los de otras empresas
  });

  it("cancela los trabajos de la búsqueda y conserva el análisis pendiente de las empresas que se quedan", async () => {
    const s = newSearch();
    const kept = company("Se queda", [s], { status: "contacted" });
    const gone = company("Se va", [s]);
    db.update(tables.searches).set({ status: "running" }).where(eq(tables.searches.id, s)).run();
    db.insert(tables.jobs).values({ type: "discovery.run", payload: { searchId: s }, searchId: s, status: "running" }).run();
    db.insert(tables.jobs).values({ type: "company.analyze", payload: { companyId: kept }, searchId: s, companyId: kept }).run();
    db.insert(tables.jobs).values({ type: "company.analyze", payload: { companyId: gone }, searchId: s, companyId: gone }).run();

    const result = await deleteSearch(s, db);
    expect(result?.wasActive).toBe(true);
    const jobs = db.select().from(tables.jobs).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: "company.analyze", companyId: kept, searchId: null, status: "queued" });
  });

  it("conserva la línea de tiempo de las empresas conservadas y deja constancia del borrado", async () => {
    const s = newSearch();
    const kept = company("Se queda", [s], { status: "proposal" });
    const gone = company("Se va", [s]);
    db.insert(tables.activityLog).values({ type: "search.created", message: "Nueva búsqueda", searchId: s }).run();
    db.insert(tables.activityLog).values({ type: "company.analyzed", message: "Analizada", companyId: kept, searchId: s }).run();
    db.insert(tables.activityLog).values({ type: "company.analyzed", message: "Analizada", companyId: gone, searchId: s }).run();

    await deleteSearch(s, db);

    const log = db.select().from(tables.activityLog).all();
    expect(log.map((l) => l.type).sort()).toEqual(["company.analyzed", "search.deleted"]);
    expect(log.find((l) => l.type === "company.analyzed")).toMatchObject({ companyId: kept, searchId: null });
    expect(log.find((l) => l.type === "search.deleted")!.message).toContain("1 empresas eliminadas, 1 conservadas");
  });

  it("deja el dashboard coherente con lo que queda", async () => {
    const s = newSearch();
    company("Nueva", [s]);
    company("Contactada", [s], { status: "contacted" });
    expect(getDashboard()).toMatchObject({ found: 2, searches: 1 });
    await deleteSearch(s, db);
    const d = getDashboard();
    expect(d).toMatchObject({ found: 1, searches: 0 });
    expect(d.pipeline.find((p) => p.count > 0)).toMatchObject({ count: 1 });
  });
});

describe("runDiscovery con la búsqueda borrada mientras corre", () => {
  it("se detiene sin guardar empresas ni fallar", async () => {
    const s = db.insert(tables.searches).values({ niche: "clínicas", location: "X", targetCount: 5 }).returning({ id: tables.searches.id }).get().id;
    const provider: DiscoveryProvider = {
      id: "fake",
      label: "fake",
      description: "fake",
      requiredEnv: [],
      availability: () => ({ configured: true, missingEnv: [] }),
      search: async () => {
        await deleteSearch(s, db); // el usuario borra la búsqueda mientras la fuente responde
        return [{ provider: "fake", externalId: "1", name: "Negocio fantasma", fetchedAt: new Date() }];
      },
    };
    const enqueue = vi.fn(() => 1);
    const out = await runDiscovery(s, { setProgress: vi.fn() }, { db, log: () => undefined, enqueue, providers: [provider], enrichWebsite: async () => ({ pagesVisited: [], emails: [], socialLinks: [], phones: [] }) });
    expect(out).toMatchObject({ status: "cancelled" });
    expect(db.select().from(tables.companies).all()).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
