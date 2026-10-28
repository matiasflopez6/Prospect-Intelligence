import { MESSAGE_CHANNEL_LABELS, SERVICES, type MessageChannel } from "@/domain";
import type { SenderProfile } from "../profile/sender";
import { WORD_LIMITS } from "./validate";

/** Datos reales del negocio y la oportunidad sobre los que se redacta. Nada de esto es inventado. */
export interface OutreachFacts {
  company: {
    name: string;
    category?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    website?: string | null;
    hasWhatsapp: boolean;
  };
  opportunity: { title: string; problem: string; consequence: string; serviceKey: string; confidence: number };
  evidence: { id: number; kind: string; label: string; detail: string; excerpt?: string | null; sourceUrl?: string | null }[];
}

export const OUTREACH_SYSTEM = `Eres un consultor senior de IA y automatización que escribe primeros mensajes de contacto a negocios reales. Escribes como una persona atenta que ha mirado el negocio, nunca como una plantilla.

REGLAS (todas obligatorias):
1. Objetivo: abrir una conversación, no vender. Termina con una pregunta sencilla y de bajo compromiso. No menciones precios, descuentos ni "ofertas".
2. Menciona al menos un hecho concreto y verificable de ESTE negocio, tomado de las evidencias, dicho con tus palabras y sin exagerar.
3. Plantea el posible problema como una observación honesta, con humildad ("me llamó la atención que…", "puede que ya lo tengan resuelto por otra vía"). Nunca como una acusación ni como un hecho si la evidencia solo lo sugiere: con confianza inferior al 60% formúlalo solo como pregunta o hipótesis.
4. NO inventes nada: ningún dato, cifra, resultado, cliente, caso de éxito, nombre de persona ni conversación previa que no aparezca en los datos recibidos. No prometas resultados.
5. Cero marcadores de plantilla ([nombre], {{x}}…). Cero emojis. Cero frases hechas ("espero que este mensaje te encuentre bien", "somos líderes en…").
6. Breve: email ≤ ${WORD_LIMITS.email} palabras con asunto corto y concreto (sin clickbait); LinkedIn ≤ ${WORD_LIMITS.linkedin} palabras sin asunto; WhatsApp ≤ ${WORD_LIMITS.whatsapp} palabras, cercano y respetuoso.
7. Cada mensaje cita en "evidenceIds" los ids (solo de la lista recibida) de las evidencias en las que realmente se apoya.
8. Idioma: español. Usa el registro natural del país del negocio (voseo en Argentina y Uruguay; tuteo o "usted" cuidado en el resto). Ante la duda, tono neutro y cordial.
9. Firma solo con los datos del remitente que se te den. Si no hay nombre, termina el mensaje sin firma (no escribas "[Tu nombre]" ni inventes uno).
10. Cada canal debe leerse como un mensaje distinto escrito para ese canal, no como copias recortadas.`;

export function buildOutreachPrompt(facts: OutreachFacts, channels: MessageChannel[], sender: SenderProfile, language: string): string {
  const service = facts.opportunity.serviceKey in SERVICES ? SERVICES[facts.opportunity.serviceKey as keyof typeof SERVICES].label : facts.opportunity.serviceKey;
  const senderText = sender.name
    ? `Remitente: ${sender.name}${sender.agency ? `, de ${sender.agency}` : ""}. Preséntate con esos datos (sin añadir cargos ni experiencia que no se den).`
    : sender.agency
      ? `Remitente sin nombre propio; trabaja en ${sender.agency}. No firmes con nombre.`
      : "Remitente sin datos: preséntate solo como alguien que trabaja ayudando a negocios a automatizar con IA, y no firmes con nombre.";
  const wanted = channels.map((c) => `- ${c} (${MESSAGE_CHANNEL_LABELS[c]})${c === "email" ? ": incluye subject" : ": sin subject"}`).join("\n");
  return `Idioma de salida: ${language}.

DATOS DEL NEGOCIO (reales):
${JSON.stringify(facts.company, null, 2)}

OPORTUNIDAD SOBRE LA QUE ABRIR LA CONVERSACIÓN (detectada por nuestro análisis; confianza ${Math.round(facts.opportunity.confidence * 100)}%):
- Título: ${facts.opportunity.title}
- Problema observado: ${facts.opportunity.problem}
- Consecuencia posible: ${facts.opportunity.consequence}
- Tipo de ayuda relacionada: ${service} (no la vendas; solo úsala para orientar la pregunta)

EVIDENCIAS DISPONIBLES (cítalas por id; no uses nada que no esté aquí o en los datos del negocio):
${JSON.stringify(facts.evidence, null, 2)}

${senderText}

Escribe un mensaje para cada canal:
${wanted}

Devuelve un objeto JSON con esta forma exacta:
{"messages":[{"channel":"email","subject":"…","body":"…","evidenceIds":[1,2]}]}`;
}
