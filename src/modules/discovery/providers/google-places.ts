import { getEnv } from "@/lib/config/env";
import { MissingCredentialError, ProviderError } from "@/lib/errors";
import { RateLimiter, requestJson, type FetchLike } from "../lib/http";
import type { DiscoveredBusiness, DiscoveredReview, DiscoveryProvider, DiscoveryQuery, ProviderContext } from "../types";

/**
 * Google Places API (New) — Text Search.
 * Variable: GOOGLE_PLACES_API_KEY (habilita "Places API (New)" en Google Cloud).
 *
 * Una sola petición de Text Search devuelve ya teléfono, web, valoración, nº de reseñas, horarios y hasta
 * 5 reseñas por negocio, así que no hace falta Place Details. Los campos pedidos (websiteUri, teléfono,
 * rating, horarios, reviews) facturan con el SKU "Text Search Enterprise + Atmosphere" por petición
 * (20 resultados/página). La API no informa si el dueño respondió una reseña: ownerReplied queda sin definir.
 */

const PROVIDER = "google-places";
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PAGE_SIZE = 20; // máximo de Text Search
const MAX_PAGES = 3; // Google no devuelve más de 60 resultados por consulta

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.editorialSummary",
  "places.reviews",
  "nextPageToken",
].join(",");

interface LocalizedText {
  text?: string;
  languageCode?: string;
}

interface GooglePlace {
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  primaryTypeDisplayName?: LocalizedText;
  types?: string[];
  businessStatus?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  editorialSummary?: LocalizedText;
  reviews?: {
    authorAttribution?: { displayName?: string };
    rating?: number;
    text?: LocalizedText;
    originalText?: LocalizedText;
    publishTime?: string;
  }[];
}

interface SearchTextResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export interface GooglePlacesDeps {
  fetchImpl?: FetchLike;
  apiKey?: () => string | undefined;
  limiter?: RateLimiter;
  retries?: number;
  backoffMs?: number;
}

export function createGooglePlacesProvider(deps: GooglePlacesDeps = {}): DiscoveryProvider {
  const apiKey = deps.apiKey ?? (() => getEnv().GOOGLE_PLACES_API_KEY);
  const limiter = deps.limiter ?? new RateLimiter(250);

  return {
    id: PROVIDER,
    label: "Google Places",
    description: "Negocios con teléfono, web, valoración, reseñas y horarios. Requiere clave de API.",
    requiredEnv: ["GOOGLE_PLACES_API_KEY"],
    availability() {
      const ok = Boolean(apiKey());
      return { configured: ok, missingEnv: ok ? [] : ["GOOGLE_PLACES_API_KEY"] };
    },
    async search(query: DiscoveryQuery, ctx: ProviderContext): Promise<DiscoveredBusiness[]> {
      const key = apiKey();
      if (!key) throw new MissingCredentialError("Google Places", ["GOOGLE_PLACES_API_KEY"]);

      const textQuery = `${query.niche} en ${query.location}`;
      const wanted = Math.max(query.limit, 1);
      const out: DiscoveredBusiness[] = [];
      let pageToken: string | undefined;

      for (let page = 0; page < MAX_PAGES && out.length < wanted; page++) {
        const body: Record<string, unknown> = {
          textQuery,
          languageCode: query.language ?? "es",
          pageSize: PAGE_SIZE,
        };
        if (pageToken) body.pageToken = pageToken;
        const res = await requestJson<SearchTextResponse>(
          ENDPOINT,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
            body: JSON.stringify(body),
          },
          { provider: PROVIDER, fetchImpl: deps.fetchImpl, limiter, signal: ctx.signal, retries: deps.retries, backoffMs: deps.backoffMs },
        ).catch((e) => {
          if (e instanceof ProviderError && (e.status === 400 || e.status === 403)) {
            throw new ProviderError(
              PROVIDER,
              `${e.message.replace(/^\[google-places\] /, "")} — revisa que la clave sea válida y que "Places API (New)" esté habilitada con facturación`,
              e.status,
            );
          }
          throw e;
        });
        const fetchedAt = new Date();
        for (const p of res.places ?? []) {
          const b = toBusiness(p, fetchedAt);
          if (b) out.push(b);
        }
        ctx.log(`Google Places página ${page + 1}: ${res.places?.length ?? 0} resultados`);
        pageToken = res.nextPageToken;
        if (!pageToken) break;
      }
      return out.slice(0, wanted);
    },
  };
}

function component(p: GooglePlace, ...types: string[]): string | undefined {
  return p.addressComponents?.find((c) => types.some((t) => c.types?.includes(t)))?.longText;
}

export function toBusiness(p: GooglePlace, fetchedAt: Date): DiscoveredBusiness | null {
  const name = p.displayName?.text?.trim();
  if (!p.id || !name) return null;
  const reviews: DiscoveredReview[] | undefined = p.reviews?.map((r) => {
    const text = r.originalText ?? r.text;
    return {
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      text: text?.text,
      language: text?.languageCode,
      publishedAt: r.publishTime ? new Date(r.publishTime) : undefined,
    };
  });
  return {
    provider: PROVIDER,
    externalId: p.id,
    sourceUrl: p.googleMapsUri,
    name,
    category: p.primaryTypeDisplayName?.text,
    description: p.editorialSummary?.text,
    address: p.formattedAddress,
    city: component(p, "locality", "postal_town", "administrative_area_level_2"),
    region: component(p, "administrative_area_level_1"),
    country: component(p, "country"),
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
    website: p.websiteUri,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    priceLevel: p.priceLevel ? PRICE_LEVELS[p.priceLevel] : undefined,
    businessStatus: p.businessStatus,
    openingHours: p.regularOpeningHours?.weekdayDescriptions,
    reviews: reviews?.length ? reviews : undefined,
    raw: { id: p.id, types: p.types },
    fetchedAt,
  };
}

export const googlePlacesProvider = createGooglePlacesProvider();
