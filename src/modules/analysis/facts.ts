import type { EvidenceDraft, WebsiteSignals } from "./types";

type Company = typeof import("@/lib/db/schema").companies.$inferSelect;
type Review = typeof import("@/lib/db/schema").reviews.$inferSelect;

/**
 * Capa de hechos: convierte lo observado (ficha, web, reseñas) en evidencias citables con clave
 * estable. Todo lo que dicen después el intérprete, el motor de oportunidades o el LLM debe apoyarse
 * en estas claves; lo que no esté aquí no puede afirmarse.
 *
 * Regla de ausencias: "no se encontró X" solo se registra (kind "absence") si se pudo leer la web.
 * `absenceReliability` indica cuánto fiarse de esas ausencias (webs que se dibujan con JavaScript
 * pueden ocultar chat, reservas, etc. en el HTML inicial).
 */

export interface SocialLink {
  platform: string;
  url: string;
}

export interface FactsInput {
  company: Company;
  signals?: WebsiteSignals;
  reviews: Review[];
  socialProfiles?: SocialLink[];
  now?: Date;
}

export interface Situation {
  hasWebsiteUrl: boolean;
  siteRead: boolean;
  /** 0–1: confianza en las afirmaciones de ausencia sobre la web. 0 si no se pudo leer. */
  absenceReliability: number;
  clientRendered: boolean;
  whatsapp: boolean;
  booking: boolean;
  chat: boolean;
  /** Hay formulario de consulta (no solo suscripción). */
  contactForm: boolean;
  newsletter: boolean;
  phone: boolean;
  email: boolean;
  clickToCall: boolean;
  ctaCount: number;
  socialCount: number;
  tracking: boolean;
  crmTool: boolean;
  https: boolean;
  viewport: boolean;
  pageSpeedScore?: number;
  serverSlow: boolean;
  longForm: boolean;
  genericForm: boolean;
  reviewCount: number;
  rating?: number;
  sampleSize: number;
  unansweredInSample: number;
  knownReplyInSample: number;
  responsivenessComplaints: number;
  waitComplaints: number;
  negativeInSample: number;
  recentReviewsInSample: number;
}

export interface Facts {
  /** Evidencias por clave, en el orden en que se registraron. */
  evidence: Map<string, EvidenceDraft>;
  situation: Situation;
  /** Devuelve las evidencias existentes para esas claves (ignora las que no existen). */
  pick(...keys: string[]): EvidenceDraft[];
  has(key: string): boolean;
}

const RESPONSIVENESS_RE =
  /no (me |nos |te )?(contest|respond|atiend|devuelv)|nadie (me |nos )?(contest|respond|atiend)|sin respuesta|nunca (me |nos )?(contest|respond|atiend|devolv)|no hay (respuesta|manera de comunicarse)|ignor(an|aron|ado)|no (me )?llam(an|aron|ó)|tel[eé]fono (siempre )?(ocupado|apagado|no (atiende|contesta))|did(n't| not) (answer|respond|reply)|never (answer|respond|reply)|no one (answers|responds)/i;
const WAIT_RE = /demor|larga espera|mucha espera|esper(é|amos|amos|ar|aron) (mucho|horas|d[ií]as|semanas|m[aá]s de)|tard(an|aron|ó|aban) (mucho|d[ií]as|semanas|en (responder|contestar|dar|atender))|d[ií]as para (responder|contestar)|waited|long wait/i;

function ev(
  kind: EvidenceDraft["kind"],
  key: string,
  label: string,
  detail: string,
  extra: Partial<Pick<EvidenceDraft, "sourceUrl" | "excerpt">> = {},
): EvidenceDraft {
  return { kind, key, label, detail, ...extra };
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function trimQuote(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function buildFacts(input: FactsInput): Facts {
  const { company, signals, reviews } = input;
  const now = input.now ?? new Date();
  const evidence = new Map<string, EvidenceDraft>();
  const add = (e: EvidenceDraft) => evidence.set(e.key!, e);

  const hasWebsiteUrl = Boolean(company.website?.trim());
  const siteRead = Boolean(signals?.reachable);
  const clientRendered = Boolean(signals?.likelyClientRendered);
  const pagesRead = signals?.pagesVisited?.length ?? 0;
  const absenceReliability = !siteRead ? 0 : Math.min(0.9, (clientRendered ? 0.45 : 0.82) + (pagesRead > 1 ? 0.06 : 0));
  const site = signals?.finalUrl ?? signals?.url ?? company.website ?? undefined;

  /* ---------------- Ficha del negocio ---------------- */
  if (company.rating != null) {
    const n = company.reviewCount ?? 0;
    add(
      ev(
        "listing",
        "listing.rating",
        "Valoración pública",
        `Valoración media de ${company.rating.toFixed(1)}/5${n ? ` sobre ${n} reseñas` : ""} en la ficha pública del negocio.`,
      ),
    );
  }
  if (!hasWebsiteUrl) {
    add(
      ev(
        "absence",
        "listing.no_website",
        "Sin sitio web conocido",
        "La ficha del negocio no indica sitio web y no se encontró ninguno en las fuentes consultadas.",
      ),
    );
  }
  const listingChannels = [company.phone && "teléfono", company.email && "email", company.whatsapp && "WhatsApp"].filter(Boolean) as string[];
  if (listingChannels.length) {
    add(ev("listing", "listing.contact", "Canales de contacto conocidos", `La ficha incluye ${joinEs(listingChannels)}.`));
  }

  /* ---------------- Web ---------------- */
  let phone = Boolean(company.phone);
  let email = Boolean(company.email);
  let whatsapp = Boolean(company.whatsapp);
  let booking = false;
  let chat = false;
  let contactForm = false;
  let newsletter = false;
  let clickToCall = false;
  let ctaCount = 0;
  let tracking = false;
  let crmTool = false;
  let longForm = false;
  let genericForm = false;
  let serverSlow = false;

  const socialMap = new Map<string, SocialLink>();
  for (const s of signals?.social ?? []) socialMap.set(`${s.platform}|${s.url.toLowerCase()}`, s);
  for (const s of input.socialProfiles ?? []) socialMap.set(`${s.platform}|${s.url.toLowerCase()}`, s);
  const socialLinks = [...socialMap.values()];

  if (hasWebsiteUrl && signals && !signals.reachable) {
    add(
      ev(
        "website",
        "website.unreachable",
        "No se pudo acceder a la web",
        `Al intentar abrir ${signals.url} el análisis obtuvo: ${signals.fetchError ?? "error desconocido"}${signals.httpStatus ? ` (HTTP ${signals.httpStatus})` : ""}. Puede ser un fallo puntual o del entorno de análisis: conviene verificarlo manualmente.`,
        { sourceUrl: signals.url },
      ),
    );
  }

  if (signals?.reachable) {
    const mergedPhones = signals.contact?.phones ?? [];
    const mergedEmails = signals.contact?.emails ?? [];
    phone ||= mergedPhones.length > 0;
    email ||= mergedEmails.length > 0;
    clickToCall = Boolean(signals.contact?.hasClickToCall);
    const waLinks = signals.contact?.whatsappLinks ?? [];
    const waWidget = Boolean(signals.contact?.whatsappWidget);
    whatsapp ||= waLinks.length > 0 || waWidget;
    booking = Boolean(signals.booking?.detected);
    chat = Boolean(signals.chat?.detected);

    const forms = signals.forms?.items ?? [];
    const inquiryForms = forms.filter((f) => !f.isNewsletter);
    contactForm = inquiryForms.length > 0;
    newsletter = forms.some((f) => f.isNewsletter);
    longForm = inquiryForms.some((f) => (f.fieldCount ?? 0) >= 7 || (f.hasRequiredPhone === true && (f.fieldCount ?? 0) >= 5));
    const ownForms = inquiryForms.filter((f) => !f.vendor);
    genericForm = ownForms.length > 0 && ownForms.every((f) => !f.hasChoiceField);
    ctaCount = signals.ctas?.length ?? 0;
    tracking = (signals.tech?.analytics.length ?? 0) + (signals.tech?.pixels.length ?? 0) > 0;
    crmTool = (signals.tech?.crm?.length ?? 0) > 0;

    // Visión general de la propuesta
    const title = signals.title;
    const h1 = signals.h1?.[0];
    add(
      ev(
        "website",
        "website.overview",
        "Propuesta de la portada",
        [
          title ? `Título: «${trimQuote(title, 120)}».` : "La portada no tiene título.",
          h1 ? `Titular principal: «${trimQuote(h1, 140)}».` : "No tiene un titular H1 claro.",
          signals.metaDescription ? `Descripción: «${trimQuote(signals.metaDescription, 160)}».` : "Sin meta descripción.",
          signals.wordCount != null ? `Texto visible en portada: ~${signals.wordCount} palabras.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        { sourceUrl: site, excerpt: signals.textExcerpt?.slice(0, 280) },
      ),
    );
    if (signals.wordCount != null && signals.wordCount < 120 && !clientRendered) {
      add(ev("website", "website.thin_content", "Portada con muy poco contenido", `La portada muestra solo ~${signals.wordCount} palabras de texto, insuficiente para explicar servicios y generar confianza.`, { sourceUrl: site }));
    }
    if (!signals.title || !signals.metaDescription || !(signals.h1?.length)) {
      const missing = [!signals.title && "título", !signals.metaDescription && "meta descripción", !signals.h1?.length && "titular H1"].filter(Boolean) as string[];
      add(ev("website", "website.missing_meta", "Elementos básicos ausentes en la portada", `La portada no define ${joinEs(missing)}.`, { sourceUrl: site }));
    }

    // Técnico
    if (signals.https === false) {
      add(ev("website", "website.no_https", "La web no usa HTTPS", "La portada se sirve por http sin cifrar; los navegadores la marcan como «no segura», lo que resta confianza y puede frenar el envío de formularios.", { sourceUrl: site }));
    }
    if (signals.responseTimeMs != null && signals.responseTimeMs >= 1800) {
      serverSlow = signals.responseTimeMs >= 3000;
      add(ev("website", "website.slow_server", "Servidor lento en responder", `El servidor tardó ${signals.responseTimeMs} ms en empezar a responder (medido desde el equipo que ejecuta el análisis; puede variar según la red).`, { sourceUrl: site }));
    }
    if (signals.performance?.mobileScore != null) {
      const p = signals.performance;
      add(
        ev(
          "website",
          "website.pagespeed",
          "Rendimiento móvil (PageSpeed)",
          `Google PageSpeed puntúa la web con ${p.mobileScore}/100 en móvil${p.lcpMs ? `; el contenido principal tarda ~${(p.lcpMs / 1000).toFixed(1)} s en aparecer` : ""}${p.tbtMs ? ` y el bloqueo de interacción es de ${p.tbtMs} ms` : ""}.`,
          { sourceUrl: site },
        ),
      );
    }
    if (signals.mobile && !signals.mobile.viewportMeta) {
      add(ev("website", "website.no_viewport", "Sin configuración para móvil", "La página no declara la etiqueta viewport: en un teléfono se muestra como escritorio reducido, con texto ilegible y botones difíciles de pulsar.", { sourceUrl: site }));
    } else if (signals.mobile?.viewportMeta) {
      add(ev("website", "website.mobile_ready", "Preparada para móvil", `La web declara viewport adaptable${signals.mobile.responsiveHints.length ? ` (${signals.mobile.responsiveHints.join(", ")})` : ""}.`, { sourceUrl: site }));
    }
    const year = now.getFullYear();
    if (signals.copyrightYear && signals.copyrightYear <= year - 3) {
      add(ev("website", "website.outdated", "Aviso de copyright antiguo", `El pie de página indica © ${signals.copyrightYear}, lo que sugiere que la web no se actualiza desde hace ${year - signals.copyrightYear} años (o que el pie nunca se mantuvo).`, { sourceUrl: site }));
    }

    // WhatsApp
    if (waLinks.length || waWidget) {
      add(ev("website", "website.whatsapp", "WhatsApp disponible en la web", waLinks.length ? `La web enlaza a WhatsApp (${waLinks[0]}).` : "La web incluye un botón/widget flotante de WhatsApp.", { sourceUrl: waLinks[0] ?? site }));
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_whatsapp", "Sin WhatsApp visible en la web", `Se revisaron ${pagesRead || 1} página(s) de la web y no hay enlace ni botón de WhatsApp${company.whatsapp ? " (aunque la ficha sí indica un número)" : ""}.`, { sourceUrl: site }));
    }

    // Teléfono y email
    if (mergedPhones.length) {
      add(ev("website", "website.phone", "Teléfono en la web", `La web publica ${joinEs(mergedPhones.slice(0, 3))}${clickToCall ? " con enlace para llamar con un toque" : ""}.`, { sourceUrl: site }));
      if (!clickToCall && absenceReliability > 0) {
        add(ev("absence", "website.no_click_to_call", "Teléfono sin enlace de llamada", "El teléfono aparece como texto, sin enlace tel: para llamar con un toque desde el móvil.", { sourceUrl: site }));
      }
    } else if (absenceReliability > 0 && !company.phone) {
      add(ev("absence", "website.no_phone", "Sin teléfono visible", "No se encontró ningún teléfono ni en la web ni en la ficha del negocio.", { sourceUrl: site }));
    }
    if (mergedEmails.length) {
      add(ev("website", "website.email", "Email en la web", `La web publica ${joinEs(mergedEmails.slice(0, 3))}.`, { sourceUrl: site }));
    }

    // Reservas
    if (booking) {
      add(ev("website", "website.booking", "Sistema de reservas online", signals.booking?.vendor ? `La web integra ${signals.booking.vendor} para reservar.` : "La web enlaza a una página de reservas/turnos.", { sourceUrl: signals.booking?.urls[0] ?? site }));
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_booking", "Sin reservas online", `Se revisaron ${pagesRead || 1} página(s) y no se detectó agenda ni herramienta de reservas (Calendly, Doctoralia, Booksy, etc.).`, { sourceUrl: site }));
    }

    // Chat
    if (chat) {
      add(ev("website", "website.chat", "Chat en la web", `La web carga ${signals.chat?.vendor ?? "un widget de chat"}.`, { sourceUrl: site }));
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_chat", "Sin chat ni asistente", "No se detectó ningún widget de chat o asistente en el HTML de la web.", { sourceUrl: site }));
    }

    // Formularios
    if (contactForm) {
      const sample = inquiryForms[0]!;
      add(
        ev(
          "website",
          "website.form",
          "Formulario de contacto",
          `La web tiene ${inquiryForms.length} formulario(s) de consulta${sample.vendor ? ` (${sample.vendor})` : sample.fieldCount ? `; el principal pide ${sample.fieldCount} campos: ${sample.fields.slice(0, 8).join(", ")}` : ""}.`,
          { sourceUrl: sample.pageUrl ?? site },
        ),
      );
      if (longForm) {
        const f = inquiryForms.find((x) => (x.fieldCount ?? 0) >= 5)!;
        add(ev("website", "website.long_form", "Formulario largo", `Un formulario pide ${f.fieldCount} campos${f.hasRequiredPhone ? " e incluye teléfono obligatorio" : ""}; cada campo extra reduce la tasa de envío.`, { sourceUrl: f.pageUrl ?? site }));
      }
      if (genericForm) {
        add(ev("website", "website.generic_form", "Formulario sin cualificación", "El formulario solo recoge datos básicos (nombre, contacto, mensaje) sin preguntar servicio, urgencia o motivo, así que cada consulta llega sin priorizar.", { sourceUrl: site }));
      }
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_form", "Sin formulario de contacto", `Se revisaron ${pagesRead || 1} página(s) y no hay ningún formulario de consulta${newsletter ? " (solo suscripción por email)" : ""}.`, { sourceUrl: site }));
    }
    if (newsletter) add(ev("website", "website.newsletter", "Suscripción por email", "La web ofrece suscripción por email (base para seguimiento y reactivación).", { sourceUrl: site }));

    // CTAs
    if (ctaCount > 0) {
      const sample = (signals.ctas ?? []).slice(0, 6).map((c) => `«${c.text}»`);
      add(ev("website", "website.ctas", "Llamadas a la acción", `Se detectaron ${ctaCount} llamadas a la acción, por ejemplo ${joinEs(sample)}.`, { sourceUrl: site }));
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_cta", "Sin llamadas a la acción claras", "No se encontró ningún botón o enlace con una acción clara (reservar, llamar, pedir presupuesto, escribir por WhatsApp).", { sourceUrl: site }));
    }

    // Redes
    if (socialLinks.length) {
      add(ev("social", "website.social", "Redes sociales enlazadas", `Perfiles: ${joinEs(socialLinks.map((s) => s.platform))}.`, { sourceUrl: socialLinks[0]!.url }));
    } else if (absenceReliability > 0) {
      add(ev("absence", "website.no_social", "Sin redes sociales enlazadas", "La web no enlaza a ningún perfil de redes sociales ni se conocen perfiles por otras fuentes.", { sourceUrl: site }));
    }

    // Tecnología y seguimiento
    const tech = signals.tech;
    if (tech && (tech.cms || tech.analytics.length || tech.pixels.length || tech.crm?.length)) {
      add(
        ev(
          "website",
          "website.tech",
          "Tecnología detectada",
          [
            tech.cms && `Plataforma: ${tech.cms}.`,
            tech.analytics.length && `Analítica: ${tech.analytics.join(", ")}.`,
            tech.pixels.length && `Píxeles publicitarios: ${tech.pixels.join(", ")}.`,
            tech.crm?.length && `Herramientas de marketing/CRM: ${tech.crm.join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" "),
          { sourceUrl: site },
        ),
      );
    }
    if (!tracking && !crmTool && absenceReliability > 0) {
      add(ev("absence", "website.no_tracking", "Sin analítica ni seguimiento visibles", "No se detectó Google Analytics, Tag Manager, píxeles publicitarios ni herramientas de CRM/marketing en el código de la web.", { sourceUrl: site }));
    }
  }

  /* ---------------- Reseñas ---------------- */
  const sampleSize = reviews.length;
  const knownReply = reviews.filter((r) => r.ownerReplied != null);
  const unanswered = reviews.filter((r) => r.ownerReplied === false);
  const negative = reviews.filter((r) => r.rating != null && r.rating <= 2);
  const yearAgo = now.getTime() - 365 * 24 * 3600 * 1000;
  const recent = reviews.filter((r) => r.publishedAt && r.publishedAt.getTime() >= yearAgo).length;
  let responsivenessComplaints = 0;
  let waitComplaints = 0;
  for (const r of reviews) {
    const text = r.text ?? "";
    if (!text) continue;
    const isNegativeish = r.rating == null || r.rating <= 3;
    if (!isNegativeish) continue;
    const resp = RESPONSIVENESS_RE.test(text);
    const wait = WAIT_RE.test(text);
    if (!resp && !wait) continue;
    if (resp) responsivenessComplaints++;
    if (wait) waitComplaints++;
    add(
      ev(
        "review",
        `review.${r.id}`,
        `Reseña de ${r.rating != null ? `${r.rating} ★` : "cliente"}${r.author ? ` (${r.author})` : ""}`,
        resp ? "Un cliente se queja de falta de respuesta o de atención al contactar con el negocio." : "Un cliente se queja de esperas o demoras.",
        { excerpt: trimQuote(text), sourceUrl: undefined },
      ),
    );
  }
  if (knownReply.length > 0) {
    if (unanswered.length > 0) {
      add(
        ev(
          "review",
          "reviews.unanswered",
          "Reseñas sin respuesta del negocio",
          `De ${knownReply.length} reseñas de la muestra con estado de respuesta conocido, ${unanswered.length} no tienen respuesta del negocio${negative.filter((r) => r.ownerReplied === false).length ? ` (${negative.filter((r) => r.ownerReplied === false).length} de ellas negativas)` : ""}.`,
        ),
      );
    } else {
      add(ev("review", "reviews.replied", "El negocio responde reseñas", `Las ${knownReply.length} reseñas de la muestra con estado conocido tienen respuesta del negocio.`));
    }
  }
  if (negative.length > 0) {
    add(ev("review", "reviews.negative", "Reseñas negativas en la muestra", `${negative.length} de ${sampleSize} reseñas de la muestra puntúan 1–2 estrellas.`));
  }
  if (sampleSize > 0) {
    add(ev("review", "reviews.sample", "Muestra de reseñas analizada", `Se analizaron ${sampleSize} reseñas públicas (la fuente solo aporta una muestra, no todas).`));
  }

  const situation: Situation = {
    hasWebsiteUrl,
    siteRead,
    absenceReliability,
    clientRendered,
    whatsapp,
    booking,
    chat,
    contactForm,
    newsletter,
    phone,
    email,
    clickToCall,
    ctaCount,
    socialCount: socialLinks.length,
    tracking,
    crmTool,
    https: signals?.https !== false,
    viewport: signals?.mobile?.viewportMeta !== false,
    pageSpeedScore: signals?.performance?.mobileScore,
    serverSlow,
    longForm,
    genericForm,
    reviewCount: company.reviewCount ?? 0,
    rating: company.rating ?? undefined,
    sampleSize,
    unansweredInSample: unanswered.length,
    knownReplyInSample: knownReply.length,
    responsivenessComplaints,
    waitComplaints,
    negativeInSample: negative.length,
    recentReviewsInSample: recent,
  };

  return {
    evidence,
    situation,
    has: (key) => evidence.has(key),
    pick: (...keys) => keys.map((k) => evidence.get(k)).filter((e): e is EvidenceDraft => Boolean(e)),
  };
}

/** Claves de evidencias de reseñas individuales con quejas de respuesta/espera. */
export function complaintReviewKeys(facts: Facts): string[] {
  return [...facts.evidence.keys()].filter((k) => /^review\.\d+$/.test(k));
}
