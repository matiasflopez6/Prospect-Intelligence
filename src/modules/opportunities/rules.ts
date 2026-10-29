import type { Severity } from "@/domain";
import { buildFacts, complaintReviewKeys, type Facts } from "../analysis/facts";
import type { OpportunityContext, OpportunityDraft } from "./types";

/**
 * Detección determinista de oportunidades. Cada regla exige evidencias reales (hechos de
 * `analysis/facts.ts`) y fija la confianza según lo directa que sea la prueba:
 *   - hecho medido (rating, HTTPS, PageSpeed)           → confianza alta
 *   - ausencia observada en una web leída                → media-alta, escalada por `absenceReliability`
 *   - hipótesis combinada (p. ej. solo formulario)       → baja, se declara como tal en el texto
 * No se estiman cifras económicas: el impacto es cualitativo.
 */

const APPOINTMENT_NICHE =
  /cl[ií]nic|dental|odont|m[eé]dic|salud|consultorio|est[eé]tic|peluquer|barber|spa\b|masaj|veterin|fisio|kinesi|psic[oó]log|nutri|dermat|oftalm|ortodon|podolog|belleza|u[ñn]as|tatuaj|dentist|doctor|physio|salon|beauty|clinic|therap|abogad|escriban|contador|taller/i;

const BASE_REL = 0.85;

function scale(base: number, reliability: number): number {
  return Math.max(0.05, Math.min(0.95, Number((base * (reliability / BASE_REL)).toFixed(2))));
}

type Draft = Omit<OpportunityDraft, "evidence"> & { evidenceKeys: string[] };

export function detectWithRules(ctx: OpportunityContext, factsIn?: Facts): OpportunityDraft[] {
  const facts =
    factsIn ??
    buildFacts({ company: ctx.company, signals: ctx.signals, reviews: ctx.reviews, socialProfiles: ctx.socialProfiles });
  const s = facts.situation;
  const rel = s.absenceReliability;
  const drafts: Draft[] = [];
  const nicheText = `${ctx.company.niche ?? ""} ${ctx.company.category ?? ""}`;
  const appointmentBased = APPOINTMENT_NICHE.test(nicheText);
  const sizeable = s.reviewCount >= 30;
  const complaints = complaintReviewKeys(facts);

  /* ---------- Sin web / web con problemas ---------- */
  if (!s.hasWebsiteUrl && facts.has("listing.no_website")) {
    drafts.push({
      type: "poor_website",
      title: "Sin sitio web propio",
      problem: "El negocio no tiene un sitio web conocido: no figura en su ficha ni se encontró en las fuentes consultadas.",
      evidenceKeys: ["listing.no_website", "listing.rating", "listing.contact"],
      consequence:
        "Quien busca el negocio solo dispone de la ficha de Google y redes. No hay lugar donde explicar servicios, captar consultas fuera de horario ni medir de dónde llegan los clientes, y se cede ese tráfico a competidores con web.",
      proposedSolution: "Web sencilla orientada a conversión: servicios, prueba social, WhatsApp, formulario y reserva online.",
      serviceKey: "web_conversion",
      impact: sizeable ? "high" : "medium",
      impactNote: "Se verifica manualmente que realmente no tenga web antes de contactar: las fuentes públicas pueden estar incompletas.",
      severity: 4,
      confidence: 0.6,
    });
  }

  if (s.hasWebsiteUrl && !s.siteRead && ctx.signals) {
    const kind = ctx.signals.fetchErrorKind;
    const status = ctx.signals.httpStatus;
    const definitive = kind === "tls" || kind === "dns" || (kind === "http" && status != null && (status === 404 || status === 410 || status >= 500));
    if (definitive && facts.has("website.unreachable")) {
      drafts.push({
        type: "poor_website",
        title: "La web no responde correctamente",
        problem: `Al abrir la web, el análisis obtuvo: ${ctx.signals.fetchError ?? "error"}${status ? ` (HTTP ${status})` : ""}.`,
        evidenceKeys: ["website.unreachable"],
        consequence: "Si el fallo es real y persistente, cada visita desde Google, redes o publicidad se pierde sin que el negocio lo note.",
        proposedSolution: "Diagnóstico y reparación del sitio (dominio, hosting o certificado) y monitorización automática de disponibilidad.",
        serviceKey: "web_conversion",
        impact: "high",
        impactNote: "Pendiente de comprobación manual: el fallo podría ser puntual o ajeno a la web.",
        severity: 4,
        confidence: kind === "dns" ? 0.4 : 0.5,
      });
    }
  }

  if (s.siteRead) {
    const tech: string[] = [];
    const techKeys: string[] = [];
    let techConfidence = 0;
    let techSeverity: Severity = 2;
    if (facts.has("website.no_viewport")) {
      tech.push("no está adaptada a móvil");
      techKeys.push("website.no_viewport");
      techConfidence = Math.max(techConfidence, 0.85);
      techSeverity = 4;
    }
    if (s.pageSpeedScore != null && s.pageSpeedScore < 50) {
      tech.push(`carga lenta en móvil (PageSpeed ${s.pageSpeedScore}/100)`);
      techKeys.push("website.pagespeed");
      techConfidence = Math.max(techConfidence, 0.8);
      techSeverity = Math.max(techSeverity, s.pageSpeedScore < 40 ? 4 : 3) as Severity;
    }
    if (facts.has("website.no_https")) {
      tech.push("no usa HTTPS");
      techKeys.push("website.no_https");
      techConfidence = Math.max(techConfidence, 0.95);
      techSeverity = Math.max(techSeverity, 3) as Severity;
    }
    if (s.serverSlow && s.pageSpeedScore == null) {
      tech.push("el servidor responde despacio");
      techKeys.push("website.slow_server");
      techConfidence = Math.max(techConfidence, 0.45);
    }
    if (facts.has("website.outdated")) {
      tech.push("parece sin actualizar desde hace años");
      techKeys.push("website.outdated");
      techConfidence = Math.max(techConfidence, 0.4);
    }
    if (tech.length) {
      drafts.push({
        type: "poor_website",
        title: "Web con problemas técnicos visibles",
        problem: `La web presenta problemas técnicos: ${tech.join(", ")}.`,
        evidenceKeys: techKeys,
        consequence:
          "Gran parte del tráfico local llega desde el móvil: una web lenta, no adaptada o marcada como «no segura» hace que visitantes con intención de contactar abandonen antes de ver la oferta.",
        proposedSolution: "Rediseño o refactorización orientada a móvil y velocidad, con HTTPS y medición de conversiones.",
        serviceKey: "web_conversion",
        impact: techSeverity >= 4 ? "high" : "medium",
        severity: techSeverity,
        confidence: techConfidence,
      });
    }

    /* ---------- Vías de contacto y conversión ---------- */
    if (facts.has("website.no_whatsapp")) {
      drafts.push({
        type: "no_whatsapp",
        title: "Sin WhatsApp visible en la web",
        problem: "La web no ofrece un acceso directo a WhatsApp para consultar.",
        evidenceKeys: ["website.no_whatsapp", "listing.contact", "website.phone"],
        consequence:
          "Quien navega desde el móvil y prefiere escribir debe abandonar la web y buscar el contacto a mano; parte de esas consultas se pierde. Además, sin WhatsApp no hay base para respuestas automáticas ni seguimiento.",
        proposedSolution: "Botón de WhatsApp Business con respuesta automática inicial, preguntas de cualificación y derivación a una persona.",
        serviceKey: "whatsapp_automation",
        impact: "medium",
        impactNote: "El volumen real de consultas por este canal no se puede estimar con datos públicos.",
        severity: 3,
        confidence: scale(0.75, rel),
      });
    }

    if (facts.has("website.no_booking")) {
      drafts.push({
        type: "no_booking",
        title: "Sin reservas online",
        problem: "No hay forma de reservar o pedir turno desde la web; hay que llamar o escribir.",
        evidenceKeys: ["website.no_booking", "website.ctas", "website.form"],
        consequence:
          "Las citas dependen de que alguien atienda en horario laboral. Quien decide fuera de horario espera o abandona, y no hay confirmaciones ni recordatorios automáticos que reduzcan las ausencias.",
        proposedSolution: "Agenda online con confirmación, recordatorios por WhatsApp/email y reprogramación autónoma.",
        serviceKey: "online_booking",
        impact: appointmentBased ? "high" : "medium",
        impactNote: appointmentBased ? "El negocio vive de citas, por lo que cada hueco sin cubrir o ausencia tiene coste directo." : undefined,
        severity: 3,
        confidence: scale(appointmentBased ? 0.78 : 0.5, rel),
      });
    }

    if (facts.has("website.no_chat")) {
      drafts.push({
        type: "no_chat",
        title: "Sin chat ni asistente en la web",
        problem: "No hay chat ni asistente que responda dudas al instante.",
        evidenceKeys: ["website.no_chat"],
        consequence: "Dudas frecuentes (precio, horarios, disponibilidad) solo se resuelven llamando o esperando respuesta; quien consulta fuera de horario no recibe nada.",
        proposedSolution: "Asistente de IA entrenado con la información del negocio que responde 24/7, cualifica y pasa el contacto a una persona.",
        serviceKey: "ai_chat_assistant",
        impact: "medium",
        severity: 2,
        confidence: scale(0.6, rel),
      });
    }

    if (facts.has("website.no_form")) {
      drafts.push({
        type: "weak_forms",
        title: "Sin formulario de consulta",
        problem: "La web no tiene formulario para dejar una consulta.",
        evidenceKeys: ["website.no_form", "website.phone", "website.email"],
        consequence: "Solo pueden contactar quienes llaman o escriben un correo; se pierden las consultas de quien no quiere llamar y no hay registro ordenado de cada lead.",
        proposedSolution: "Formulario breve conectado a un CRM, con respuesta automática y aviso inmediato al equipo.",
        serviceKey: "web_conversion",
        impact: "medium",
        severity: 3,
        confidence: scale(0.72, rel),
      });
    } else {
      if (s.longForm) {
        drafts.push({
          type: "weak_forms",
          title: "Formulario demasiado largo",
          problem: "El formulario de contacto pide muchos campos antes de poder enviar la consulta.",
          evidenceKeys: ["website.long_form", "website.form"],
          consequence: "Cada campo adicional reduce la tasa de envío; se pierden consultas que sí tenían intención de contactar.",
          proposedSolution: "Simplificar el formulario y pedir el resto de datos en una conversación automática posterior.",
          serviceKey: "web_conversion",
          impact: "medium",
          severity: 2,
          confidence: 0.7,
        });
      }
      if (s.genericForm) {
        drafts.push({
          type: "poor_lead_qualification",
          title: "Formulario sin cualificación de consultas",
          problem: "El formulario recoge datos básicos pero no pregunta servicio, urgencia o motivo.",
          evidenceKeys: ["website.generic_form", "website.form"],
          consequence: "Todas las consultas llegan con la misma prioridad: el equipo dedica el mismo tiempo a una consulta valiosa que a una curiosidad y tarda más en responder a las importantes.",
          proposedSolution: "Flujo de cualificación (servicio, urgencia, presupuesto) con puntuación automática y enrutado al responsable adecuado.",
          serviceKey: "lead_qualification",
          impact: "medium",
          severity: 2,
          confidence: 0.55,
        });
      }
    }

    if (facts.has("website.no_cta")) {
      drafts.push({
        type: "weak_cta",
        title: "Sin llamadas a la acción claras",
        problem: "No se encuentra ningún botón o enlace que invite a reservar, llamar o pedir información.",
        evidenceKeys: ["website.no_cta", "website.overview"],
        consequence: "El visitante lee y se va sin dar el siguiente paso; la web informa pero no convierte.",
        proposedSolution: "Rediseño de la portada con una acción principal visible (reservar/escribir) y accesos repetidos a lo largo de la página.",
        serviceKey: "web_conversion",
        impact: "medium",
        severity: 3,
        confidence: scale(0.7, rel),
      });
    }
    if (facts.has("website.no_click_to_call")) {
      drafts.push({
        type: "weak_cta",
        title: "Teléfono sin enlace de llamada",
        problem: "El teléfono aparece como texto, sin enlace para llamar con un toque.",
        evidenceKeys: ["website.no_click_to_call", "website.phone"],
        consequence: "Desde el móvil hay que copiar el número a mano justo en el momento de mayor intención de contacto.",
        proposedSolution: "Enlaces de llamada y WhatsApp con un toque, y registro automático de las llamadas perdidas.",
        serviceKey: "call_handling",
        impact: "low",
        severity: 2,
        confidence: scale(0.8, rel),
      });
    }

    /* ---------- Leads sin respuesta inmediata (hipótesis) ---------- */
    if (complaints.length === 0 && s.contactForm && !s.whatsapp && !s.chat && !s.booking) {
      drafts.push({
        type: "no_instant_response",
        title: "Posibles consultas sin respuesta inmediata",
        problem:
          "La única vía de consulta online es un formulario: no hay WhatsApp, chat ni reserva que den respuesta al momento. Es una hipótesis (no se puede ver qué ocurre tras enviar el formulario).",
        evidenceKeys: ["website.form", "website.no_whatsapp", "website.no_chat", "website.no_booking"],
        consequence: "Quien envía un formulario compite con otros negocios que responden antes: si la respuesta tarda horas, muchas consultas se enfrían o se pierden.",
        proposedSolution: "Respuesta automática en segundos a cada formulario con confirmación, preguntas de cualificación y aviso inmediato al equipo.",
        serviceKey: "instant_lead_response",
        impact: "high",
        impactNote: "Hipótesis a validar en la primera conversación: preguntar cuánto tardan hoy en responder.",
        severity: 3,
        confidence: scale(0.4, rel),
      });
    }

    if (!s.tracking && !s.crmTool && facts.has("website.no_tracking")) {
      drafts.push({
        type: "no_crm",
        title: "Sin medición ni seguimiento de leads visible",
        problem: "La web no carga analítica, píxeles ni herramientas de CRM/marketing. Es una señal indirecta: el seguimiento podría hacerse fuera de la web.",
        evidenceKeys: ["website.no_tracking", "website.form"],
        consequence: "Si no se mide de dónde llegan las consultas ni se registra su evolución, el negocio no sabe qué canal funciona y las consultas no atendidas pasan desapercibidas.",
        proposedSolution: "Implantar un CRM sencillo conectado a formulario/WhatsApp con seguimiento automático y panel de resultados.",
        serviceKey: "crm_implementation",
        impact: "medium",
        impactNote: "Confirmar en la conversación qué herramienta usan hoy para registrar consultas.",
        severity: 2,
        confidence: scale(s.contactForm ? 0.4 : 0.3, rel),
      });
    }
  }

  /* ---------- Reseñas y reputación (no dependen de la web) ---------- */
  if (complaints.length > 0) {
    const n = complaints.length;
    drafts.push({
      type: "no_instant_response",
      title: "Clientes reportan no recibir respuesta o esperas",
      problem: `${n === 1 ? "Una reseña de la muestra describe" : `${n} reseñas de la muestra describen`} dificultad para ser atendido o esperas al contactar con el negocio.`,
      evidenceKeys: [...complaints.slice(0, 4), "reviews.negative", "reviews.sample"],
      consequence: "Es la señal más directa de que se pierden consultas, y como las reseñas son públicas, las ven los próximos clientes antes de decidir.",
      proposedSolution: "Respuesta inmediata automática por WhatsApp/web/llamada perdida, con seguimiento hasta que una persona atienda cada consulta.",
      serviceKey: "instant_lead_response",
      impact: "high",
      impactNote: "Una reseña es una muestra pequeña: conviene confirmar el patrón en la conversación.",
      severity: n >= 2 ? 4 : 3,
      confidence: n >= 3 ? 0.8 : n === 2 ? 0.7 : 0.55,
    });
  }

  if (s.unansweredInSample >= 2 && s.knownReplyInSample > 0 && s.unansweredInSample / s.knownReplyInSample >= 0.5) {
    const sev: Severity = s.negativeInSample > 0 ? 3 : 2;
    drafts.push({
      type: "unanswered_reviews",
      title: "Reseñas sin responder",
      problem: `${s.unansweredInSample} de ${s.knownReplyInSample} reseñas de la muestra con estado conocido no tienen respuesta del negocio.`,
      evidenceKeys: ["reviews.unanswered", "reviews.negative", "reviews.sample"],
      consequence: "Las reseñas sin respuesta transmiten desinterés y desaprovechan la ocasión de mostrar el trato al cliente; las negativas sin respuesta pesan más ante quien las lee.",
      proposedSolution: "Sistema de aviso de nuevas reseñas con borradores de respuesta asistidos por IA, que el negocio aprueba en segundos.",
      serviceKey: "review_management",
      impact: "medium",
      severity: sev,
      confidence: Number((0.5 + 0.3 * Math.min(1, s.knownReplyInSample / 8)).toFixed(2)),
    });
  }

  if (s.rating != null && s.rating < 4.0 && s.reviewCount >= 10) {
    drafts.push({
      type: "low_reputation",
      title: "Valoración pública mejorable",
      problem: `La valoración media es ${s.rating.toFixed(1)}/5 sobre ${s.reviewCount} reseñas.`,
      evidenceKeys: ["listing.rating", "reviews.negative", "reviews.unanswered"],
      consequence: "Con varias opciones locales a la vista, una nota por debajo de 4 aleja a parte de los clientes potenciales antes de que contacten.",
      proposedSolution: "Solicitud automática de reseñas a clientes satisfechos tras cada servicio y gestión asistida de las críticas.",
      serviceKey: "review_management",
      impact: "high",
      severity: 3,
      confidence: 0.8,
    });
  } else if (facts.has("listing.rating") && s.reviewCount > 0 && s.reviewCount < 15) {
    drafts.push({
      type: "few_reviews",
      title: "Pocas reseñas públicas",
      problem: `El negocio tiene solo ${s.reviewCount} reseñas públicas.`,
      evidenceKeys: ["listing.rating"],
      consequence: "Frente a competidores con cientos de reseñas, el negocio parece poco contrastado y pierde en comparación.",
      proposedSolution: "Proceso automático de solicitud de reseñas por WhatsApp/email tras cada visita o servicio.",
      serviceKey: "review_management",
      impact: "medium",
      severity: 2,
      confidence: 0.7,
    });
  }

  // Resolver evidencias; sin evidencia no hay oportunidad.
  const seen = new Set<string>();
  const out: OpportunityDraft[] = [];
  for (const { evidenceKeys, ...d } of drafts) {
    const evidence = facts.pick(...evidenceKeys);
    if (evidence.length === 0) continue;
    const id = `${d.type}|${d.title}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...d, evidence, confidence: Number(Math.max(0.05, Math.min(0.95, d.confidence)).toFixed(2)) });
  }
  return out.sort((a, b) => b.severity * b.confidence - a.severity * a.confidence);
}
