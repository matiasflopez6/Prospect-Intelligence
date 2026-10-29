import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicSignals, makeCompany, makeReview } from "./__fixtures__/builders";
import { buildFacts } from "./facts";
import { buildInterpreterPrompt, sanitizeInterpretation } from "./llm-interpreter";
import { RULES_MODEL_ID, interpretWithRules } from "./rule-interpreter";
import type { AnalysisInput } from "./types";

const completeJson = vi.fn();
vi.mock("@/lib/llm", () => ({
  completeJson: (...a: unknown[]) => completeJson(...a),
  completeText: vi.fn(),
  LLM_KEYS_HINT: "ANTHROPIC_API_KEY o GEMINI_API_KEY",
  getLlmInfo: () => (process.env.ANTHROPIC_API_KEY ? { provider: "anthropic", model: "claude-sonnet-5-5" } : undefined),
  isLlmConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
}));

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return { company: makeCompany(), signals: basicSignals(), reviews: [], ...over };
}

describe("interpretWithRules", () => {
  it("redacta un resumen y hallazgos explicados, todos con evidencia", () => {
    const i = input();
    const r = interpretWithRules(i, buildFacts(i));
    expect(r.model).toBe(RULES_MODEL_ID);
    expect(r.summary).toMatch(/Clínica Dental Sonrisa/);
    expect(r.summary).toMatch(/4\.6\/5/);
    expect(r.findings.length).toBeGreaterThan(4);
    for (const f of r.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.explanation.length).toBeGreaterThan(40);
    }
    const keys = r.findings.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["whatsapp", "booking", "chat", "reputation"]));
    expect(r.findings.find((f) => f.key === "reputation")?.positive).toBe(true);
  });

  it("incluye fortalezas además de problemas", () => {
    const i = input({ signals: basicSignals({ chat: { detected: true, vendor: "Tidio" } }) });
    const r = interpretWithRules(i, buildFacts(i));
    expect(r.findings.some((f) => f.positive)).toBe(true);
    expect(r.findings.find((f) => f.key === "chat")?.positive).toBe(true);
  });

  it("calcula subpuntuaciones de calidad entre 0 y 100", () => {
    const i = input();
    const q = interpretWithRules(i, buildFacts(i)).quality;
    for (const k of ["clarity", "cta", "conversion", "mobile", "trust", "reputation"]) {
      expect(q[k], k).toBeGreaterThanOrEqual(0);
      expect(q[k], k).toBeLessThanOrEqual(100);
    }
  });

  it("sin web no hay calidad web, solo reputación, y se explica la falta de presencia", () => {
    const i = input({ company: makeCompany({ website: null }), signals: undefined });
    const r = interpretWithRules(i, buildFacts(i));
    expect(Object.keys(r.quality)).toEqual(["reputation"]);
    expect(r.findings[0]?.key).toBe("web_presence");
    expect(r.summary).toMatch(/No se conoce sitio web/);
  });

  it("web inaccesible: no emite hallazgos de ausencia", () => {
    const i = input({ signals: { url: "https://x.example", fetchedAt: new Date(), reachable: false, fetchError: "tiempo agotado", fetchErrorKind: "timeout" } });
    const r = interpretWithRules(i, buildFacts(i));
    expect(r.findings.map((f) => f.key)).toContain("web_access");
    expect(r.findings.some((f) => f.evidence.some((e) => e.kind === "absence"))).toBe(false);
  });

  it("cita literal de reseñas en el hallazgo de quejas", () => {
    const i = input({ reviews: [makeReview({ id: 5, rating: 1, text: "Nunca contestan el teléfono" })] });
    const f = interpretWithRules(i, buildFacts(i)).findings.find((x) => x.key === "customer_complaints")!;
    expect(f.evidence.some((e) => e.excerpt?.includes("Nunca contestan"))).toBe(true);
  });
});

describe("verificación de la salida del LLM", () => {
  const facts = buildFacts(input());

  it("descarta claves de evidencia inventadas y hallazgos sin ninguna evidencia válida", () => {
    const r = sanitizeInterpretation(
      {
        summary: "Resumen suficientemente largo para pasar la validación del esquema de salida.",
        quality: { conversion: 150, mobile: -5 },
        findings: [
          { key: "ok", title: "Sin WhatsApp", explanation: "Explicación razonada sobre WhatsApp y su impacto.", severity: 3, evidenceKeys: ["website.no_whatsapp", "inventada.clave"] },
          { key: "fake", title: "Algo inventado", explanation: "Explicación sin ninguna base real disponible.", severity: 5, evidenceKeys: ["no.existe"] },
        ],
      },
      facts,
      "claude-test",
    )!;
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.evidence.map((e) => e.key)).toEqual(["website.no_whatsapp"]);
    expect(r.quality).toEqual({ conversion: 100, mobile: 0 });
    expect(r.model).toBe("claude-test");
  });

  it("si no queda ningún hallazgo verificable devuelve undefined", () => {
    expect(
      sanitizeInterpretation(
        { summary: "Resumen suficientemente largo para pasar la validación del esquema.", quality: {}, findings: [{ key: "a", title: "Hallazgo", explanation: "Explicación de al menos veinte caracteres.", severity: 2, evidenceKeys: ["x"] }] },
        facts,
        "m",
      ),
    ).toBeUndefined();
  });

  it("el prompt solo contiene hechos de la empresa (no más)", () => {
    const p = JSON.parse(buildInterpreterPrompt(input(), facts));
    expect(p.hechos.map((h: { key: string }) => h.key)).toContain("website.no_whatsapp");
    expect(p.negocio.nombre).toBe("Clínica Dental Sonrisa");
  });
});

describe("createInterpreter (selección IA / reglas)", () => {
  beforeEach(() => {
    completeJson.mockReset();
    vi.resetModules();
  });

  it("sin ANTHROPIC_API_KEY usa reglas y lo declara", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    const { createInterpreter } = await import("./interpreter");
    const r = await createInterpreter().interpret(input());
    expect(r.model).toBe(RULES_MODEL_ID);
    expect(r.fallbackReason).toMatch(/ANTHROPIC_API_KEY/);
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("con clave usa el modelo y verifica las evidencias", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    completeJson.mockResolvedValue({
      summary: "La clínica tiene buena reputación pero deja consultas sin canal inmediato fuera del horario.",
      quality: {},
      findings: [{ key: "whatsapp", title: "Sin WhatsApp", explanation: "Quien quiere escribir desde el móvil no tiene un canal directo y probablemente abandone.", severity: 3, evidenceKeys: ["website.no_whatsapp"] }],
    });
    const { createInterpreter } = await import("./interpreter");
    const r = await createInterpreter().interpret(input());
    expect(r.model).toBe("claude-sonnet-5-5");
    expect(r.fallbackReason).toBeUndefined();
    expect(r.findings).toHaveLength(1);
    expect(r.quality.conversion).toBeDefined(); // completada por reglas
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("si la IA falla vuelve a reglas y explica por qué", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    completeJson.mockRejectedValue(new Error("cuota agotada"));
    const { createInterpreter } = await import("./interpreter");
    const r = await createInterpreter().interpret(input());
    expect(r.model).toBe(RULES_MODEL_ID);
    expect(r.fallbackReason).toMatch(/cuota agotada/);
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe("ausencia de analítica", () => {
  const noTracking = { analytics: [], pixels: [], crm: [] };
  it("se afirma en una web propia sin trackers, pero no en un constructor alojado como Wix (los inyecta con scripts)", () => {
    const own = buildFacts(input({ signals: basicSignals({ tech: { ...noTracking, cms: "WordPress" } }) }));
    expect(own.evidence.has("website.no_tracking")).toBe(true);
    const wix = buildFacts(input({ signals: basicSignals({ tech: { ...noTracking, cms: "Wix" } }) }));
    expect(wix.evidence.has("website.no_tracking")).toBe(false);
  });
});
