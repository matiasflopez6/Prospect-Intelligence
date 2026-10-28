import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tables, type Db } from "@/lib/db";
import { openDatabase } from "@/lib/db/client";
import { seedAnalyzedCompany } from "@/test/seed";
import { setSenderProfile } from "../../profile/sender";
import { generateMessages, listMessages, OutreachPrerequisiteError, updateMessage } from "../service";

let db: Db;
beforeEach(() => {
  const handle = openDatabase(":memory:");
  db = handle.db;
  (globalThis as unknown as { __prospectDb?: unknown }).__prospectDb = handle;
});

const reply = (ids: number[]) => ({
  messages: [
    { channel: "email", subject: "Una duda sobre los turnos", body: "Hola, vi que su clínica tiene muy buena valoración. ¿Cómo gestionan los turnos fuera de horario?", evidenceIds: ids },
    { channel: "linkedin", body: "Hola, me llamó la atención su valoración. ¿Cómo gestionan los turnos fuera de horario?", evidenceIds: ids },
    { channel: "whatsapp", body: "Hola, vi su valoración. ¿Cómo gestionan los turnos fuera de horario?", evidenceIds: ids },
  ],
});

/** Simula completeJson: aplica el esquema real a la respuesta del "modelo". */
const fakeComplete = (response: unknown) =>
  vi.fn(async (input: { schema: { parse: (v: unknown) => unknown } }) => input.schema.parse(response)) as unknown as typeof import("@/lib/llm").completeJson;

describe("generateMessages", () => {
  it("persiste un mensaje por canal con evidencias y oportunidad, y registra actividad", async () => {
    const { company, evidence, opportunities } = seedAnalyzedCompany(db);
    const log = vi.fn();
    const ids = await generateMessages(
      { companyId: company.id, channels: ["email", "linkedin", "whatsapp"] },
      { db, complete: fakeComplete(reply([evidence[0]!.id])), log },
    );
    expect(ids).toHaveLength(3);
    const rows = listMessages(company.id, db);
    expect(rows.map((r) => r.channel).sort()).toEqual(["email", "linkedin", "whatsapp"]);
    expect(rows.every((r) => r.evidenceIds?.includes(evidence[0]!.id) && r.opportunityId === opportunities[0]!.id && r.status === "draft")).toBe(true);
    expect(rows.find((r) => r.channel === "email")?.subject).toBe("Una duda sobre los turnos");
    expect(rows.find((r) => r.channel === "whatsapp")?.subject).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ type: "message.generated", companyId: company.id }));
  });

  it("incluye en el prompt solo evidencias reales de la empresa y la firma del remitente", async () => {
    const { company, evidence } = seedAnalyzedCompany(db);
    setSenderProfile({ name: "Ana Pérez", agency: "Estudio Fixture" }, db);
    const complete = fakeComplete(reply([evidence[1]!.id]));
    await generateMessages({ companyId: company.id, channels: ["email", "linkedin", "whatsapp"] }, { db, complete, log: vi.fn() });
    const prompt = (complete as unknown as { mock: { calls: { prompt: string }[][] } }).mock.calls[0]![0]!.prompt;
    expect(prompt).toContain("Sin sistema de reservas");
    expect(prompt).toContain("Ana Pérez, de Estudio Fixture");
  });

  it("rechaza respuestas que citan evidencias inexistentes (el esquema falla, nada se guarda)", async () => {
    const { company } = seedAnalyzedCompany(db);
    await expect(
      generateMessages({ companyId: company.id, channels: ["email", "linkedin", "whatsapp"] }, { db, complete: fakeComplete(reply([9999])), log: vi.fn() }),
    ).rejects.toThrow();
    expect(listMessages(company.id, db)).toHaveLength(0);
  });

  it("falla con mensaje claro si no hay análisis (sin oportunidades)", async () => {
    const company = db.insert(tables.companies).values({ name: "Sin analizar", normalizedName: "sin analizar" }).returning().get();
    await expect(generateMessages({ companyId: company.id, channels: ["email"] }, { db, complete: fakeComplete({}), log: vi.fn() })).rejects.toBeInstanceOf(OutreachPrerequisiteError);
  });

  it("sin ANTHROPIC_API_KEY lanza MissingCredentialError (bloqueo), sin plantilla de relleno", async () => {
    const { company } = seedAnalyzedCompany(db);
    const prev = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    await expect(generateMessages({ companyId: company.id, channels: ["email"] }, { db })).rejects.toMatchObject({ name: "MissingCredentialError", missingEnv: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"] });
    if (prev.a) process.env.ANTHROPIC_API_KEY = prev.a;
    if (prev.g) process.env.GEMINI_API_KEY = prev.g;
    resetEnvCache();
    expect(listMessages(company.id, db)).toHaveLength(0);
  });

  it("regenerar crea una versión nueva y conserva la anterior", async () => {
    const { company, evidence } = seedAnalyzedCompany(db);
    await generateMessages({ companyId: company.id, channels: ["whatsapp"] }, { db, complete: fakeComplete({ messages: [reply([evidence[0]!.id]).messages[2]] }), log: vi.fn() });
    await generateMessages({ companyId: company.id, channels: ["whatsapp"] }, { db, complete: fakeComplete({ messages: [reply([evidence[0]!.id]).messages[2]] }), log: vi.fn() });
    expect(listMessages(company.id, db)).toHaveLength(2);
  });
});

describe("updateMessage", () => {
  it("persiste ediciones de texto y estado, y registra el cambio de estado", async () => {
    const { company, evidence } = seedAnalyzedCompany(db);
    const [id] = await generateMessages({ companyId: company.id, channels: ["whatsapp"] }, { db, complete: fakeComplete({ messages: [reply([evidence[0]!.id]).messages[2]] }), log: vi.fn() });
    const log = vi.fn();
    updateMessage(id!, { body: "Texto editado a mano", status: "approved" }, { db, log });
    const row = db.select().from(tables.messages).where(eq(tables.messages.id, id!)).get();
    expect(row).toMatchObject({ body: "Texto editado a mano", status: "approved" });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ type: "message.status_changed" }));
    expect(() => updateMessage(id!, { body: "  " }, { db, log })).toThrow(/vacío/);
  });

  it("al marcar un mensaje como enviado, el CRM pasa a «Contactada» sin retroceder estados avanzados", async () => {
    const { company, evidence } = seedAnalyzedCompany(db);
    const [id, id2] = await generateMessages({ companyId: company.id, channels: ["whatsapp", "email"] }, { db, complete: fakeComplete({ messages: [reply([evidence[0]!.id]).messages[2], reply([evidence[0]!.id]).messages[0]] }), log: vi.fn() });
    const crm = () => db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, company.id)).get();
    db.insert(tables.crmEntries).values({ companyId: company.id, status: "analyzed" }).onConflictDoNothing().run();
    updateMessage(id!, { status: "sent" }, { db, log: vi.fn() });
    expect(crm()).toMatchObject({ status: "contacted" });
    expect(crm()?.lastContactedAt).toBeInstanceOf(Date);
    db.update(tables.crmEntries).set({ status: "meeting" }).where(eq(tables.crmEntries.companyId, company.id)).run();
    updateMessage(id2!, { status: "sent" }, { db, log: vi.fn() });
    expect(crm()?.status).toBe("meeting");
  });
});
