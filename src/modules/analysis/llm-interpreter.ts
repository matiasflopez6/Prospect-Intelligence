import { z } from "zod";
import type { Severity } from "@/domain";
import { completeJson, getLlmInfo } from "@/lib/llm";
import { buildFacts, type Facts } from "./facts";
import { interpretWithRules } from "./rule-interpreter";
import type { AnalysisInput, AnalysisInterpretation, AnalysisInterpreter, Finding } from "./types";

const findingItem = z.object({
  key: z.string().min(2).transform((v) => v.slice(0, 60)),
  title: z.string().min(3).transform((v) => v.slice(0, 140)),
  explanation: z.string().min(20).transform((v) => (v.length > 900 ? `${v.slice(0, 899).trimEnd()}…` : v)),
  severity: z.number().int().min(1).max(5),
  positive: z.boolean().optional(),
  evidenceKeys: z.array(z.string()).min(1).max(8),
});

const outputSchema = z.object({
  summary: z.string().min(40).transform((v) => (v.length > 1400 ? `${v.slice(0, 1399).trimEnd()}…` : v)),
  quality: z.record(z.string(), z.number()).default({}),
  // Un hallazgo mal formado se descarta (null) en vez de invalidar toda la respuesta del modelo.
  findings: z.array(findingItem.nullable().catch(null)),
});

export const INTERPRETER_SYSTEM = `Eres analista de inteligencia comercial para una consultora de IA y automatización que busca clientes entre negocios locales. Recibes HECHOS verificados sobre un negocio (cada uno con una clave) y debes interpretarlos: explicar qué significan y por qué importan comercialmente.

Reglas estrictas:
- Escribe en español, tono profesional y directo, sin exageraciones ni jerga de marketing.
- Solo puedes afirmar lo que esté respaldado por los hechos. Cada hallazgo debe citar, en "evidenceKeys", claves que EXISTAN en la lista de hechos. No inventes claves.
- Una ausencia («no tiene WhatsApp», «sin reservas»…) solo puede afirmarse si existe un hecho de tipo "absence" para ello. Si "absenceReliability" es baja (< 0.6), matiza que la web se dibuja con JavaScript y la ausencia puede no ser real.
- Cuando lo único que se sabe es que una fuente (mapa, directorio) no lista un dato —p. ej. el sitio web— no afirmes que el negocio "no tiene" ese dato ni que "opera sin" él: di que "no consta en las fuentes consultadas" y que debe verificarse. Reserva el tono categórico para ausencias comprobadas leyendo la propia web.
- No inventes datos de contacto, cifras, nombres de personas, ni problemas que no se desprendan de los hechos.
- Explica la consecuencia para el negocio (consultas o clientes que se pierden), no solo el dato. Distingue entre lo observado y lo que es una inferencia razonable, usando expresiones como «probablemente» cuando corresponda.
- Incluye también fortalezas (positive=true, severity 1) cuando los hechos las respalden: reconocer lo que está bien hecho da credibilidad.
- severity: 1 = irrelevante o fortaleza, 3 = relevante, 5 = crítico.
- "quality": puntuaciones 0-100 para las claves clarity, cta, conversion, mobile, trust, reputation. Omite las que no tengas base para estimar.
- "summary": 3-4 frases sobre la situación del negocio y dónde están sus mayores huecos.`;

function factsForPrompt(facts: Facts) {
  return [...facts.evidence.values()].map((e) => ({ key: e.key, tipo: e.kind, etiqueta: e.label, detalle: e.detail, cita: e.excerpt }));
}

export function buildInterpreterPrompt(input: AnalysisInput, facts: Facts): string {
  const c = input.company;
  const s = facts.situation;
  return JSON.stringify(
    {
      negocio: {
        nombre: c.name,
        categoria: c.category,
        nicho_busqueda: c.niche,
        ubicacion: [c.city, c.region, c.country].filter(Boolean).join(", ") || c.location,
        web: c.website,
        valoracion: c.rating,
        resenas: c.reviewCount,
      },
      absenceReliability: Number(s.absenceReliability.toFixed(2)),
      web_leida: s.siteRead,
      hechos: factsForPrompt(facts),
      instrucciones: "Devuelve JSON { summary, quality, findings:[{key,title,explanation,severity,positive?,evidenceKeys[]}] }",
    },
    null,
    1,
  );
}

/** Convierte la salida del LLM en una interpretación verificada: descarta claves inventadas y hallazgos sin evidencia. */
export function sanitizeInterpretation(raw: z.infer<typeof outputSchema>, facts: Facts, model: string): AnalysisInterpretation | undefined {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const f of raw.findings.slice(0, 14)) {
    if (!f) continue;
    const evidence = facts.pick(...new Set(f.evidenceKeys));
    if (evidence.length === 0) continue;
    const key = f.key.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "hallazgo";
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      key,
      title: f.title.trim(),
      explanation: f.explanation.trim(),
      severity: (f.positive ? 1 : f.severity) as Severity,
      positive: f.positive || undefined,
      evidence,
    });
  }
  if (findings.length === 0) return undefined;
  const quality: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.quality)) {
    if (Number.isFinite(v)) quality[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return { summary: raw.summary.trim(), quality, findings, model };
}

/**
 * Interpretación con IA. Los hechos y la verificación son deterministas: el modelo solo redacta
 * y prioriza sobre evidencias que ya existen. Si la IA falla, quien llama decide el respaldo.
 */
export function createLlmInterpreter(): AnalysisInterpreter {
  return {
    async interpret(input) {
      const facts = buildFacts(input);
      const model = getLlmInfo()?.model ?? "ia";
      const raw = await completeJson({
        system: INTERPRETER_SYSTEM,
        prompt: buildInterpreterPrompt(input, facts),
        schema: outputSchema,
        maxTokens: 3500,
      });
      const result = sanitizeInterpretation(raw, facts, model);
      if (!result) throw new Error("La interpretación del modelo no citó ninguna evidencia válida");
      // Calidad: lo medible por reglas manda; el modelo solo aporta las dimensiones que las reglas no cubren.
      const ruleQuality = interpretWithRules(input, facts).quality;
      result.quality = { ...result.quality, ...ruleQuality };
      return result;
    },
  };
}
