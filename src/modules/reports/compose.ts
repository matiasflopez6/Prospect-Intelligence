import { z } from "zod";
import { IMPACT_LABELS, SCORE_DISCLAIMER, SCORE_TIER_LABELS, SERVICES, serviceLabel, type ScoreTier } from "@/domain";
import { opportunityPriority } from "@/domain/priority";
import type { tables } from "@/lib/db";
import type { SenderProfile } from "../profile/sender";
import type { ReportContent } from "./types";

type Company = typeof tables.companies.$inferSelect;
type Evidence = typeof tables.evidence.$inferSelect;
type Opportunity = typeof tables.opportunities.$inferSelect;

/** Datos persistidos sobre los que se construye el informe. Nada se inventa: todo sale de aquí. */
export interface ReportSource {
  company: Company;
  analysis: { summary: string | null; quality: Record<string, number> | null; findings: unknown[] | null };
  opportunities: (Opportunity & { evidence: Evidence[] })[];
  evidence: Evidence[];
  score?: { total: number; tier: ScoreTier };
  socialPlatforms: string[];
  sender: SenderProfile;
}

const findingSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  severity: z.number().int().min(1).max(5),
  positive: z.boolean().optional(),
});

const QUALITY_LABELS: Record<string, string> = {
  claridad: "Claridad de la propuesta",
  clarity: "Claridad de la propuesta",
  cta: "Llamadas a la acción",
  conversion: "Captación de consultas",
  movil: "Móvil y velocidad",
  mobile: "Móvil y velocidad",
  confianza: "Confianza y contacto",
  trust: "Confianza y contacto",
  reputacion: "Reputación",
  reputation: "Reputación",
  velocidad: "Velocidad y técnica",
  performance: "Velocidad y técnica",
};
const humanize = (k: string) => QUALITY_LABELS[k.toLowerCase()] ?? k.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export class ReportPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportPrerequisiteError";
  }
}

function situationFacts(c: Company, socialPlatforms: string[]): string {
  const parts: string[] = [];
  const where = [c.city, c.region, c.country].filter(Boolean).join(", ") || c.location;
  parts.push(`${c.name} es un negocio${c.category ? ` de ${c.category.toLowerCase()}` : ""}${where ? ` ubicado en ${where}` : ""}.`);
  if (c.rating != null) {
    parts.push(`Su valoración pública es de ${c.rating.toLocaleString("es", { maximumFractionDigits: 1 })} sobre 5${c.reviewCount ? ` con ${c.reviewCount.toLocaleString("es")} reseñas` : ""}.`);
  }
  if (c.website) parts.push(`Su sitio web es ${c.website}.`);
  const channels = [c.phone && "teléfono", c.email && "email", c.whatsapp && "WhatsApp", ...socialPlatforms].filter(Boolean) as string[];
  if (channels.length) parts.push(`Canales públicos identificados: ${channels.join(", ")}.`);
  return parts.join(" ");
}

function impactSummary(opps: ReportSource["opportunities"]): string {
  if (opps.length === 0) {
    return "Con la información pública disponible no se han podido justificar oportunidades de mejora claras. Esto no implica que no existan: un análisis con acceso a datos internos del negocio podría revelar otras.";
  }
  const count = (level: "high" | "medium" | "low") => opps.filter((o) => o.impact === level).length;
  const levels = (["high", "medium", "low"] as const)
    .filter((l) => count(l) > 0)
    .map((l) => `${count(l)} de impacto ${IMPACT_LABELS[l].toLowerCase()}`);
  const paragraphs = [
    `Se han identificado ${opps.length} ${opps.length === 1 ? "oportunidad" : "oportunidades"} (${levels.join(", ")}).`,
  ];
  const notes = opps
    .filter((o) => o.impactNote)
    .slice(0, 4)
    .map((o) => `• ${o.title}: ${sentence(o.impactNote!)}`);
  if (notes.length) paragraphs.push(notes.join("\n"));
  paragraphs.push(
    "Las estimaciones de impacto son cualitativas: se basan en lo observable públicamente y deben validarse con datos reales del negocio (volumen de consultas, tasa de conversión, ticket medio) antes de comprometer cifras.",
  );
  return paragraphs.join("\n\n");
}

/** Construye el contenido estructurado del informe a partir de datos persistidos. Función pura. */
export function composeReportContent(src: ReportSource, now: Date = new Date()): ReportContent {
  const { company: c } = src;
  const opps = [...src.opportunities].sort((a, b) => opportunityPriority(b) - opportunityPriority(a));

  const findings = (src.analysis.findings ?? []).flatMap((f) => {
    const r = findingSchema.safeParse(f);
    return r.success ? [r.data] : [];
  });
  const problemsFromFindings = findings
    .filter((f) => !f.positive)
    .sort((a, b) => b.severity - a.severity)
    .map((f) => ({ title: f.title, description: f.explanation, severity: f.severity as 1 | 2 | 3 | 4 | 5 }));
  const problems = problemsFromFindings.length
    ? problemsFromFindings
    : opps.map((o) => ({ title: o.title, description: o.problem, severity: Math.min(5, Math.max(1, o.severity)) as 1 | 2 | 3 | 4 | 5 }));

  const linkedIds = new Set(opps.flatMap((o) => o.evidence.map((e) => e.id)));
  const evidenceSorted = [...src.evidence.filter((e) => linkedIds.has(e.id)), ...src.evidence.filter((e) => !linkedIds.has(e.id))];
  const toEvidence = (e: Evidence) => ({ label: e.label, detail: e.detail, ...(e.sourceUrl ? { sourceUrl: e.sourceUrl } : {}) });

  const byService = new Map<string, ReportSource["opportunities"]>();
  for (const o of opps) byService.set(o.serviceKey, [...(byService.get(o.serviceKey) ?? []), o]);

  return {
    company: {
      name: c.name,
      ...(c.website ? { website: c.website } : {}),
      ...(c.address ? { address: c.address } : {}),
      ...(c.niche ?? c.category ? { niche: (c.niche ?? c.category)! } : {}),
    },
    generatedAt: now.toISOString(),
    preparedBy: src.sender.name || src.sender.agency ? src.sender : undefined,
    currentSituation: [src.analysis.summary?.trim(), situationFacts(c, src.socialPlatforms)].filter(Boolean).join("\n\n"),
    quality: Object.entries(src.analysis.quality ?? {}).map(([k, v]) => ({ label: humanize(k), value: Math.round(v) })),
    strengths: findings.filter((f) => f.positive).map((f) => ({ title: f.title, description: f.explanation })),
    problems,
    evidence: evidenceSorted.slice(0, 16).map(toEvidence),
    opportunities: opps.map((o) => ({
      title: o.title,
      problem: o.problem,
      evidence: o.evidence.map(toEvidence),
      consequence: o.consequence,
      solution: o.proposedSolution,
      impact: o.impact,
      ...(o.impactNote ? { impactNote: o.impactNote } : {}),
      confidence: o.confidence,
    })),
    recommendations: opps.slice(0, 5).map((o) => `${o.title}: ${sentence(o.proposedSolution)}`),
    proposedSystems: [...byService.entries()].map(([key, list]) => ({
      service: serviceLabel(key),
      description: `${key in SERVICES ? sentence(SERVICES[key as keyof typeof SERVICES].description) + " " : ""}Responde a: ${list.map((o) => o.title).join("; ")}.`,
    })),
    potentialImpact: impactSummary(opps),
    ...(src.score ? { score: { total: src.score.total, tier: SCORE_TIER_LABELS[src.score.tier], disclaimer: SCORE_DISCLAIMER } } : {}),
  };
}
