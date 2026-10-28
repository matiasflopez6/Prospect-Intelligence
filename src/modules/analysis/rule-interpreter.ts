import type { Severity } from "@/domain";
import { buildFacts, type Facts, type Situation } from "./facts";
import type { AnalysisInput, AnalysisInterpretation, AnalysisInterpreter, Finding } from "./types";

export const RULES_MODEL_ID = "reglas-v1";

type Company = AnalysisInput["company"];

/**
 * Intérprete determinista (sin IA). Redacta hallazgos que explican qué significa cada señal para
 * el negocio y apoya cada uno en evidencias reales. Se usa cuando no hay ANTHROPIC_API_KEY y como
 * red de seguridad si la interpretación con IA falla o devuelve algo no verificable.
 */
export function createRuleInterpreter(): AnalysisInterpreter {
  return {
    async interpret(input) {
      return interpretWithRules(input, buildFacts(input));
    },
  };
}

export function interpretWithRules(input: AnalysisInput, facts: Facts): AnalysisInterpretation {
  const s = facts.situation;
  const findings: Finding[] = [];
  const push = (
    key: string,
    title: string,
    explanation: string,
    severity: Severity,
    evidenceKeys: string[],
    positive = false,
  ) => {
    const evidence = facts.pick(...evidenceKeys);
    if (evidence.length === 0) return; // sin evidencia no hay hallazgo
    findings.push({ key, title, explanation, severity, positive: positive || undefined, evidence });
  };

  /* Acceso a la web */
  if (!s.hasWebsiteUrl) {
    push(
      "web_presence",
      "El negocio no tiene web conocida",
      "Sin sitio web propio, cada persona que busca el negocio depende de la ficha de Google o de redes sociales para decidir si contactar. No hay un lugar donde explicar servicios, captar consultas fuera de horario ni medir de dónde llegan los clientes.",
      4,
      ["listing.no_website", "listing.rating", "listing.contact"],
    );
  } else if (!s.siteRead) {
    push(
      "web_access",
      "No se pudo revisar la web",
      "El análisis no consiguió abrir la web, así que no se afirma nada sobre su contenido. Si el fallo es real (dominio caído, certificado vencido), sería la primera prioridad: toda visita se pierde. Conviene abrirla manualmente antes de contactar.",
      3,
      ["website.unreachable"],
    );
  }

  if (s.siteRead) {
    /* Propuesta y claridad */
    const hasBasics = !facts.has("website.missing_meta");
    if (facts.has("website.thin_content")) {
      push(
        "value_proposition",
        "La portada explica poco",
        "Con tan poco texto, un visitante nuevo difícilmente entiende qué servicios ofrece el negocio, a quién atiende y por qué elegirlo. Además, los buscadores tienen poco con lo que posicionar la página.",
        3,
        ["website.overview", "website.thin_content", "website.missing_meta"],
      );
    } else if (!hasBasics) {
      push(
        "value_proposition",
        "Propuesta de valor poco definida",
        "La portada carece de elementos básicos (título, descripción o titular principal). Eso dificulta que el visitante entienda en segundos qué ofrece el negocio y cómo se presenta en los resultados de Google.",
        2,
        ["website.overview", "website.missing_meta"],
      );
    } else {
      push(
        "value_proposition",
        "Propuesta de la portada definida",
        "La portada tiene título, titular y descripción propios, una base correcta para que el visitante entienda la oferta y para el posicionamiento.",
        1,
        ["website.overview"],
        true,
      );
    }

    /* Vías de conversión */
    if (facts.has("website.no_whatsapp")) {
      push(
        "whatsapp",
        "WhatsApp no está accesible desde la web",
        `${s.phone ? "El contacto se limita al teléfono y al formulario" : "No hay una vía de mensajería directa"}: quien navega desde el móvil y prefiere escribir debe abandonar la web y buscar el número a mano. WhatsApp es hoy el canal más habitual para consultar a un negocio local, y facilitarlo suele aumentar las consultas.`,
        3,
        ["website.no_whatsapp", "listing.contact"],
      );
    } else if (facts.has("website.whatsapp")) {
      push("whatsapp", "WhatsApp visible en la web", "La web ofrece WhatsApp como vía de contacto, lo que reduce la fricción para consultar desde el móvil. La oportunidad está en lo que ocurre después: la rapidez y calidad de la respuesta.", 1, ["website.whatsapp"], true);
    }

    if (facts.has("website.no_booking")) {
      push(
        "booking",
        "No hay forma de reservar o pedir turno online",
        "Toda cita depende de una llamada o un mensaje en horario de atención. Quien decide fuera de ese horario (tarde, fin de semana) tiene que esperar, y una parte abandona antes de que alguien le responda. Una agenda online con confirmación y recordatorios también reduce ausencias.",
        3,
        ["website.no_booking", "website.ctas"],
      );
    } else if (facts.has("website.booking")) {
      push("booking", "Reservas online disponibles", "El negocio ya permite reservar desde la web, una ventaja frente a quienes dependen solo del teléfono.", 1, ["website.booking"], true);
    }

    if (facts.has("website.no_chat")) {
      push(
        "chat",
        "Sin chat ni asistente para consultas inmediatas",
        "Las dudas habituales (precios, horarios, disponibilidad) solo se resuelven llamando o escribiendo y esperando. Un asistente que responda al instante y recoja los datos de contacto evita perder a quien consulta fuera de horario o prefiere no llamar.",
        2,
        ["website.no_chat"],
      );
    } else if (facts.has("website.chat")) {
      push("chat", "Hay un chat en la web", "La web ya cuenta con un widget de chat, que permite atender consultas inmediatas si hay alguien (o algo) que responda de verdad.", 1, ["website.chat"], true);
    }

    if (facts.has("website.no_form")) {
      push(
        "forms",
        "No hay formulario de consulta",
        "Sin formulario, la única vía registrable de contacto es el teléfono o el correo. Se pierden las consultas de quienes no quieren llamar y el negocio no tiene un registro ordenado de cada lead.",
        3,
        ["website.no_form", "website.phone", "website.email"],
      );
    } else if (facts.has("website.long_form") || facts.has("website.generic_form")) {
      const keys = ["website.form", "website.long_form", "website.generic_form"];
      const parts: string[] = [];
      if (s.longForm) parts.push("pide demasiados campos (cada campo extra baja la tasa de envío)");
      if (s.genericForm) parts.push("no cualifica la consulta (no pregunta servicio ni motivo), de modo que todas llegan con la misma prioridad");
      push("forms", "El formulario se puede optimizar", `El formulario existente ${parts.join(" y ")}. Es mejorable sin rehacer la web.`, 2, keys);
    } else if (facts.has("website.form")) {
      push("forms", "Hay formulario de consulta", "La web recoge consultas mediante formulario, una base correcta para captar leads fuera de horario.", 1, ["website.form"], true);
    }

    if (facts.has("website.no_cta")) {
      push(
        "ctas",
        "Faltan llamadas a la acción claras",
        "No se identifica ningún botón que invite a actuar (reservar, llamar, pedir presupuesto). Sin ese empujón, el visitante lee la página y se va sin dar el siguiente paso.",
        3,
        ["website.no_cta", "website.overview"],
      );
    } else if (facts.has("website.ctas")) {
      push("ctas", "Llamadas a la acción presentes", "La web incluye acciones claras para el visitante.", 1, ["website.ctas"], true);
    }

    if (facts.has("website.no_click_to_call")) {
      push(
        "click_to_call",
        "El teléfono no se puede pulsar para llamar",
        "El número aparece como texto: desde un móvil hay que copiarlo a mano. Es un cambio sencillo que facilita la llamada en el momento de mayor intención.",
        2,
        ["website.no_click_to_call", "website.phone"],
      );
    }

    /* Móvil y técnico */
    const technicalKeys = ["website.no_https", "website.slow_server", "website.pagespeed", "website.no_viewport", "website.outdated"].filter((k) => facts.has(k));
    if (technicalKeys.length) {
      const issues: string[] = [];
      if (facts.has("website.no_viewport")) issues.push("no está adaptada a móvil");
      if (s.pageSpeedScore != null && s.pageSpeedScore < 50) issues.push(`carga lenta en móvil (PageSpeed ${s.pageSpeedScore}/100)`);
      else if (s.serverSlow) issues.push("el servidor responde despacio");
      if (facts.has("website.no_https")) issues.push("no usa HTTPS");
      if (facts.has("website.outdated")) issues.push("parece sin actualizar");
      const sev: Severity = facts.has("website.no_viewport") || (s.pageSpeedScore != null && s.pageSpeedScore < 40) ? 4 : issues.length ? 3 : 2;
      if (issues.length) {
        push(
          "technical",
          "Problemas técnicos visibles en la web",
          `La web ${issues.join(", ")}. Gran parte del tráfico de un negocio local llega desde el móvil, y un sitio lento o poco fiable hace que visitantes con intención de contactar abandonen antes de ver la oferta.`,
          sev,
          technicalKeys,
        );
      } else {
        push("technical", "Rendimiento web aceptable", "No se detectaron problemas técnicos graves en la web.", 1, technicalKeys, true);
      }
    } else if (facts.has("website.mobile_ready")) {
      push("technical", "Web preparada para móvil", "La web declara una configuración adaptable a móvil.", 1, ["website.mobile_ready"], true);
    }

    /* Presencia social y seguimiento */
    if (facts.has("website.no_social")) {
      push("social", "Sin redes sociales enlazadas", "Ni la web enlaza a perfiles sociales ni se conocen por otras fuentes. Para muchos clientes las redes son la prueba de que el negocio está activo; su ausencia resta confianza y deja sin explotar un canal de captación y reactivación.", 2, ["website.no_social"]);
    } else if (facts.has("website.social")) {
      push("social", "Perfiles sociales enlazados", "El negocio mantiene presencia en redes y la enlaza desde la web.", 1, ["website.social"], true);
    }

    if (facts.has("website.no_tracking")) {
      push(
        "tracking",
        "No se aprecia medición ni seguimiento de leads",
        "En el código de la web no hay analítica, píxeles ni herramientas de CRM/marketing. No es concluyente (el seguimiento puede hacerse fuera de la web), pero indica que probablemente no se mide de dónde llegan las consultas ni se automatiza su seguimiento.",
        2,
        ["website.no_tracking"],
      );
    } else if (facts.has("website.tech")) {
      push("tracking", "Hay herramientas de medición/marketing instaladas", "La web carga herramientas de analítica, publicidad o CRM, lo que apunta a cierta madurez digital.", 1, ["website.tech"], true);
    }
  }

  /* Reputación */
  addReputationFindings(push, facts, s, input.company);

  const summary = buildSummary(input.company, s, findings);
  return {
    summary,
    quality: buildQuality(input, facts),
    findings,
    model: RULES_MODEL_ID,
  };
}

function addReputationFindings(
  push: (key: string, title: string, explanation: string, severity: Severity, evidenceKeys: string[], positive?: boolean) => void,
  facts: Facts,
  s: Situation,
  company: Company,
) {
  const complaintKeys = [...facts.evidence.keys()].filter((k) => /^review\.\d+$/.test(k));
  if (complaintKeys.length > 0) {
    push(
      "customer_complaints",
      "Clientes se quejan de no recibir respuesta o de esperas",
      `${complaintKeys.length === 1 ? "Una reseña menciona" : `${complaintKeys.length} reseñas mencionan`} dificultad para ser atendido o esperas largas al contactar con el negocio. Es la señal más directa de que la atención de consultas tiene fugas, y las reseñas son públicas: la ven los próximos clientes.`,
      complaintKeys.length >= 2 ? 4 : 3,
      [...complaintKeys.slice(0, 4), "reviews.negative"],
    );
  }
  if (facts.has("reviews.unanswered")) {
    const share = s.knownReplyInSample ? s.unansweredInSample / s.knownReplyInSample : 0;
    push(
      "review_replies",
      "Reseñas sin respuesta del negocio",
      "Responder a las reseñas (sobre todo a las negativas) demuestra atención y mejora la imagen ante quien las lee. Las que quedan sin respuesta transmiten desinterés y desaprovechan una de las pocas ocasiones públicas de mostrar el trato al cliente.",
      share >= 0.6 && s.negativeInSample > 0 ? 3 : 2,
      ["reviews.unanswered", "reviews.negative", "reviews.sample"],
    );
  } else if (facts.has("reviews.replied")) {
    push("review_replies", "El negocio responde a sus reseñas", "Las reseñas de la muestra tienen respuesta del negocio, una buena práctica de reputación.", 1, ["reviews.replied"], true);
  }
  if (company.rating != null) {
    const n = company.reviewCount ?? 0;
    if (company.rating >= 4.5 && n >= 30) {
      push("reputation", "Reputación sólida", `Con ${company.rating.toFixed(1)}/5 sobre ${n} reseñas, el negocio tiene una reputación fuerte: la demanda existe y los clientes están satisfechos. Lo que se pierda ya no es por falta de confianza sino por cómo se capta y atiende cada consulta.`, 1, ["listing.rating"], true);
    } else if (company.rating < 4.0 && n >= 10) {
      push("reputation", "Valoración mejorable", `Con ${company.rating.toFixed(1)}/5 sobre ${n} reseñas, la valoración queda por debajo de lo que suelen exigir los clientes al elegir entre varias opciones locales. Mejorar la gestión de reseñas y el servicio puede mover esa nota.`, 3, ["listing.rating", "reviews.negative"]);
    } else if (n > 0 && n < 15) {
      push("reputation", "Pocas reseñas públicas", `Solo ${n} reseñas públicas: el negocio aparece como poco contrastado frente a competidores con cientos. Un proceso sencillo de solicitud de reseñas tras cada servicio suele cambiar esto en pocos meses.`, 2, ["listing.rating"]);
    }
  }
}

function buildSummary(company: Company, s: Situation, findings: Finding[]): string {
  const place = [company.city, company.region].filter(Boolean)[0];
  const intro = `${company.name} es ${company.category ? `un negocio de ${company.category.toLowerCase()}` : "un negocio local"}${place ? ` en ${place}` : ""}${
    company.rating != null ? `, con una valoración de ${company.rating.toFixed(1)}/5${company.reviewCount ? ` sobre ${company.reviewCount} reseñas` : ""}` : ""
  }.`;

  let web: string;
  if (!s.hasWebsiteUrl) web = "No se conoce sitio web propio, por lo que su captación depende de la ficha de Google y del boca a boca.";
  else if (!s.siteRead) web = "No se pudo acceder a su web durante el análisis, así que no se evalúa su contenido.";
  else {
    const strengths = findings.filter((f) => f.positive && !["reputation", "review_replies", "value_proposition"].includes(f.key)).map((f) => f.title.toLowerCase());
    const gaps = findings.filter((f) => !f.positive && !["reputation", "review_replies", "customer_complaints"].includes(f.key));
    const worst = [...gaps].sort((a, b) => b.severity - a.severity).slice(0, 3);
    web = `Su web está operativa${strengths.length ? ` y ya cuenta con: ${strengths.slice(0, 3).join("; ")}` : ""}.`;
    if (worst.length) web += ` Los puntos más débiles son: ${worst.map((f) => f.title.toLowerCase()).join("; ")}.`;
    else web += " No se detectaron carencias relevantes de conversión en la web.";
    if (s.clientRendered) web += " Parte del contenido se carga con JavaScript, por lo que las carencias detectadas pueden ser menos fiables.";
  }

  const rep = findings.find((f) => f.key === "customer_complaints");
  const repText = rep ? ` En reputación, ${rep.title.toLowerCase()}.` : "";
  return `${intro} ${web}${repText}`.replace(/\s+/g, " ").trim();
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function buildQuality(input: AnalysisInput, facts: Facts): Record<string, number> {
  const s = facts.situation;
  const signals = input.signals;
  const q: Record<string, number> = {};

  if (s.siteRead && signals) {
    if (!(s.clientRendered && (signals.wordCount ?? 0) < 60)) {
      q.clarity = clamp(35 + (signals.title ? 20 : 0) + (signals.h1?.length ? 15 : 0) + (signals.metaDescription ? 15 : 0) + ((signals.wordCount ?? 0) >= 150 ? 15 : 0));
    }
    const kinds = new Set((signals.ctas ?? []).map((c) => c.kind));
    q.cta = clamp(15 + Math.min(s.ctaCount, 5) * 12 + kinds.size * 8 + (s.clickToCall ? 5 : 0));
    q.conversion = clamp((s.contactForm ? 25 : 0) + (s.booking ? 25 : 0) + (s.whatsapp ? 20 : 0) + (s.chat ? 15 : 0) + (s.clickToCall ? 10 : 0) + (s.newsletter ? 5 : 0));
    const viewportScore = s.viewport ? 70 : 15;
    q.mobile = clamp(s.pageSpeedScore != null ? 0.35 * viewportScore + 0.65 * s.pageSpeedScore : viewportScore + ((signals.mobile?.responsiveHints.length ?? 0) > 1 ? 10 : 0));
    q.trust = clamp((s.https ? 30 : 0) + (s.phone ? 20 : 0) + (s.email ? 10 : 0) + (s.socialCount > 0 ? 15 : 0) + (facts.has("website.outdated") ? 0 : 10) + (signals.contact?.hasContactPage ? 15 : 0));
  }
  if (s.rating != null) {
    const base = ((s.rating - 2.5) / 2.5) * 70;
    const volume = Math.min(20, Math.log10(Math.max(1, s.reviewCount)) * 8);
    const replies = s.knownReplyInSample ? (s.unansweredInSample / s.knownReplyInSample > 0.5 ? -10 : 10) : 0;
    q.reputation = clamp(base + volume + replies);
  }
  return q;
}
