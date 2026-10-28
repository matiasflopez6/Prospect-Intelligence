import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tables, type Db } from "@/lib/db";
import { openDatabase } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/config/env";
import { seedAnalyzedCompany } from "@/test/seed";
import { setSenderProfile } from "../../profile/sender";
import { composeReportContent, ReportPrerequisiteError } from "../compose";
import { renderReportHtml } from "../html";
import { renderPdf } from "../pdf";
import { generateReport, getReport, loadReportSource, regeneratePdf } from "../service";

let db: Db;
let dir: string;
beforeEach(() => {
  const handle = openDatabase(":memory:");
  db = handle.db;
  (globalThis as unknown as { __prospectDb?: unknown }).__prospectDb = handle;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "reports-"));
  process.env.REPORTS_DIR = dir;
  resetEnvCache();
});

describe("composeReportContent", () => {
  it("construye el informe solo con datos persistidos, ordenado por prioridad", () => {
    const { company } = seedAnalyzedCompany(db);
    setSenderProfile({ name: "Ana Pérez", agency: "Estudio Fixture" }, db);
    const c = composeReportContent(loadReportSource(company.id, db), new Date("2026-03-01T10:00:00Z"));
    expect(c.company.name).toBe("Clínica Fixture Uno");
    expect(c.preparedBy).toEqual({ name: "Ana Pérez", agency: "Estudio Fixture" });
    expect(c.currentSituation).toContain("no ofrece un modo rápido de reservar");
    expect(c.currentSituation).toContain("120 reseñas");
    expect(c.problems.map((p) => p.title)).toEqual(["Sin reserva online"]); // el hallazgo positivo no es problema
    expect(c.strengths?.map((s) => s.title)).toEqual(["Propuesta clara"]);
    expect(c.opportunities.map((o) => o.title)).toEqual(["Sin sistema de reserva", "Sin WhatsApp visible"]);
    expect(c.opportunities[0]!.evidence?.[0]?.label).toBe("Sin sistema de reservas");
    expect(c.recommendations).toHaveLength(2);
    expect(c.proposedSystems.map((s) => s.service)).toEqual(["Sistema de reservas online", "Automatización de WhatsApp"]);
    expect(c.potentialImpact).toContain("2 oportunidades (1 de impacto alto, 1 de impacto medio)");
    expect(c.potentialImpact).toContain("Más turnos captados fuera de horario");
    expect(c.score).toMatchObject({ total: 72, tier: "Alta prioridad" });
    expect(c.quality).toEqual([{ label: "Claridad de la propuesta", value: 78 }, { label: "Móvil y velocidad", value: 64 }]);
  });

  it("sin oportunidades no inventa: lo dice claramente", () => {
    const { company } = seedAnalyzedCompany(db, { opportunities: 0 });
    const c = composeReportContent(loadReportSource(company.id, db));
    expect(c.opportunities).toEqual([]);
    expect(c.potentialImpact).toMatch(/no se han podido justificar/);
    expect(c.recommendations).toEqual([]);
  });

  it("exige un análisis completado", () => {
    const company = db.insert(tables.companies).values({ name: "X", normalizedName: "x" }).returning().get();
    expect(() => loadReportSource(company.id, db)).toThrow(ReportPrerequisiteError);
  });
});

describe("renderReportHtml", () => {
  it("escapa el contenido y refleja todas las secciones", () => {
    const { company } = seedAnalyzedCompany(db);
    const content = composeReportContent(loadReportSource(company.id, db));
    content.company.name = `Evil <script>alert(1)</script> & Co`;
    content.problems[0]!.description = `<img src=x onerror=alert(1)>`;
    const html = renderReportHtml(content);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Evil &lt;script&gt;");
    for (const h of ["Situación actual", "Problemas encontrados", "Oportunidades detectadas", "Recomendaciones", "Sistemas que podríamos implementar", "Impacto potencial", "Anexo: evidencias"]) {
      expect(html).toContain(h);
    }
  });
});

describe("generateReport", () => {
  it("guarda contenido + PDF y marca 'ready'", async () => {
    const { company } = seedAnalyzedCompany(db);
    const pdf = vi.fn(async () => Buffer.from("%PDF-fake"));
    const id = await generateReport(company.id, { db, pdf, log: vi.fn() });
    const r = getReport(id, db)!;
    expect(r.status).toBe("ready");
    expect((r.content as { company: { name: string } }).company.name).toBe("Clínica Fixture Uno");
    expect(fs.readFileSync(path.join(dir, r.pdfPath!), "utf8")).toBe("%PDF-fake");
  });

  it("si el PDF falla conserva el contenido (failed) y permite reintentar", async () => {
    const { company } = seedAnalyzedCompany(db);
    await expect(generateReport(company.id, { db, pdf: async () => { throw new Error("sin chromium"); }, log: vi.fn() })).rejects.toThrow("sin chromium");
    const failed = db.select().from(tables.reports).get()!;
    expect(failed).toMatchObject({ status: "failed", error: "sin chromium" });
    expect(failed.content).toBeTruthy();
    await regeneratePdf(failed.id, { db, pdf: async () => Buffer.from("%PDF-ok") });
    expect(getReport(failed.id, db)).toMatchObject({ status: "ready", error: null });
  });
});

const chromium = ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome"].some((p) => fs.existsSync(p));
describe.skipIf(!chromium)("renderPdf (Chromium real)", () => {
  it("genera un PDF A4 válido de varias secciones", async () => {
    const { company } = seedAnalyzedCompany(db);
    const html = renderReportHtml(composeReportContent(loadReportSource(company.id, db)));
    const buf = await renderPdf(html, "Pie de prueba");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10_000);
  }, 60_000);
});
