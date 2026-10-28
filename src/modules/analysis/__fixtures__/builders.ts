import type { WebsiteSignals } from "../types";

type Company = typeof import("@/lib/db/schema").companies.$inferSelect;
type Review = typeof import("@/lib/db/schema").reviews.$inferSelect;

export function makeCompany(over: Partial<Company> = {}): Company {
  return {
    id: 1,
    name: "Clínica Dental Sonrisa",
    normalizedName: "clinica dental sonrisa",
    niche: "clínicas dentales",
    category: "Clínica dental",
    description: null,
    address: "Av. Belgrano 123",
    city: "Salta",
    region: "Salta",
    country: "Argentina",
    location: "Salta, Argentina",
    lat: null,
    lng: null,
    phone: "+54 387 422 1234",
    email: null,
    website: "https://clinicasonrisa.example",
    websiteDomain: "clinicasonrisa.example",
    whatsapp: null,
    rating: 4.6,
    reviewCount: 120,
    priceLevel: null,
    businessStatus: "OPERATIONAL",
    openingHours: null,
    googlePlaceId: null,
    osmId: null,
    analysisStatus: "pending",
    analysisError: null,
    score: null,
    scoreTier: null,
    opportunityCount: 0,
    topServiceKey: null,
    analyzedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

export function makeReview(over: Partial<Review> = {}): Review {
  return {
    id: 1,
    companyId: 1,
    source: "google-places",
    externalId: null,
    author: "Ana",
    rating: 5,
    text: "Excelente atención",
    language: "es",
    publishedAt: new Date("2026-09-01"),
    ownerReplied: null,
    ownerReplyText: null,
    createdAt: new Date("2026-10-01"),
    ...over,
  };
}

/** Señales de una web legible y con un perfil "básico": sin WhatsApp, reservas ni chat. */
export function basicSignals(over: Partial<WebsiteSignals> = {}): WebsiteSignals {
  return {
    url: "https://clinicasonrisa.example/",
    finalUrl: "https://clinicasonrisa.example/",
    fetchedAt: new Date("2026-10-28"),
    reachable: true,
    httpStatus: 200,
    https: true,
    responseTimeMs: 400,
    title: "Clínica Dental Sonrisa",
    metaDescription: "Odontología en Salta",
    h1: ["Tu sonrisa"],
    wordCount: 320,
    likelyClientRendered: false,
    mobile: { viewportMeta: true, responsiveHints: ["viewport device-width"] },
    contact: { phones: ["+54 387 422 1234"], emails: [], whatsappLinks: [], hasClickToCall: true, hasContactPage: true },
    forms: { count: 1, items: [{ fields: ["nombre", "email", "mensaje"], fieldCount: 3, hasChoiceField: false, pageUrl: "https://clinicasonrisa.example/contacto" }] },
    booking: { detected: false, urls: [] },
    chat: { detected: false },
    ctas: [{ text: "Contactanos", kind: "form" }],
    social: [{ platform: "instagram", url: "https://instagram.com/sonrisa" }],
    tech: { analytics: ["Google Analytics"], pixels: [], crm: [] },
    pagesVisited: ["https://clinicasonrisa.example/", "https://clinicasonrisa.example/contacto"],
    ...over,
  };
}
