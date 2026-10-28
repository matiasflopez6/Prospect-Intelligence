import { describe, expect, it } from "vitest";
import { makeCompany } from "../analysis/__fixtures__/builders";
import type { OpportunityDraft } from "../opportunities/types";
import { SCORE_WEIGHTS, SCORING_METHOD_VERSION, scoreCompany } from "./engine";

function opp(over: Partial<OpportunityDraft> = {}): OpportunityDraft {
  return {
    type: "no_whatsapp",
    title: "Sin WhatsApp visible",
    problem: "p",
    consequence: "c",
    proposedSolution: "s",
    serviceKey: "whatsapp_automation",
    impact: "medium",
    severity: 3,
    confidence: 0.75,
    evidence: [{ kind: "absence", label: "x", detail: "y", key: "k" }],
    ...over,
  };
}

describe("scoreCompany", () => {
  it("los pesos suman 1", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("es determinista y está acotada a 0–100", () => {
    const input = { company: makeCompany(), opportunities: [opp(), opp({ title: "b", severity: 4 })], websiteReachable: true };
    const a = scoreCompany(input);
    const b = scoreCompany(input);
    expect(a).toEqual(b);
    expect(a.total).toBeGreaterThanOrEqual(0);
    expect(a.total).toBeLessThanOrEqual(100);
    expect(a.methodVersion).toBe(SCORING_METHOD_VERSION);
  });

  it("el desglose es transparente: cada componente tiene explicación y los puntos suman el total", () => {
    const r = scoreCompany({ company: makeCompany(), opportunities: [opp(), opp({ title: "b" })], websiteReachable: true });
    expect(r.components).toHaveLength(8);
    for (const c of r.components) {
      expect(c.explanation.length).toBeGreaterThan(10);
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(1);
      expect(c.points).toBeCloseTo(100 * c.weight * c.value, 0);
    }
    const sum = r.components.reduce((s, c) => s + c.points, 0);
    expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(0.5);
  });

  it("más oportunidades graves y fiables → más puntuación", () => {
    const company = makeCompany();
    const few = scoreCompany({ company, opportunities: [opp({ severity: 2, confidence: 0.4 })], websiteReachable: true });
    const many = scoreCompany({ company, opportunities: [opp({ severity: 4, confidence: 0.85 }), opp({ title: "b", severity: 4, confidence: 0.8 }), opp({ title: "c", severity: 3, confidence: 0.8 })], websiteReachable: true });
    expect(many.total).toBeGreaterThan(few.total);
  });

  it("un negocio más grande y activo puntúa más con las mismas oportunidades", () => {
    const opportunities = [opp(), opp({ title: "b" })];
    const small = scoreCompany({ company: makeCompany({ reviewCount: 4 }), opportunities, websiteReachable: true });
    const big = scoreCompany({ company: makeCompany({ reviewCount: 400 }), opportunities, websiteReachable: true, context: { sampleSize: 5, recentReviews: 5 } });
    expect(big.total).toBeGreaterThan(small.total);
  });

  it("sin oportunidades la prioridad es baja", () => {
    const r = scoreCompany({ company: makeCompany(), opportunities: [], websiteReachable: true, context: { quality: { conversion: 100, cta: 90, mobile: 90, trust: 90 } } });
    expect(r.tier).toBe("low");
    expect(r.components.find((c) => c.key === "severity")!.value).toBe(0);
  });

  it("una web no analizable baja la confianza", () => {
    const opportunities = [opp()];
    const read = scoreCompany({ company: makeCompany(), opportunities, websiteReachable: true });
    const unread = scoreCompany({ company: makeCompany(), opportunities, websiteReachable: false });
    expect(unread.confidence).toBeLessThan(read.confidence);
  });

  it("un negocio cerrado tiene actividad cero", () => {
    const r = scoreCompany({ company: makeCompany({ businessStatus: "CLOSED_PERMANENTLY" }), opportunities: [opp()], websiteReachable: true });
    expect(r.components.find((c) => c.key === "activity")!.value).toBe(0);
  });

  it("sin datos de contacto la facilidad de contacto es mínima", () => {
    const r = scoreCompany({ company: makeCompany({ phone: null, email: null, whatsapp: null, website: null }), opportunities: [opp()], websiteReachable: false });
    expect(r.components.find((c) => c.key === "reachability")!.value).toBe(0);
  });
});
