import type { MessageChannel } from "@/domain";

/** Límites de longitud (en palabras) por canal: mensajes breves que abren conversación. */
export const WORD_LIMITS: Record<MessageChannel, number> = { email: 190, linkedin: 110, whatsapp: 90 };
const SUBJECT_MAX_CHARS = 90;

const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\{\{[^}]*\}\}|\{[a-z_]+\}|<[a-z][^>]*>/i;
const TEMPLATE_PHRASES = [
  /espero que (este|el) (mensaje|correo|email) te encuentre/i,
  /espero que (te|le) encuentre bien/i,
  /somos (una )?(empresa|agencia|consultora) l[ií]der/i,
  /(oferta|propuesta) (exclusiva|única|irrepetible)/i,
];

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export interface MessageCandidate {
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  evidenceIds: number[];
}

/**
 * Comprueba que un mensaje generado cumple las reglas del producto: breve, sin marcadores de plantilla
 * y apoyado solo en evidencias reales de la empresa. Devuelve la lista de problemas (vacía = válido).
 */
export function validateMessage(m: MessageCandidate, knownEvidenceIds: ReadonlySet<number>): string[] {
  const problems: string[] = [];
  const body = m.body.trim();
  if (!body) problems.push(`${m.channel}: el cuerpo está vacío`);
  const words = countWords(body);
  if (words > WORD_LIMITS[m.channel]) problems.push(`${m.channel}: demasiado largo (${words} palabras; máximo ${WORD_LIMITS[m.channel]})`);
  if (PLACEHOLDER.test(body) || (m.subject && PLACEHOLDER.test(m.subject))) {
    problems.push(`${m.channel}: contiene marcadores de plantilla entre corchetes o llaves; elimínalos o escribe el dato real`);
  }
  if (TEMPLATE_PHRASES.some((r) => r.test(body))) problems.push(`${m.channel}: usa frases de plantilla genéricas`);
  if (m.channel === "email") {
    if (!m.subject?.trim()) problems.push("email: falta el asunto");
    else if (m.subject.length > SUBJECT_MAX_CHARS) problems.push(`email: asunto demasiado largo (${m.subject.length} caracteres)`);
  }
  if (m.evidenceIds.length === 0) problems.push(`${m.channel}: no cita ninguna evidencia`);
  const unknown = m.evidenceIds.filter((id) => !knownEvidenceIds.has(id));
  if (unknown.length) problems.push(`${m.channel}: cita evidencias que no existen (${unknown.join(", ")})`);
  return problems;
}
