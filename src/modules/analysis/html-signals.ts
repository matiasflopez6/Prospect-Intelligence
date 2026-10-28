import * as cheerio from "cheerio";
import type { WebsiteSignals } from "./types";

/**
 * Extracción determinista de señales de UNA página HTML. Sin red, sin LLM: dado el mismo HTML
 * devuelve lo mismo. El analizador combina varias páginas con `mergePageSignals`.
 */

export interface PageSignals {
  url: string;
  title?: string;
  metaDescription?: string;
  h1: string[];
  lang?: string;
  text: string;
  wordCount: number;
  copyrightYear?: number;
  likelyClientRendered: boolean;
  viewportMeta: boolean;
  viewportContent?: string;
  responsiveHints: string[];
  phones: string[];
  emails: string[];
  whatsappLinks: string[];
  whatsappWidget: boolean;
  hasClickToCall: boolean;
  forms: NonNullable<WebsiteSignals["forms"]>["items"];
  bookingVendor?: string;
  bookingUrls: string[];
  chatVendor?: string;
  ctas: NonNullable<WebsiteSignals["ctas"]>;
  social: { platform: string; url: string }[];
  tech: { cms?: string; analytics: string[]; pixels: string[]; crm: string[] };
  /** Enlaces internos relevantes para seguir (contacto, reservas). */
  followLinks: { url: string; kind: "contact" | "booking" }[];
  isContactPage: boolean;
}

const BOOKING_VENDORS: [string, RegExp][] = [
  ["Calendly", /calendly\.com/i],
  ["Doctoralia", /doctoralia\./i],
  ["Reservio", /reservio\.com/i],
  ["Setmore", /setmore\.com/i],
  ["SimplyBook.me", /simplybook\.(me|it)/i],
  ["Acuity", /acuityscheduling\.com|as\.me\//i],
  ["Booksy", /booksy\.com/i],
  ["Fresha", /fresha\.com/i],
  ["Mindbody", /mindbodyonline\.com|mindbody\.io/i],
  ["OpenTable", /opentable\./i],
  ["TheFork", /thefork\.|eltenedor\./i],
  ["Resy", /resy\.com/i],
  ["Cal.com", /cal\.com\//i],
  ["AgendaPro", /agendapro\./i],
  ["Square Appointments", /squareup\.com\/appointments|square\.site\/.*book/i],
  ["Google Calendar", /calendar\.google\.com\/(calendar\/)?(appointments|u\/\d\/appointments)/i],
  ["Zoho Bookings", /zohobookings\.|bookings\.zoho\./i],
  ["HubSpot Meetings", /meetings\.hubspot\.com/i],
  ["TidyCal", /tidycal\.com/i],
  ["YouCanBook.me", /youcanbook\.me/i],
  ["Treatwell", /treatwell\./i],
  ["Cliniko", /cliniko\.com/i],
  ["Jane App", /janeapp\.com/i],
  ["Zenoti", /zenoti\.com/i],
  ["Wix Bookings", /wix-bookings|bookings\.wixapps/i],
  ["Amelia (WordPress)", /ameliabooking|amelia-booking/i],
  ["Bookly (WordPress)", /bookly-form|bookly\.js|booking-?ly/i],
  ["Easy Appointments (WordPress)", /ea-bootstrap|easy-?appointments/i],
  ["Reservas Online", /reservandonos\.|turnos?online\.|turnoslibres\.|turnos\.(plus|app)/i],
];

const CHAT_VENDORS: [string, RegExp][] = [
  ["Tawk.to", /tawk\.to/i],
  ["Intercom", /widget\.intercom\.io|intercomcdn/i],
  ["Drift", /js\.driftt\.com|drift\.com/i],
  ["Crisp", /client\.crisp\.chat|crisp\.chat/i],
  ["LiveChat", /cdn\.livechatinc\.com|livechatinc\.com/i],
  ["Zendesk Chat", /static\.zdassets\.com|v2\.zopim\.com|zopim/i],
  ["HubSpot Chat", /js\.usemessages\.com|hs-conversations/i],
  ["Tidio", /code\.tidio\.co|tidiochat/i],
  ["JivoChat", /jivosite\.com|code\.jivo/i],
  ["Freshchat", /wchat\.freshchat\.com|freshchat/i],
  ["Olark", /static\.olark\.com/i],
  ["Smartsupp", /smartsuppchat|smartsupp\.com/i],
  ["Userlike", /userlike\.com/i],
  ["Landbot", /landbot\.(io|online)/i],
  ["Botpress", /botpress\./i],
  ["Chatwoot", /chatwoot/i],
  ["ManyChat", /manychat\.com/i],
  ["Botmaker", /botmaker\./i],
  ["Zoho SalesIQ", /salesiq\.zoho|zohopublic\.com\/.*salesiq/i],
  ["Messenger (Facebook)", /fb-customerchat|customerchat\.js|m\.me\//i],
  ["Chatbot genérico", /id=["']?(chatbot|chat-widget|chat-bot)\b|class=["'][^"']*(chatbot|chat-widget|livechat)/i],
];

const WHATSAPP_WIDGET = /joinchat|wa-chat-box|whatshelp|getbutton\.io|elfsight[^"']*whatsapp|wa-widget|whatsapp-chat|click-to-chat|wapp-button|ctc_|chaty/i;

const CMS: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes|wp-json/i],
  ["Wix", /static\.wixstatic\.com|wix\.com\/|_wixCIDX|wix-bookings/i],
  ["Squarespace", /squarespace\.com|static1\.squarespace/i],
  ["Shopify", /cdn\.shopify\.com|myshopify\.com/i],
  ["Webflow", /data-wf-(page|site)|webflow\.com/i],
  ["Jimdo", /jimdo(free|site)?\.com|jimdocdn/i],
  ["GoDaddy Website Builder", /img1\.wsimg\.com|websitebuilder\.godaddy/i],
  ["Tiendanube", /tiendanube\.com|nuvemshop/i],
  ["Joomla", /\/media\/jui\/|joomla/i],
  ["Drupal", /drupal\.settings|sites\/default\/files/i],
  ["Odoo", /odoo/i],
  ["PrestaShop", /prestashop/i],
];

const ANALYTICS: [string, RegExp][] = [
  ["Google Analytics", /googletagmanager\.com\/gtag\/js\?id=(G|UA)-|google-analytics\.com\/(analytics|ga)\.js|gtag\(['"]config['"],\s*['"](G|UA)-/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i],
  ["Hotjar", /static\.hotjar\.com/i],
  ["Microsoft Clarity", /clarity\.ms/i],
  ["Plausible", /plausible\.io/i],
  ["Matomo", /matomo|piwik/i],
];

const PIXELS: [string, RegExp][] = [
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(['"]init/i],
  ["TikTok Pixel", /analytics\.tiktok\.com/i],
  ["LinkedIn Insight", /snap\.licdn\.com/i],
  ["Google Ads", /AW-\d{6,}/],
];

const CRM_TOOLS: [string, RegExp][] = [
  ["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net|hbspt\.forms/i],
  ["Zoho", /zohopublic|zoho\.com\/crm|zf_|zohoforms/i],
  ["ActiveCampaign", /activehosted\.com|trackcmp\.net/i],
  ["Pipedrive", /pipedrive\.com|leadbooster/i],
  ["Salesforce / Pardot", /pardot\.com|salesforce\.com|force\.com/i],
  ["Mailchimp", /chimpstatic\.com|list-manage\.com|mailchimp\.com/i],
  ["Brevo (Sendinblue)", /sibautomation|sendinblue\.com|brevo\.com/i],
  ["Klaviyo", /klaviyo\.com/i],
  ["GetResponse", /getresponse\.com/i],
  ["Kommo / amoCRM", /kommo\.com|amocrm\./i],
];

const FORM_VENDORS: [string, RegExp][] = [
  ["Typeform", /typeform\.com/i],
  ["Jotform", /jotform\.(com|me)/i],
  ["Google Forms", /docs\.google\.com\/forms|forms\.gle/i],
  ["HubSpot Forms", /hsforms|hbspt/i],
  ["Tally", /tally\.so/i],
  ["Zoho Forms", /zohopublic\.com|forms\.zoho/i],
  ["Microsoft Forms", /forms\.office\.com|forms\.microsoft\.com/i],
  ["Formspree", /formspree\.io/i],
];

const SOCIAL: [string, RegExp][] = [
  ["facebook", /^(?:https?:)?\/\/(?:[\w-]+\.)?facebook\.com\//i],
  ["instagram", /^(?:https?:)?\/\/(?:[\w-]+\.)?instagram\.com\//i],
  ["linkedin", /^(?:https?:)?\/\/(?:[\w-]+\.)?linkedin\.com\/(company|in|school)\//i],
  ["x", /^(?:https?:)?\/\/(?:[\w-]+\.)?(twitter|x)\.com\//i],
  ["youtube", /^(?:https?:)?\/\/(?:[\w-]+\.)?youtube\.com\/(@|channel|c|user)/i],
  ["tiktok", /^(?:https?:)?\/\/(?:[\w-]+\.)?tiktok\.com\/@/i],
  ["pinterest", /^(?:https?:)?\/\/(?:[\w-]+\.)?pinterest\.[a-z.]+\//i],
  ["threads", /^(?:https?:)?\/\/(?:[\w-]+\.)?threads\.net\/@/i],
  ["telegram", /^(?:https?:)?\/\/t\.me\//i],
];
const SOCIAL_NOISE = /sharer|share\?|\/share|intent\/|dialog\/|plugins\/|tr\?id=|\/p\/|\/reel\/|\/posts\/|\/watch\?|login|\/hashtag\/|facebook\.com\/?$/i;

const CTA_PATTERNS: { kind: NonNullable<WebsiteSignals["ctas"]>[number]["kind"]; re: RegExp }[] = [
  { kind: "whatsapp", re: /whatsapp|escr[ií]benos por wsp|wsp/i },
  { kind: "booking", re: /reserv|agend|pedir (un )?turno|sacar turno|solicit(a|ar|e) (un |tu )?(turno|cita)|pide (tu )?cita|cita previa|book(ing)?\b|appointment|turno online|pide hora|reserva tu/i },
  { kind: "call", re: /llam(a|á|ar|anos|e)|call us|tel[eé]fono|contact(a|á)nos por tel/i },
  { kind: "form", re: /contact(a|o|ar|anos|ános|us)|cotiz|presupuesto|consulta|solicit(a|ar|ud)|pide|quiero|empez|comienz|get started|request|free quote|env[ií]a(nos)? (un )?mensaje|escr[ií]benos/i },
];

const PHONE_RE = /(?:\+|00)?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function resolve(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function normalizePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return undefined;
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])/.test(digits) && digits.length <= 8) return undefined; // fecha
  return clean(raw).replace(/^tel:/i, "");
}

function matchVendor(table: [string, RegExp][], haystack: string): string | undefined {
  return table.find(([, re]) => re.test(haystack))?.[0];
}

function matchAll(table: [string, RegExp][], haystack: string): string[] {
  return table.filter(([, re]) => re.test(haystack)).map(([name]) => name);
}

export function extractPageSignals(html: string, pageUrl: string): PageSignals {
  const $ = cheerio.load(html);
  const rawHtml = html;

  // Texto visible (sin scripts/estilos).
  const $body = $("body").clone();
  $body.find("script, style, noscript, template, svg").remove();
  const text = clean($body.text());
  const wordCount = text ? text.split(" ").length : 0;
  const scriptCount = $("script").length;
  const rootEmpty = ["#root", "#app", "#__next", "#__nuxt", "app-root"].some((sel) => {
    const el = $(sel).first();
    return el.length > 0 && clean(el.text()).length < 40;
  });
  const likelyClientRendered = rootEmpty || (wordCount < 60 && scriptCount >= 5);

  const anchors = $("a[href]")
    .toArray()
    .map((el) => {
      const $el = $(el);
      return {
        href: $el.attr("href")!.trim(),
        text: clean($el.text()) || clean($el.attr("aria-label")) || clean($el.attr("title")),
        cls: $el.attr("class") ?? "",
      };
    });
  const buttons = $("button, input[type=button], input[type=submit], [role=button]")
    .toArray()
    .map((el) => ({ text: clean($(el).text()) || clean($(el).attr("value")) || clean($(el).attr("aria-label")) }));

  // Contacto
  const phones = new Set<string>();
  const emails = new Set<string>();
  const whatsappLinks = new Set<string>();
  let hasClickToCall = false;
  for (const a of anchors) {
    if (/^tel:/i.test(a.href)) {
      hasClickToCall = true;
      const p = normalizePhone(decodeURIComponent(a.href.slice(4)));
      if (p) phones.add(p);
    } else if (/^mailto:/i.test(a.href)) {
      const e = a.href.slice(7).split("?")[0]!.trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) emails.add(e);
    } else if (/(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com\/send|chat\.whatsapp\.com)|^whatsapp:/i.test(a.href)) {
      whatsappLinks.add(resolve(a.href, pageUrl) ?? a.href);
    }
  }
  for (const m of text.match(EMAIL_RE) ?? []) {
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(m)) emails.add(m.toLowerCase());
  }
  for (const m of text.match(PHONE_RE) ?? []) {
    const p = normalizePhone(m);
    if (p && (/[+(]/.test(p) || p.replace(/\D/g, "").length >= 9)) phones.add(p);
    if (phones.size >= 6) break;
  }
  const whatsappWidget = whatsappLinks.size === 0 && WHATSAPP_WIDGET.test(rawHtml);

  // Formularios
  const forms: PageSignals["forms"] = [];
  $("form").each((_, formEl) => {
    const $f = $(formEl);
    const role = ($f.attr("role") ?? "").toLowerCase();
    const hasSearch = $f.find("input[type=search]").length > 0 || role === "search" || /search|buscar/i.test($f.attr("class") ?? "") || /search|buscar/i.test($f.attr("id") ?? "");
    if (hasSearch) return;
    const fields: string[] = [];
    let hasChoice = false;
    let requiredPhone = false;
    let hasEmail = false;
    $f.find("input, textarea, select").each((__, el) => {
      const $el = $(el);
      const tag = el.tagName.toLowerCase();
      const type = ($el.attr("type") ?? (tag === "input" ? "text" : tag)).toLowerCase();
      // Los checkbox son casi siempre consentimientos: no cuentan como campo ni como cualificación.
      if (tag === "input" && ["hidden", "submit", "button", "image", "reset", "checkbox"].includes(type)) return;
      const name = clean($el.attr("name") || $el.attr("id") || $el.attr("placeholder") || $el.attr("aria-label") || type);
      fields.push(name);
      if (tag === "select" || type === "radio") hasChoice = true;
      if (type === "tel" && ($el.attr("required") != null || $el.attr("aria-required") === "true")) requiredPhone = true;
      if (type === "email") hasEmail = true;
    });
    if (fields.length === 0) return;
    const isNewsletter = fields.length === 1 && hasEmail;
    forms.push({
      action: resolve($f.attr("action"), pageUrl),
      fields,
      fieldCount: fields.length,
      hasChoiceField: hasChoice,
      hasRequiredPhone: requiredPhone,
      isNewsletter,
      pageUrl,
    });
  });
  // Formularios incrustados de terceros (iframes y scripts)
  $("iframe[src], iframe[data-src]").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
    const vendor = matchVendor(FORM_VENDORS, src);
    if (vendor) forms.push({ fields: [], fieldCount: undefined, vendor, pageUrl, action: resolve(src, pageUrl) });
  });
  // Plugins de formulario renderizados por script (CF7/Elementor suelen ir como <form>, pero HubSpot/Typeform no)
  if (forms.length === 0) {
    const vendor = matchVendor(FORM_VENDORS, rawHtml.match(/<script[^>]*src=["'][^"']*["']/gi)?.join(" ") ?? "");
    if (vendor && /hbspt\.forms\.create|typeform-widget|data-tf-/i.test(rawHtml)) forms.push({ fields: [], vendor, pageUrl });
  }

  // Reservas
  const bookingUrls = new Set<string>();
  const iframeAndLinkSources = [
    ...anchors.map((a) => a.href),
    ...$("iframe[src], iframe[data-src], script[src]").toArray().map((el) => $(el).attr("src") ?? $(el).attr("data-src") ?? ""),
  ];
  let bookingVendor: string | undefined;
  for (const src of iframeAndLinkSources) {
    const v = matchVendor(BOOKING_VENDORS, src);
    if (v) {
      bookingVendor ??= v;
      const abs = resolve(src, pageUrl);
      if (abs && !/\.js(\?|$)/.test(abs)) bookingUrls.add(abs);
    }
  }
  if (!bookingVendor) {
    // Plugins de WordPress que se identifican por clases/ids, no por dominio externo.
    const v = matchVendor(BOOKING_VENDORS.filter(([n]) => /WordPress|Wix|Zenoti|Reservas/.test(n)), rawHtml);
    if (v) bookingVendor = v;
  }

  // Chat
  const chatHaystack = [
    ...$("script[src], iframe[src]").toArray().map((el) => $(el).attr("src") ?? ""),
    $("script:not([src])").toArray().map((el) => $(el).html() ?? "").join(" ").slice(0, 200_000),
    $("body").attr("class") ?? "",
    $("[id]").toArray().slice(0, 600).map((el) => $(el).attr("id")).join(" "),
  ].join(" ");
  const chatVendor = matchVendor(CHAT_VENDORS, chatHaystack);

  // CTAs
  const ctas: PageSignals["ctas"] = [];
  const seenCta = new Set<string>();
  const pushCta = (textRaw: string, href: string | undefined) => {
    const t = clean(textRaw).slice(0, 80);
    if (!t || t.length < 3) return;
    let kind: PageSignals["ctas"][number]["kind"] | undefined;
    if (href && /^tel:/i.test(href)) kind = "call";
    else if (href && /wa\.me|api\.whatsapp\.com|^whatsapp:/i.test(href)) kind = "whatsapp";
    else if (href && matchVendor(BOOKING_VENDORS, href)) kind = "booking";
    else kind = CTA_PATTERNS.find((p) => p.re.test(t))?.kind;
    if (!kind) return;
    const key = `${kind}|${t.toLowerCase()}`;
    if (seenCta.has(key)) return;
    seenCta.add(key);
    ctas.push({ text: t, href: href ? resolve(href, pageUrl) ?? href : undefined, kind });
  };
  for (const a of anchors) {
    if (a.text.length > 60) continue; // frases, no botones
    pushCta(a.text, a.href);
    if (!a.text && /^tel:/i.test(a.href)) pushCta("Llamar", a.href);
    if (!a.text && /wa\.me|api\.whatsapp\.com/i.test(a.href)) pushCta("WhatsApp", a.href);
  }
  for (const b of buttons) pushCta(b.text, undefined);

  // Redes sociales
  const social: PageSignals["social"] = [];
  const seenSocial = new Set<string>();
  for (const a of anchors) {
    const abs = resolve(a.href, pageUrl);
    if (!abs) continue;
    const hit = SOCIAL.find(([, re]) => re.test(abs));
    if (!hit || SOCIAL_NOISE.test(abs)) continue;
    const key = `${hit[0]}|${abs.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase()}`;
    if (seenSocial.has(key)) continue;
    seenSocial.add(key);
    social.push({ platform: hit[0], url: abs.replace(/[?#].*$/, "") });
  }

  // Tecnología
  const generator = $("meta[name=generator]").attr("content");
  const cmsFromMeta = generator ? clean(generator).split(/[\s,]/)[0] : undefined;
  const cms = matchVendor(CMS, rawHtml) ?? cmsFromMeta;
  const techHaystack = `${rawHtml.slice(0, 600_000)}`;

  // Enlaces a seguir
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "";
    }
  })();
  const followLinks: PageSignals["followLinks"] = [];
  for (const a of anchors) {
    const abs = resolve(a.href, pageUrl);
    if (!abs || !abs.startsWith(origin) || /\.(pdf|jpe?g|png|zip|docx?)$/i.test(abs)) continue;
    const path = abs.replace(origin, "").toLowerCase();
    const label = a.text.toLowerCase();
    if (/(^|\/)(contact|contacto|contactanos|contáctanos|contact-us|contactenos|escribenos)(\/|\.|$|-)/.test(path) || /^contact(o|a|us)/.test(label)) {
      followLinks.push({ url: abs.replace(/#.*$/, ""), kind: "contact" });
    } else if (/(reserva|booking|turno|cita|appointment|agenda)/.test(path) || /^(reserv|turnos?|pedir|agendar|solicitar cita)/.test(label)) {
      followLinks.push({ url: abs.replace(/#.*$/, ""), kind: "booking" });
    }
  }

  // Móvil
  const viewportContent = $("meta[name=viewport]").attr("content");
  const hints: string[] = [];
  if (viewportContent && /width\s*=\s*device-width/i.test(viewportContent)) hints.push("viewport device-width");
  if ($("[srcset], picture").length) hints.push("imágenes adaptables (srcset/picture)");
  if (/@media[^{]*(max|min)-width/i.test($("style").text())) hints.push("media queries en CSS inline");
  if (/elementor|et_pb_|wp-block-|bootstrap|tailwind|col-(xs|sm|md|lg)-|flex-wrap/i.test(rawHtml)) hints.push("framework/maquetación responsive");

  // Copyright
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2}|19\d{2})/gi)].map((m) => Number(m[1]));
  const copyrightYear = years.length ? Math.max(...years) : undefined;

  const isContactPage = /(^|\/)(contact|contacto|contactanos|contact-us)(\/|\.|$)/i.test(pageUrl.replace(origin, ""));

  return {
    url: pageUrl,
    title: clean($("title").first().text()) || undefined,
    metaDescription: clean($("meta[name=description]").attr("content")) || undefined,
    h1: $("h1").toArray().map((el) => clean($(el).text())).filter(Boolean).slice(0, 5),
    lang: clean($("html").attr("lang")) || undefined,
    text,
    wordCount,
    copyrightYear,
    likelyClientRendered,
    viewportMeta: Boolean(viewportContent),
    viewportContent,
    responsiveHints: hints,
    phones: [...phones].slice(0, 6),
    emails: [...emails].slice(0, 6),
    whatsappLinks: [...whatsappLinks].slice(0, 4),
    whatsappWidget,
    hasClickToCall,
    forms,
    bookingVendor,
    bookingUrls: [...bookingUrls].slice(0, 4),
    chatVendor,
    ctas: ctas.slice(0, 25),
    social,
    tech: {
      cms,
      analytics: matchAll(ANALYTICS, techHaystack),
      pixels: matchAll(PIXELS, techHaystack),
      crm: matchAll(CRM_TOOLS, techHaystack),
    },
    followLinks,
    isContactPage,
  };
}
