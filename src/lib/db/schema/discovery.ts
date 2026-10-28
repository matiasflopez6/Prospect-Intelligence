import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, ts, updatedAt } from "./_helpers";

/** Una ejecución de búsqueda: nicho + ubicación + cantidad objetivo. */
export const searches = sqliteTable(
  "searches",
  {
    id: id(),
    niche: text("niche").notNull(),
    location: text("location").notNull(),
    targetCount: integer("target_count").notNull(),
    /** Proveedores solicitados; null = todos los configurados. */
    providers: text("providers", { mode: "json" }).$type<string[] | null>(),
    status: text("status", {
      enum: ["queued", "running", "completed", "partial", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    foundCount: integer("found_count").notNull().default(0),
    analyzedCount: integer("analyzed_count").notNull().default(0),
    /** Si se analiza automáticamente cada empresa descubierta. */
    autoAnalyze: integer("auto_analyze", { mode: "boolean" }).notNull().default(true),
    error: text("error"),
    /** Estado por proveedor: { "google-places": { status, found, error? } } */
    providerResults: text("provider_results", { mode: "json" }).$type<
      Record<string, { status: string; found: number; error?: string }>
    >(),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("searches_created_idx").on(t.createdAt)],
);

/** Una empresa real. Se deduplica por (placeId) o (dominio web) o (nombre+dirección). */
export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    /** Nicho de la búsqueda que la encontró (texto libre del usuario). */
    niche: text("niche"),
    category: text("category"),
    description: text("description"),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    /** Ubicación de la búsqueda que la encontró (para filtrar). */
    location: text("location"),
    lat: real("lat"),
    lng: real("lng"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    websiteDomain: text("website_domain"),
    whatsapp: text("whatsapp"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    priceLevel: integer("price_level"),
    businessStatus: text("business_status"),
    /** Horarios tal como los publica la fuente. */
    openingHours: text("opening_hours", { mode: "json" }).$type<string[] | Record<string, unknown> | null>(),
    /** Identificadores externos para deduplicar. */
    googlePlaceId: text("google_place_id"),
    osmId: text("osm_id"),

    /** Estado del análisis de esta empresa. */
    analysisStatus: text("analysis_status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    analysisError: text("analysis_error"),

    /** --- Resumen desnormalizado (lo escribe el motor de scoring; se usa para filtrar/ordenar) --- */
    score: integer("score"), // 0–100, null = sin analizar
    scoreTier: text("score_tier", { enum: ["high", "medium", "low"] }),
    opportunityCount: integer("opportunity_count").notNull().default(0),
    topServiceKey: text("top_service_key"),
    analyzedAt: ts("analyzed_at"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("companies_place_id_uq").on(t.googlePlaceId),
    uniqueIndex("companies_osm_id_uq").on(t.osmId),
    index("companies_domain_idx").on(t.websiteDomain),
    index("companies_name_idx").on(t.normalizedName),
    index("companies_score_idx").on(t.score),
    index("companies_niche_idx").on(t.niche),
    index("companies_location_idx").on(t.location),
  ],
);

/** Qué empresas devolvió cada búsqueda (una empresa puede aparecer en varias). */
export const searchCompanies = sqliteTable(
  "search_companies",
  {
    searchId: integer("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    rank: integer("rank"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.companyId] })],
);

/** Procedencia: qué proveedor aportó datos de una empresa y cuándo. */
export const companySources = sqliteTable(
  "company_sources",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google-places", "openstreetmap", "website", …
    externalId: text("external_id"),
    url: text("url"),
    /** Campos que este proveedor aportó, p. ej. ["phone","rating"]. */
    fields: text("fields", { mode: "json" }).$type<string[]>(),
    /** Respuesta cruda (recortada) para auditoría. */
    raw: text("raw", { mode: "json" }),
    fetchedAt: ts("fetched_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("company_sources_company_idx").on(t.companyId)],
);

export const socialProfiles = sqliteTable(
  "social_profiles",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // instagram, facebook, linkedin, x, youtube, tiktok…
    url: text("url").notNull(),
    handle: text("handle"),
    followers: integer("followers"),
    /** De dónde sale el enlace: "website" (enlazado en la web) | proveedor. */
    foundVia: text("found_via"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("social_company_url_uq").on(t.companyId, t.url)],
);

/** Reseñas individuales disponibles públicamente (muestra, no la totalidad). */
export const reviews = sqliteTable(
  "reviews",
  {
    id: id(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "google-places", …
    externalId: text("external_id"),
    author: text("author"),
    rating: real("rating"),
    text: text("text"),
    language: text("language"),
    publishedAt: ts("published_at"),
    /** null = la fuente no informa si hubo respuesta. */
    ownerReplied: integer("owner_replied", { mode: "boolean" }),
    ownerReplyText: text("owner_reply_text"),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_company_idx").on(t.companyId)],
);
