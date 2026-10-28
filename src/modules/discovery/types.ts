/**
 * Contrato de descubrimiento. Cada fuente real implementa `DiscoveryProvider` y devuelve
 * negocios normalizados. El orquestador (service.ts) deduplica, persiste y registra procedencia.
 */

export type ProviderId = "google-places" | "openstreetmap" | (string & {});

export interface DiscoveryQuery {
  /** Tipo de negocio, texto libre: "clínicas dentales". */
  niche: string;
  /** Ciudad/ubicación, texto libre: "Salta, Argentina". */
  location: string;
  /** Número aproximado de empresas deseado. */
  limit: number;
  /** Idioma preferido para los resultados (ISO), por defecto "es". */
  language?: string;
}

export interface DiscoveredReview {
  author?: string;
  rating?: number;
  text?: string;
  language?: string;
  publishedAt?: Date;
  /** undefined = la fuente no lo informa. */
  ownerReplied?: boolean;
  ownerReplyText?: string;
}

export interface DiscoveredBusiness {
  provider: ProviderId;
  /** ID del negocio en la fuente (place_id, "node/123"…). */
  externalId: string;
  /** URL pública de la ficha en la fuente (para citar la procedencia). */
  sourceUrl?: string;

  name: string;
  category?: string;
  description?: string;

  address?: string;
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;

  phone?: string;
  email?: string;
  website?: string;
  whatsapp?: string;

  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  businessStatus?: string;
  openingHours?: string[];

  socialLinks?: { platform: string; url: string }[];
  reviews?: DiscoveredReview[];

  /** Respuesta cruda recortada, para auditoría. */
  raw?: unknown;
  fetchedAt: Date;
}

export interface ProviderAvailability {
  configured: boolean;
  /** Variables de entorno que faltan (vacío si está configurado). */
  missingEnv: string[];
  note?: string;
}

export interface ProviderContext {
  signal?: AbortSignal;
  log(message: string): void;
}

export interface DiscoveryProvider {
  id: ProviderId;
  label: string;
  description: string;
  /** Variables de entorno necesarias (para mostrar el bloqueo en Ajustes). */
  requiredEnv: string[];
  availability(): ProviderAvailability;
  /** Devuelve hasta `query.limit` negocios reales. Debe lanzar MissingCredentialError si falta la clave. */
  search(query: DiscoveryQuery, ctx: ProviderContext): Promise<DiscoveredBusiness[]>;
  /** Opcional: completa datos de un negocio ya descubierto (detalles, teléfono, horarios…). */
  enrich?(business: DiscoveredBusiness, ctx: ProviderContext): Promise<Partial<DiscoveredBusiness>>;
}
