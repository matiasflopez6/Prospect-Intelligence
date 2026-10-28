import { z } from "zod";
import { IMPACT_LEVELS, SERVICE_KEYS, type ImpactLevel, type ServiceKey, type Severity } from "@/domain";
import { completeJson, getLlmInfo, LLM_KEYS_HINT } from "@/lib/llm";
import { errorMessage } from "@/lib/errors";
import { buildFacts, type Facts } from "../analysis/facts";
import { detectWithRules } from "./rules";
import type { OpportunityContext, OpportunityDraft, OpportunityEngine } from "./types";

export const OPPORTUNITIES_RULES_MODEL = "reglas-v1";
const MAX_EXTRA_FROM_LLM = 3;
const LLM_EXTRA_MAX_CONFIDENCE = 0.6;

export interface DetectionResult {
  drafts: OpportunityDraft[];
  /** "reglas-v1" o el modelo que redactó/añadió oportunidades sobre las detectadas por reglas. */
  model: string;
  fallbackReason?: string;
}

const refinedSchema = z.object({
  refined: z
    .array(
      z.object({
        ref: z.string(),
        problem: z.string().min(10).max(500),
        consequence: z.string().min(10).max(600),
        proposedSolution: z.string().min(10).max(600),
        impactNote: z.string().max(400).optional(),
      }),
    )
    .default([]),
  additional: z
    .array(
      z.object({
        type: z.string().min(2).max(40),
        title: z.string().min(5).max(120),
        problem: z.string().min(10).max(500),
        consequence: z.string().min(10).max(600),
        proposedSolution: z.string().min(10).max(600),
        serviceKey: z.string(),
        impact: z.enum(IMPACT_LEVELS),
        severity: z.number().int().min(1).max(5),
        confidence: z.number().min(0).max(1),
        evidenceKeys: z.array(z.string()).min(1).max(8),
      }),
    )
    .default([]),
});

export const OPPORTUNITY_SYSTEM = `Eres consultor comercial senior de una consultora de IA y automatización para negocios locales. Recibes (1) hechos verificados de un negocio, cada uno con una clave, y (2) oportunidades ya detectadas por reglas, con su evidencia.

Tu trabajo:
A) "refined": reescribe problema, consecuencia y solución de cada oportunidad detectada para que suene a este negocio concreto (menciona datos reales de los hechos: su valoración, su nicho, lo que se vio en su web) en vez de texto genérico. Mantén exactamente el mismo diagnóstico: no añadas problemas nuevos ni cambies lo que la evidencia respalda. Referencia cada una por su "ref".
B) "additional": como máximo 3 oportunidades NUEVAS que no estén ya cubiertas y que se desprendan claramente de los hechos (p. ej. seguimiento de leads, reactivación de clientes antiguos, procesos manuales visibles). Cada una debe citar claves de hechos que existan en "evidenceKeys". Si no hay base suficiente, devuelve [].

Reglas estrictas: español profesional y sin exageraciones; no inventes datos, cifras ni problemas; las ausencias solo se afirman si hay un hecho de tipo "absence"; no prometas resultados cuantificados; serviceKey debe ser uno de la lista dada.`;

function promptFor(ctx: OpportunityContext, facts: Facts, drafts: OpportunityDraft[]): string {
  const c = ctx.company;
  return JSON.stringify(
    {
      negocio: { nombre: c.name, categoria: c.category, nicho: c.niche, ubicacion: [c.city, c.region, c.country].filter(Boolean).join(", ") || c.location, valoracion: c.rating, resenas: c.reviewCount, web: c.website },
      absenceReliability: Number(facts.situation.absenceReliability.toFixed(2)),
      resumen_analisis: ctx.interpretation.summary,
      hechos: [...facts.evidence.values()].map((e) => ({ key: e.key, tipo: e.kind, detalle: e.detail, cita: e.excerpt })),
      oportunidades_detectadas: drafts.map((d, i) => ({ ref: `o${i + 1}`, tipo: d.type, titulo: d.title, problema: d.problem, consecuencia: d.consequence, solucion: d.proposedSolution, evidencias: d.evidence.map((e) => e.key) })),
      serviceKeys_permitidas: SERVICE_KEYS,
    },
    null,
    1,
  );
}

/** Aplica la salida del modelo de forma segura: nunca cambia severidad/confianza/evidencia de las detectadas por reglas. */
export function applyRefinement(drafts: OpportunityDraft[], raw: z.infer<typeof refinedSchema>, facts: Facts): OpportunityDraft[] {
  const out = drafts.map((d) => ({ ...d }));
  for (const r of raw.refined) {
    const idx = Number(r.ref.replace(/^o/, "")) - 1;
    const target = out[idx];
    if (!target) continue;
    target.problem = r.problem.trim();
    target.consequence = r.consequence.trim();
    target.proposedSolution = r.proposedSolution.trim();
    // Se conservan las notas de cautela detectadas por reglas si el modelo no aporta otra.
    if (r.impactNote?.trim()) target.impactNote = r.impactNote.trim();
  }
  const existingTypes = new Set(out.map((d) => d.type));
  let added = 0;
  for (const a of raw.additional) {
    if (added >= MAX_EXTRA_FROM_LLM) break;
    if (!(SERVICE_KEYS as string[]).includes(a.serviceKey)) continue;
    const evidence = facts.pick(...new Set(a.evidenceKeys));
    if (evidence.length === 0) continue;
    // Una afirmación basada solo en ausencias necesita que la web se haya podido leer con fiabilidad.
    if (evidence.every((e) => e.kind === "absence") && facts.situation.absenceReliability < 0.6) continue;
    const type = a.type.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "other";
    if (existingTypes.has(type) && type !== "other") continue;
    existingTypes.add(type);
    out.push({
      type,
      title: a.title.trim(),
      problem: a.problem.trim(),
      consequence: a.consequence.trim(),
      proposedSolution: a.proposedSolution.trim(),
      serviceKey: a.serviceKey as ServiceKey,
      impact: a.impact as ImpactLevel,
      impactNote: "Oportunidad propuesta por el modelo a partir de las evidencias citadas; validar en la conversación.",
      severity: Math.min(4, a.severity) as Severity,
      confidence: Number(Math.min(LLM_EXTRA_MAX_CONFIDENCE, a.confidence).toFixed(2)),
      evidence,
    });
    added++;
  }
  return out;
}

export async function detectOpportunities(ctx: OpportunityContext): Promise<DetectionResult> {
  const facts = buildFacts({ company: ctx.company, signals: ctx.signals, reviews: ctx.reviews, socialProfiles: ctx.socialProfiles });
  const base = detectWithRules(ctx, facts);
  const llm = getLlmInfo();
  if (!llm) {
    return { drafts: base, model: OPPORTUNITIES_RULES_MODEL, fallbackReason: `Sin ${LLM_KEYS_HINT}: redacción por plantillas basadas en evidencias` };
  }
  try {
    const raw = await completeJson({ system: OPPORTUNITY_SYSTEM, prompt: promptFor(ctx, facts, base), schema: refinedSchema, maxTokens: 4000 });
    return { drafts: applyRefinement(base, raw, facts), model: llm.model };
  } catch (e) {
    return { drafts: base, model: OPPORTUNITIES_RULES_MODEL, fallbackReason: `La IA no estuvo disponible (${errorMessage(e).slice(0, 200)}): oportunidades por reglas` };
  }
}

export function createOpportunityEngine(): OpportunityEngine {
  return {
    async detect(ctx) {
      return (await detectOpportunities(ctx)).drafts;
    },
  };
}
