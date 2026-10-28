import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicSignals, makeCompany } from "../analysis/__fixtures__/builders";
import { buildFacts } from "../analysis/facts";
import { interpretWithRules } from "../analysis/rule-interpreter";
import { applyRefinement } from "./engine";
import { detectWithRules } from "./rules";
import type { OpportunityContext } from "./types";

const completeJson = vi.fn();
vi.mock("@/lib/llm", () => ({
  completeJson: (...a: unknown[]) => completeJson(...a),
  completeText: vi.fn(),
  LLM_KEYS_HINT: "ANTHROPIC_API_KEY o GEMINI_API_KEY",
  getLlmInfo: () => (process.env.ANTHROPIC_API_KEY ? { provider: "anthropic", model: "claude-sonnet-5-5" } : undefined),
  isLlmConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
}));

const company = makeCompany();
const signals = basicSignals();
const facts = buildFacts({ company, signals, reviews: [] });
const ctx: OpportunityContext = { company, signals, reviews: [], interpretation: interpretWithRules({ company, signals, reviews: [] }, facts) };

describe("applyRefinement", () => {
  const base = detectWithRules(ctx, facts);

  it("reescribe el texto pero nunca cambia severidad, confianza ni evidencia de lo detectado por reglas", () => {
    const out = applyRefinement(base, { refined: [{ ref: "o1", problem: "Texto nuevo del problema, específico.", consequence: "Nueva consecuencia concreta del problema.", proposedSolution: "Nueva solución personalizada al caso." }], additional: [] }, facts);
    expect(out[0]!.problem).toBe("Texto nuevo del problema, específico.");
    expect(out[0]!.severity).toBe(base[0]!.severity);
    expect(out[0]!.confidence).toBe(base[0]!.confidence);
    expect(out[0]!.evidence).toEqual(base[0]!.evidence);
    expect(base[0]!.problem).not.toBe("Texto nuevo del problema, específico."); // no muta el original
  });

  it("añade oportunidades del modelo solo con evidencia válida, confianza limitada y servicio conocido", () => {
    const out = applyRefinement(
      base,
      {
        refined: [],
        additional: [
          { type: "no_followup", title: "Seguimiento de consultas", problem: "Formulario sin secuencia de seguimiento visible.", consequence: "Consultas que se enfrían sin recordatorio.", proposedSolution: "Secuencia automática de seguimiento.", serviceKey: "lead_followup", impact: "high", severity: 5, confidence: 0.99, evidenceKeys: ["website.form"] },
          { type: "invent", title: "Sin base real", problem: "Problema sin ninguna evidencia real.", consequence: "Consecuencia cualquiera de ejemplo.", proposedSolution: "Solución cualquiera de ejemplo.", serviceKey: "lead_followup", impact: "high", severity: 3, confidence: 0.5, evidenceKeys: ["no.existe"] },
          { type: "otro", title: "Servicio inexistente", problem: "Problema con servicio inventado.", consequence: "Consecuencia cualquiera de ejemplo.", proposedSolution: "Solución cualquiera de ejemplo.", serviceKey: "servicio_inventado", impact: "low", severity: 2, confidence: 0.5, evidenceKeys: ["website.form"] },
        ],
      },
      facts,
    );
    const added = out.slice(base.length);
    expect(added).toHaveLength(1);
    expect(added[0]!.type).toBe("no_followup");
    expect(added[0]!.confidence).toBeLessThanOrEqual(0.6);
    expect(added[0]!.severity).toBeLessThanOrEqual(4);
    expect(added[0]!.evidence.map((e) => e.key)).toEqual(["website.form"]);
  });

  it("rechaza oportunidades del modelo basadas solo en ausencias si la web es poco fiable", () => {
    const spaFacts = buildFacts({ company, signals: basicSignals({ likelyClientRendered: true }), reviews: [] });
    const out = applyRefinement([], { refined: [], additional: [{ type: "x_y", title: "Sin chat según el modelo", problem: "Problema basado solo en ausencia.", consequence: "Consecuencia cualquiera.", proposedSolution: "Solución cualquiera.", serviceKey: "ai_chat_assistant", impact: "low", severity: 2, confidence: 0.5, evidenceKeys: ["website.no_chat"] }] }, spaFacts);
    expect(out).toHaveLength(0);
  });
});

describe("detectOpportunities (selección IA / reglas)", () => {
  beforeEach(() => {
    completeJson.mockReset();
    vi.resetModules();
  });

  it("sin clave usa solo reglas y lo indica", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    const { detectOpportunities } = await import("./engine");
    const r = await detectOpportunities(ctx);
    expect(r.model).toBe("reglas-v1");
    expect(r.fallbackReason).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.drafts.length).toBeGreaterThan(0);
  });

  it("si el modelo falla conserva las oportunidades por reglas", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const { resetEnvCache } = await import("@/lib/config/env");
    resetEnvCache();
    completeJson.mockRejectedValue(new Error("timeout"));
    const { detectOpportunities } = await import("./engine");
    const r = await detectOpportunities(ctx);
    expect(r.drafts.length).toBe(detectWithRules(ctx, facts).length);
    expect(r.fallbackReason).toMatch(/timeout/);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
