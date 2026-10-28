import { tierForScore } from "@/domain";
import type { ImpactLevel } from "@/domain";
import type { ScoreComponent, ScoreResult, ScoringEngine, ScoringInput } from "./types";

export const SCORING_METHOD_VERSION = "heuristica-v1";

/**
 * Puntuación heurística de prioridad comercial (0–100). NO es una medida científica: combina
 * factores observables con pesos fijados por criterio de negocio. Cada componente se guarda con
 * su valor, su peso y una explicación en lenguaje claro para poder auditar la nota.
 *
 *   Σ puntos = 100 · Σ (peso · valor normalizado 0–1)
 *
 * Función pura y determinista: misma entrada → misma salida.
 */
export const SCORE_WEIGHTS = {
  severity: 0.24,
  opportunity_count: 0.12,
  business_size: 0.12,
  activity: 0.08,
  digital_gap: 0.12,
  reachability: 0.12,
  economic_potential: 0.1,
  confidence: 0.1,
} as const;

const IMPACT_VALUE: Record<ImpactLevel, number> = { high: 1, medium: 0.6, low: 0.3 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function createScoringEngine(): ScoringEngine {
  return { score: scoreCompany };
}

export function scoreCompany(input: ScoringInput): ScoreResult {
  const { company, opportunities, context = {} } = input;
  const comps: Omit<ScoreComponent, "points">[] = [];
  const ranked = [...opportunities].sort((a, b) => (b.severity / 5) * b.confidence - (a.severity / 5) * a.confidence);

  /* 1. Severidad */
  const top = ranked.slice(0, 3);
  const topWeights = [0.6, 0.25, 0.15];
  const weighted = top.reduce((sum, o, i) => sum + (o.severity / 5) * o.confidence * topWeights[i]!, 0);
  const severityValue = clamp01(weighted / 0.7);
  comps.push({
    key: "severity",
    label: "Gravedad de los problemas",
    weight: SCORE_WEIGHTS.severity,
    value: severityValue,
    explanation: top.length
      ? `Pondera la severidad (1–5) por la confianza de las ${top.length} oportunidades más serias: ${top.map((o) => `«${o.title}» (${o.severity}/5, confianza ${pct(o.confidence)})`).join("; ")}.`
      : "No se detectaron problemas con evidencia suficiente.",
  });

  /* 2. Número de oportunidades */
  const effective = opportunities.reduce((sum, o) => sum + o.confidence, 0);
  comps.push({
    key: "opportunity_count",
    label: "Número de oportunidades",
    weight: SCORE_WEIGHTS.opportunity_count,
    value: clamp01(effective / 4),
    explanation: `${opportunities.length} oportunidad(es) detectadas; cuentan según su confianza (equivalen a ${effective.toFixed(1)} oportunidades seguras, el máximo se alcanza con 4).`,
  });

  /* 3. Tamaño aparente */
  const reviews = company.reviewCount ?? 0;
  const sizeValue = reviews > 0 ? clamp01(Math.log10(reviews + 1) / Math.log10(501)) : 0.15;
  comps.push({
    key: "business_size",
    label: "Tamaño aparente del negocio",
    weight: SCORE_WEIGHTS.business_size,
    value: sizeValue,
    explanation:
      reviews > 0
        ? `${reviews} reseñas públicas como indicador de volumen de clientes (escala logarítmica; 500 o más equivale al máximo). Es un indicio, no una medida de facturación.`
        : "Sin reseñas públicas conocidas: no hay indicios del volumen de actividad (valor mínimo).",
  });

  /* 4. Actividad */
  const sample = context.sampleSize ?? 0;
  const recent = context.recentReviews ?? 0;
  let activityValue: number;
  let activityExplanation: string;
  if (company.businessStatus && /CLOSED/i.test(company.businessStatus)) {
    activityValue = 0;
    activityExplanation = "La ficha indica que el negocio está cerrado.";
  } else if (sample > 0) {
    activityValue = clamp01(0.3 + 0.7 * (recent / sample));
    activityExplanation = `${recent} de ${sample} reseñas de la muestra son del último año: indicio de actividad actual.`;
  } else if (reviews > 0) {
    activityValue = 0.4;
    activityExplanation = "Hay reseñas, pero no se conocen sus fechas: actividad reciente sin confirmar (valor neutro).";
  } else {
    activityValue = 0.2;
    activityExplanation = "No hay datos de actividad reciente (valor bajo por falta de información).";
  }
  comps.push({ key: "activity", label: "Actividad reciente", weight: SCORE_WEIGHTS.activity, value: activityValue, explanation: activityExplanation });

  /* 5. Carencias de presencia digital */
  const quality = Object.values(context.quality ?? {});
  let gapValue: number;
  let gapExplanation: string;
  if (context.hasWebsite === false) {
    gapValue = 0.9;
    gapExplanation = "Sin web conocida: la presencia digital propia es mínima, por lo que hay mucho margen de mejora.";
  } else if (!input.websiteReachable) {
    gapValue = 0.5;
    gapExplanation = "No se pudo analizar la web: se asume un valor neutro hasta poder revisarla.";
  } else if (quality.length) {
    const avg = quality.reduce((a, b) => a + b, 0) / quality.length;
    gapValue = clamp01(1 - avg / 100);
    gapExplanation = `Calidad media de la web ${Math.round(avg)}/100 (claridad, acciones, conversión, móvil, confianza): cuanto más baja, más margen de mejora.`;
  } else {
    gapValue = 0.5;
    gapExplanation = "Sin métricas de calidad suficientes: valor neutro.";
  }
  comps.push({ key: "digital_gap", label: "Margen de mejora digital", weight: SCORE_WEIGHTS.digital_gap, value: gapValue, explanation: gapExplanation });

  /* 6. Facilidad de contacto */
  const channels: string[] = [];
  let reach = 0;
  if (company.phone || context.phone) { reach += 0.35; channels.push("teléfono"); }
  if (company.email || context.email) { reach += 0.25; channels.push("email"); }
  if (company.whatsapp || context.whatsapp) { reach += 0.25; channels.push("WhatsApp"); }
  if (company.website) { reach += 0.15; channels.push("web"); }
  comps.push({
    key: "reachability",
    label: "Facilidad para contactar",
    weight: SCORE_WEIGHTS.reachability,
    value: clamp01(reach),
    explanation: channels.length ? `Canales disponibles: ${channels.join(", ")}.` : "No se conoce ningún canal de contacto directo.",
  });

  /* 7. Potencial económico (proxy) */
  const impactValue = top.length ? top.reduce((sum, o, i) => sum + IMPACT_VALUE[o.impact] * o.confidence * topWeights[i]!, 0) / (topWeights.slice(0, top.length).reduce((a, b) => a + b, 0) * 0.9) : 0;
  const price = company.priceLevel != null ? clamp01(company.priceLevel / 4) : sizeValue;
  const econValue = clamp01(0.5 * clamp01(impactValue) + 0.3 * sizeValue + 0.2 * price);
  comps.push({
    key: "economic_potential",
    label: "Potencial económico (estimado)",
    weight: SCORE_WEIGHTS.economic_potential,
    value: econValue,
    explanation: `Combina el impacto esperado de las oportunidades (50%), el tamaño aparente (30%) y ${company.priceLevel != null ? "el nivel de precios de la ficha" : "el tamaño como sustituto del nivel de precios, que no consta"} (20%). Es un indicador relativo, no una previsión de ingresos.`,
  });

  /* 8. Confianza en el análisis */
  const oppConfidence = top.length ? top.reduce((s, o, i) => s + o.confidence * topWeights[i]!, 0) / topWeights.slice(0, top.length).reduce((a, b) => a + b, 0) : 0.3;
  const completeness = (input.websiteReachable || context.hasWebsite === false ? 1 : 0.6) * (sample > 0 ? 1 : 0.85);
  const confidenceValue = clamp01(oppConfidence * completeness);
  comps.push({
    key: "confidence",
    label: "Confianza en el análisis",
    weight: SCORE_WEIGHTS.confidence,
    value: confidenceValue,
    explanation: `Confianza media de las oportunidades principales (${pct(oppConfidence)}) ajustada por la información disponible (${pct(completeness)}: ${input.websiteReachable ? "web analizada" : "web no analizada"}, ${sample > 0 ? "con muestra de reseñas" : "sin muestra de reseñas"}).`,
  });

  const components: ScoreComponent[] = comps.map((c) => ({ ...c, value: Number(c.value.toFixed(3)), points: round1(100 * c.weight * c.value) }));
  const total = Math.max(0, Math.min(100, Math.round(components.reduce((s, c) => s + c.points, 0))));
  return { total, tier: tierForScore(total), confidence: Number(confidenceValue.toFixed(2)), components, methodVersion: SCORING_METHOD_VERSION };
}
