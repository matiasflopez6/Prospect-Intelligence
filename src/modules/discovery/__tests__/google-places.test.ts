import { describe, expect, it, vi } from "vitest";
import { MissingCredentialError, ProviderError } from "@/lib/errors";
import { RateLimiter } from "../lib/http";
import { createGooglePlacesProvider } from "../providers/google-places";

/** Respuesta SINTÉTICA con el formato de Places API (New). No son negocios reales. */
const place = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `place-${n}`,
  displayName: { text: `Clínica de Prueba ${n}`, languageCode: "es" },
  formattedAddress: `Calle ${n}, Ciudad Prueba, País Prueba`,
  addressComponents: [
    { longText: "Ciudad Prueba", types: ["locality"] },
    { longText: "Provincia Prueba", types: ["administrative_area_level_1"] },
    { longText: "País Prueba", types: ["country"] },
  ],
  location: { latitude: -24.8, longitude: -65.4 },
  googleMapsUri: `https://maps.google.com/?cid=${n}`,
  primaryTypeDisplayName: { text: "Dentista" },
  businessStatus: "OPERATIONAL",
  internationalPhoneNumber: "+00 111 1111",
  websiteUri: `https://clinica${n}.example`,
  rating: 4.6,
  userRatingCount: 120 + n,
  priceLevel: "PRICE_LEVEL_MODERATE",
  regularOpeningHours: { weekdayDescriptions: ["lunes: 9:00–18:00"] },
  reviews: [{ authorAttribution: { displayName: "Persona Prueba" }, rating: 2, text: { text: "Tardaron en responder", languageCode: "es" }, publishTime: "2026-01-02T10:00:00Z" }],
  ...extra,
});

const fast = { limiter: new RateLimiter(0), backoffMs: 1 };
const ctx = { log: () => undefined };

describe("google places provider", () => {
  it("lanza MissingCredentialError con la variable exacta si falta la clave", async () => {
    const p = createGooglePlacesProvider({ apiKey: () => undefined, ...fast });
    expect(p.availability()).toEqual({ configured: false, missingEnv: ["GOOGLE_PLACES_API_KEY"] });
    const err = await p.search({ niche: "clínicas dentales", location: "Salta, Argentina", limit: 5 }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(MissingCredentialError);
    expect(err.missingEnv).toEqual(["GOOGLE_PLACES_API_KEY"]);
  });

  it("envía clave y máscara de campos, y normaliza el resultado", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ places: [place(1)] })));
    const p = createGooglePlacesProvider({ apiKey: () => "k-test", fetchImpl, ...fast });
    const [b] = await p.search({ niche: "clínicas dentales", location: "Salta, Argentina", limit: 5 }, ctx);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("k-test");
    expect(headers["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(JSON.parse(String(init.body))).toMatchObject({ textQuery: "clínicas dentales en Salta, Argentina", languageCode: "es" });

    expect(b).toMatchObject({
      provider: "google-places",
      externalId: "place-1",
      name: "Clínica de Prueba 1",
      category: "Dentista",
      city: "Ciudad Prueba",
      region: "Provincia Prueba",
      country: "País Prueba",
      phone: "+00 111 1111",
      website: "https://clinica1.example",
      rating: 4.6,
      reviewCount: 121,
      priceLevel: 2,
      openingHours: ["lunes: 9:00–18:00"],
      lat: -24.8,
    });
    expect(b!.reviews?.[0]).toMatchObject({ author: "Persona Prueba", rating: 2, text: "Tardaron en responder" });
    expect(b!.reviews?.[0]?.ownerReplied).toBeUndefined(); // la API no lo informa
  });

  it("pagina con nextPageToken hasta alcanzar el límite", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [place(1), place(2)], nextPageToken: "t2" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [place(3), place(4)] })));
    const p = createGooglePlacesProvider({ apiKey: () => "k", fetchImpl, ...fast });
    const res = await p.search({ niche: "x", location: "y", limit: 3 }, ctx);
    expect(res.map((b) => b.externalId)).toEqual(["place-1", "place-2", "place-3"]);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).pageToken).toBe("t2");
  });

  it("devuelve una lista vacía (no datos inventados) si Google no tiene resultados", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const p = createGooglePlacesProvider({ apiKey: () => "k", fetchImpl, ...fast });
    expect(await p.search({ niche: "x", location: "y", limit: 5 }, ctx)).toEqual([]);
  });

  it("explica el error 403 de clave/API no habilitada", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 403 }));
    const p = createGooglePlacesProvider({ apiKey: () => "bad", fetchImpl, ...fast });
    const err = await p.search({ niche: "x", location: "y", limit: 5 }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toContain("Places API (New)");
  });
});
