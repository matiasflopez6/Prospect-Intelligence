import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tables: typeof import("@/lib/db").tables;
let db: ReturnType<typeof import("@/lib/db").getDb>;
let crm: typeof import("./service");

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  const mod = await import("@/lib/db");
  tables = mod.tables;
  db = mod.getDb();
  crm = await import("./service");
});
afterAll(async () => {
  (await import("../jobs/runner")).stopJobRunner();
});

function seed(name: string, over: Partial<typeof tables.companies.$inferInsert> = {}, withCrm = true) {
  const row = db.insert(tables.companies).values({ name, normalizedName: name.toLowerCase(), ...over }).returning().get();
  if (withCrm) db.insert(tables.crmEntries).values({ companyId: row.id }).run();
  return row;
}

describe("updateCrm / notas", () => {
  it("cambia de estado, registra actividad y persiste", () => {
    const co = seed("Clínica A");
    const saved = crm.updateCrm(co.id, { status: "contacted", nextAction: "  Llamar  ", followUpAt: new Date(2026, 0, 5, 12) });
    expect(saved.status).toBe("contacted");
    expect(saved.nextAction).toBe("Llamar");
    expect(saved.lastContactedAt).toBeInstanceOf(Date);
    const log = db.select().from(tables.activityLog).where(eq(tables.activityLog.companyId, co.id)).all();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: "crm.status_changed" });
    expect(log[0]!.message).toContain("Nueva → Contactada");
  });

  it("no registra nada si no hay cambios", () => {
    const co = seed("Clínica B");
    crm.updateCrm(co.id, { nextAction: "Escribir" });
    const before = db.select().from(tables.activityLog).where(eq(tables.activityLog.companyId, co.id)).all().length;
    crm.updateCrm(co.id, { nextAction: "Escribir" });
    expect(db.select().from(tables.activityLog).where(eq(tables.activityLog.companyId, co.id)).all()).toHaveLength(before);
  });

  it("guarda el motivo al perder, lo limpia al reabrir y quita el seguimiento al cerrar", () => {
    const co = seed("Clínica C");
    crm.updateCrm(co.id, { status: "proposal", followUpAt: new Date(2026, 0, 5, 12) });
    const lost = crm.updateCrm(co.id, { status: "lost", lostReason: "Sin presupuesto" });
    expect(lost.lostReason).toBe("Sin presupuesto");
    expect(lost.followUpAt).toBeNull();
    const reopened = crm.updateCrm(co.id, { status: "priority" });
    expect(reopened.lostReason).toBeNull();
  });

  it("asigna responsable y rechaza ids inexistentes", () => {
    const co = seed("Clínica D");
    const m = crm.createMember("  Ana ");
    expect(crm.createMember("ana").id).toBe(m.id);
    expect(crm.updateCrm(co.id, { ownerId: m.id }).ownerId).toBe(m.id);
    expect(crm.getCrm(co.id)?.ownerName).toBe("Ana");
    expect(() => crm.updateCrm(co.id, { ownerId: 9999 })).toThrow();
    expect(crm.updateCrm(co.id, { ownerId: null }).ownerId).toBeNull();
  });

  it("crea la entrada CRM si faltaba, según el estado del análisis", () => {
    const a = seed("Sin CRM", {}, false);
    const b = seed("Analizada sin CRM", { analysisStatus: "done" }, false);
    expect(crm.getCrm(a.id)?.status).toBe("new");
    expect(crm.getCrm(b.id)?.status).toBe("analyzed");
    expect(crm.getCrm(123456)).toBeUndefined();
  });

  it("añade y lista notas (más recientes primero) y rechaza vacías", () => {
    const co = seed("Clínica E");
    crm.addNote(co.id, "Primera");
    crm.addNote(co.id, "Segunda");
    expect(crm.listNotes(co.id).map((n) => n.body)).toEqual(["Segunda", "Primera"]);
    expect(() => crm.addNote(co.id, "   ")).toThrow();
  });
});

describe("markContacted", () => {
  it("avanza desde estados previos al contacto y no retrocede ni reabre", () => {
    const a = seed("MC Priority");
    crm.updateCrm(a.id, { status: "priority" });
    expect(crm.markContacted(a.id).status).toBe("contacted");
    const b = seed("MC Meeting");
    crm.updateCrm(b.id, { status: "meeting" });
    const kept = crm.markContacted(b.id);
    expect(kept.status).toBe("meeting");
    expect(kept.lastContactedAt).toBeInstanceOf(Date);
    const c = seed("MC Lost");
    crm.updateCrm(c.id, { status: "lost" });
    expect(crm.markContacted(c.id).status).toBe("lost");
  });
});

describe("pipeline y seguimientos", () => {
  it("agrupa por estado con totales reales y ordena por puntuación", () => {
    const hi = seed("Pipe Alta", { score: 90, scoreTier: "high", niche: "pipe-test" });
    const lo = seed("Pipe Baja", { score: 20, scoreTier: "low", niche: "pipe-test" });
    crm.updateCrm(hi.id, { status: "meeting" });
    crm.updateCrm(lo.id, { status: "meeting" });
    const col = crm.getPipeline({ q: "Pipe" }).find((c) => c.status === "meeting")!;
    expect(col.total).toBe(2);
    expect(col.cards.map((c) => c.name)).toEqual(["Pipe Alta", "Pipe Baja"]);
    expect(crm.getPipeline({ q: "Pipe" }).find((c) => c.status === "won")!.total).toBe(0);
  });

  it("lista seguimientos vencidos y próximos, no los cerrados ni los lejanos", () => {
    const day = (n: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n, 12);
    const overdue = seed("Seg Vencido");
    const soon = seed("Seg Pronto");
    const far = seed("Seg Lejano");
    const closed = seed("Seg Cerrado");
    crm.updateCrm(overdue.id, { status: "contacted", followUpAt: day(-2) });
    crm.updateCrm(soon.id, { status: "contacted", followUpAt: day(3) });
    crm.updateCrm(far.id, { status: "contacted", followUpAt: day(30) });
    crm.updateCrm(closed.id, { status: "won", followUpAt: day(1) });
    const names = crm.listFollowUps({ limit: 100 }).map((f) => f.name).filter((n) => n.startsWith("Seg "));
    expect(names).toEqual(["Seg Vencido", "Seg Pronto"]);
  });
});
