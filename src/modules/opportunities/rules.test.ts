import { describe, expect, it } from "vitest";
import { basicSignals, makeCompany, makeReview } from "../analysis/__fixtures__/builders";
import { buildFacts } from "../analysis/facts";
import { interpretWithRules } from "../analysis/rule-interpreter";
import type { WebsiteSignals } from "../analysis/types";
import { detectWithRules } from "./rules";
import type { OpportunityContext } from "./types";

function ctx(over: Partial<OpportunityContext> = {}): OpportunityContext {
  const company = over.company ?? makeCompany();
  const reviews = over.reviews ?? [];
  const signals = "signals" in over ? over.signals : basicSignals();
  const facts = buildFacts({ company, signals, reviews });
  void facts;
  return {
    company,
    signals,
    reviews,
    interpretation: interpretWithRules({ company, signals, reviews }, buildFacts({ company, signals, reviews })),
  };
}

const types = (c: OpportunityContext) => detectWithRules(c).map((o) => o.type);

describe("detectWithRules", () => {
  it("detecta WhatsApp, reservas y chat ausentes en una web legible, con evidencia de ausencia", () => {
    const opps = detectWithRules(ctx());
    const byType = Object.fromEntries(opps.map((o) => [o.type, o]));
    expect(byType.no_whatsapp).toBeDefined();
    expect(byType.no_booking).toBeDefined();
    expect(byType.no_chat).toBeDefined();
    for (const o of [byType.no_whatsapp!, byType.no_booking!, byType.no_chat!]) {
      expect(o.evidence.some((e) => e.kind === "absence")).toBe(true);
      expect(o.confidence).toBeGreaterThan(0.4);
    }
    // un consultorio vive de citas: la falta de reservas pesa más que el chat
    expect(byType.no_booking!.impact).toBe("high");
  });

  it("toda oportunidad tiene problema, evidencia, consecuencia, solución, impacto y confianza", () => {
    for (const o of detectWithRules(ctx({ reviews: [makeReview({ id: 1, rating: 1, text: "Nunca contestan el teléfono ni los mensajes", ownerReplied: false })] }))) {
      expect(o.problem.length).toBeGreaterThan(10);
      expect(o.consequence.length).toBeGreaterThan(10);
      expect(o.proposedSolution.length).toBeGreaterThan(10);
      expect(o.evidence.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(o.impact);
      expect(o.confidence).toBeGreaterThan(0);
      expect(o.confidence).toBeLessThanOrEqual(0.95);
      expect(o.severity).toBeGreaterThanOrEqual(1);
      expect(o.severity).toBeLessThanOrEqual(5);
    }
  });

  it("no inventa ausencias cuando la web tiene esas funciones", () => {
    const full = basicSignals({
      contact: { phones: ["+54 387 422 1234"], emails: [], whatsappLinks: ["https://wa.me/5493874221234"], hasClickToCall: true, hasContactPage: true },
      booking: { detected: true, vendor: "Calendly", urls: [] },
      chat: { detected: true, vendor: "Tidio" },
      forms: { count: 1, items: [{ fields: ["nombre", "email", "servicio", "mensaje"], fieldCount: 4, hasChoiceField: true }] },
      ctas: [{ text: "Reservar turno", kind: "booking" }, { text: "WhatsApp", kind: "whatsapp" }],
      tech: { analytics: ["Google Analytics"], pixels: ["Meta Pixel"], crm: ["HubSpot"] },
    });
    const t = types(ctx({ signals: full, company: makeCompany({ rating: 4.8, reviewCount: 300 }) }));
    expect(t).not.toContain("no_whatsapp");
    expect(t).not.toContain("no_booking");
    expect(t).not.toContain("no_chat");
    expect(t).not.toContain("weak_forms");
    expect(t).not.toContain("no_crm");
    expect(t).toEqual([]);
  });

  it("si la web no se pudo leer NO afirma ausencias (WhatsApp, reservas, chat…)", () => {
    const unreachable: WebsiteSignals = {
      url: "https://clinicasonrisa.example",
      fetchedAt: new Date(),
      reachable: false,
      fetchError: "La web no respondió a tiempo",
      fetchErrorKind: "timeout",
    };
    const opps = detectWithRules(ctx({ signals: unreachable }));
    expect(opps.map((o) => o.type)).not.toEqual(expect.arrayContaining(["no_whatsapp"]));
    expect(opps.some((o) => o.evidence.some((e) => e.kind === "absence"))).toBe(false);
    // un timeout no es concluyente: tampoco se declara "web caída"
    expect(opps.some((o) => o.title.includes("no responde"))).toBe(false);
  });

  it("una web con error HTTP 404 sí se señala, con confianza moderada y aviso de verificación", () => {
    const down: WebsiteSignals = { url: "https://x.example", fetchedAt: new Date(), reachable: false, httpStatus: 404, fetchError: "La web respondió con HTTP 404", fetchErrorKind: "http" };
    const opp = detectWithRules(ctx({ signals: down })).find((o) => o.title.includes("no responde"));
    expect(opp).toBeDefined();
    expect(opp!.confidence).toBeLessThanOrEqual(0.5);
    expect(opp!.impactNote).toMatch(/comprobación/);
  });

  it("una web renderizada en cliente reduce la confianza de las ausencias", () => {
    const normal = detectWithRules(ctx()).find((o) => o.type === "no_whatsapp")!;
    const spa = detectWithRules(ctx({ signals: basicSignals({ likelyClientRendered: true }) })).find((o) => o.type === "no_whatsapp")!;
    expect(spa.confidence).toBeLessThan(normal.confidence * 0.7);
  });

  it("sin sitio web, propone web y no afirma nada sobre WhatsApp/reservas", () => {
    const opps = detectWithRules(ctx({ company: makeCompany({ website: null, websiteDomain: null }), signals: undefined }));
    expect(opps.map((o) => o.type)).toEqual(expect.arrayContaining(["poor_website"]));
    expect(opps.map((o) => o.type)).not.toContain("no_whatsapp");
    expect(opps.find((o) => o.type === "poor_website")!.confidence).toBeLessThanOrEqual(0.6);
  });

  it("detecta problemas técnicos medidos: sin viewport, http y PageSpeed bajo", () => {
    const bad = basicSignals({ https: false, mobile: { viewportMeta: false, responsiveHints: [] }, performance: { source: "pagespeed", mobileScore: 31, lcpMs: 7200 } });
    const o = detectWithRules(ctx({ signals: bad })).find((x) => x.title.includes("técnicos"))!;
    expect(o.severity).toBe(4);
    expect(o.confidence).toBeGreaterThanOrEqual(0.9);
    expect(o.problem).toMatch(/móvil/);
    expect(o.evidence.map((e) => e.key)).toEqual(expect.arrayContaining(["website.no_viewport", "website.pagespeed", "website.no_https"]));
  });

  it("usa reseñas reales como evidencia de falta de respuesta (con cita literal)", () => {
    const reviews = [
      makeReview({ id: 10, rating: 1, text: "Llamé tres veces y nunca me contestaron. Pésima atención.", ownerReplied: false }),
      makeReview({ id: 11, rating: 2, text: "Nadie responde los mensajes, tardan días en contestar", ownerReplied: false }),
      makeReview({ id: 12, rating: 5, text: "Muy buena doctora", ownerReplied: true }),
    ];
    const opps = detectWithRules(ctx({ reviews }));
    const resp = opps.find((o) => o.type === "no_instant_response")!;
    expect(resp).toBeDefined();
    expect(resp.confidence).toBeGreaterThanOrEqual(0.7);
    expect(resp.evidence.filter((e) => e.kind === "review" && e.excerpt)).toHaveLength(2);
    expect(resp.evidence.find((e) => e.excerpt)?.excerpt).toMatch(/nunca me contestaron/);
    // la hipótesis genérica de "solo formulario" no se duplica cuando hay prueba directa
    expect(opps.filter((o) => o.type === "no_instant_response")).toHaveLength(1);
  });

  it("no hay oportunidad de reseñas sin responder si la fuente no informa de respuestas (null)", () => {
    const reviews = [makeReview({ id: 1, rating: 2 }), makeReview({ id: 2, rating: 3 }), makeReview({ id: 3, rating: 1 })];
    expect(types(ctx({ reviews }))).not.toContain("unanswered_reviews");
  });

  it("detecta reseñas sin responder cuando la fuente sí informa", () => {
    const reviews = [1, 2, 3, 4].map((id) => makeReview({ id, rating: id === 1 ? 2 : 4, ownerReplied: id !== 4 ? false : true }));
    const o = detectWithRules(ctx({ reviews })).find((x) => x.type === "unanswered_reviews")!;
    expect(o).toBeDefined();
    expect(o.problem).toMatch(/3 de 4/);
  });

  it("valoración baja y pocas reseñas se tratan por separado", () => {
    expect(types(ctx({ company: makeCompany({ rating: 3.6, reviewCount: 80 }) }))).toContain("low_reputation");
    expect(types(ctx({ company: makeCompany({ rating: 4.9, reviewCount: 6 }) }))).toContain("few_reviews");
    expect(types(ctx({ company: makeCompany({ rating: 4.9, reviewCount: 6 }) }))).not.toContain("low_reputation");
  });

  it("formulario largo y sin cualificación se detectan como oportunidades distintas", () => {
    const long = basicSignals({ forms: { count: 1, items: [{ fields: Array(9).fill("c"), fieldCount: 9, hasChoiceField: false, hasRequiredPhone: true }] } });
    const t = types(ctx({ signals: long }));
    expect(t).toContain("weak_forms");
    expect(t).toContain("poor_lead_qualification");
  });

  it("el orden prioriza severidad × confianza", () => {
    const opps = detectWithRules(ctx());
    const ranks = opps.map((o) => o.severity * o.confidence);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });
});
