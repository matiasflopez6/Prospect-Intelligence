import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../lib/http";
import { buildOverpassQuery, createOpenStreetMapProvider } from "../providers/openstreetmap";

/**
 * Datos SINTÉTICOS con el formato real de Nominatim/Overpass, solo para probar el código.
 * No representan negocios reales.
 */
const NOMINATIM = [
  { osm_type: "node", osm_id: 1, display_name: "Ciudad Prueba (calle)", class: "highway", type: "residential", importance: 0.2, boundingbox: ["-1", "-1", "-1", "-1"] },
  {
    osm_type: "relation",
    osm_id: 4242,
    display_name: "Ciudad Prueba, Provincia Prueba, País Prueba",
    class: "boundary",
    type: "administrative",
    importance: 0.6,
    boundingbox: ["-24.9", "-24.7", "-65.5", "-65.3"],
    address: { city: "Ciudad Prueba", state: "Provincia Prueba", country: "País Prueba" },
  },
];

const OVERPASS = {
  elements: [
    { type: "node", id: 101, lat: -24.8, lon: -65.4, tags: { name: "Consultorio Alfa", amenity: "dentist", phone: "+00 111 1111; +00 222 2222", website: "alfa.example", "addr:street": "Calle Uno", "addr:housenumber": "10", "contact:instagram": "@alfa_prueba", opening_hours: "Mo-Fr 09:00-18:00", "contact:whatsapp": "+00111111111" } },
    { type: "way", id: 202, center: { lat: -24.81, lon: -65.41 }, tags: { name: "Consultorio Beta", healthcare: "dentist" } },
    { type: "node", id: 303, lat: -24.82, lon: -65.42, tags: { amenity: "dentist" } }, // sin nombre: se descarta
  ],
};

function mockFetch(overrides: { overpass?: () => Response; nominatim?: () => Response } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("nominatim")) return overrides.nominatim?.() ?? new Response(JSON.stringify(NOMINATIM), { status: 200 });
    if (url.includes("overpass")) return overrides.overpass?.() ?? new Response(JSON.stringify(OVERPASS), { status: 200 });
    throw new Error(`URL inesperada ${url} ${init?.method}`);
  });
}

const fast = () => ({ nominatimLimiter: new RateLimiter(0), overpassLimiter: new RateLimiter(0), backoffMs: 1 });
const ctx = { log: () => undefined };

describe("openstreetmap provider", () => {
  it("geocodifica, consulta Overpass por área y normaliza los negocios", async () => {
    const fetchImpl = mockFetch();
    const p = createOpenStreetMapProvider({ fetchImpl, overpassUrls: ["https://overpass.test/api"], nominatimUrl: "https://nominatim.test/search", contact: () => "yo@prueba.test", ...fast() });
    const res = await p.search({ niche: "clínicas dentales", location: "Ciudad Prueba", limit: 10 }, ctx);

    expect(res.map((b) => b.name)).toEqual(["Consultorio Alfa", "Consultorio Beta"]); // el más completo primero, sin nombre descartado
    const alfa = res[0]!;
    expect(alfa).toMatchObject({
      provider: "openstreetmap",
      externalId: "node/101",
      sourceUrl: "https://www.openstreetmap.org/node/101",
      category: "Dentista",
      phone: "+00 111 1111",
      website: "https://alfa.example",
      address: "Calle Uno 10",
      city: "Ciudad Prueba",
      region: "Provincia Prueba",
      country: "País Prueba",
      whatsapp: "+00111111111",
      openingHours: ["Mo-Fr 09:00-18:00"],
    });
    expect(alfa.socialLinks).toEqual([{ platform: "instagram", url: "https://www.instagram.com/alfa_prueba" }]);
    expect(alfa.rating).toBeUndefined(); // OSM no tiene valoraciones: no se inventan
    expect(res[1]).toMatchObject({ externalId: "way/202", lat: -24.81, lng: -65.41 });

    // Se eligió la relación administrativa (no la calle homónima) y se consultó por área
    const overpassCall = fetchImpl.mock.calls.find(([u]) => String(u).includes("overpass"))!;
    const q = decodeURIComponent(String((overpassCall[1] as RequestInit).body)).replace(/\+/g, " ");
    expect(q).toContain("area(3600004242)");
    expect(q).toContain('nwr["amenity"="dentist"](area.a)');
    const headers = (overpassCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("yo@prueba.test");
  });

  it("respeta el límite pedido", async () => {
    const p = createOpenStreetMapProvider({ fetchImpl: mockFetch(), overpassUrls: ["https://overpass.test/api"], ...fast() });
    const res = await p.search({ niche: "dentistas", location: "Ciudad Prueba", limit: 1 }, ctx);
    expect(res).toHaveLength(1);
  });

  it("prueba la siguiente instancia de Overpass si la primera falla", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim")) return new Response(JSON.stringify(NOMINATIM));
      calls++;
      return url.includes("uno") ? new Response("overloaded", { status: 504 }) : new Response(JSON.stringify(OVERPASS));
    });
    const p = createOpenStreetMapProvider({ fetchImpl, overpassUrls: ["https://uno.overpass.test", "https://dos.overpass.test"], retries: 0, ...fast() });
    const res = await p.search({ niche: "dentistas", location: "Ciudad Prueba", limit: 5 }, ctx);
    expect(res).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it("falla con un mensaje claro si no encuentra la ubicación", async () => {
    const p = createOpenStreetMapProvider({ fetchImpl: mockFetch({ nominatim: () => new Response("[]") }), overpassUrls: ["https://overpass.test/api"], ...fast() });
    await expect(p.search({ niche: "dentistas", location: "Lugar inexistente", limit: 5 }, ctx)).rejects.toThrow(/No se encontró la ubicación/);
  });

  it("falla (no devuelve vacío) si Overpass informa un error de tiempo", async () => {
    const p = createOpenStreetMapProvider({
      fetchImpl: mockFetch({ overpass: () => new Response(JSON.stringify({ elements: [], remark: "runtime error: Query timed out" })) }),
      overpassUrls: ["https://overpass.test/api"],
      ...fast(),
    });
    await expect(p.search({ niche: "dentistas", location: "Ciudad Prueba", limit: 5 }, ctx)).rejects.toThrow(/timed out/);
  });

  it("no requiere credenciales", () => {
    expect(createOpenStreetMapProvider().availability()).toMatchObject({ configured: true, missingEnv: [] });
  });
});

describe("buildOverpassQuery", () => {
  it("usa bbox si el lugar no es un límite administrativo", () => {
    const q = buildOverpassQuery({ displayName: "x", bbox: { south: 1, north: 2, west: 3, east: 4 } }, { label: "Dentista", tags: [["amenity", "dentist"]] }, []);
    expect(q).toContain('nwr["amenity"="dentist"](1,3,2,4);');
    expect(q).not.toContain("area(");
  });

  it("para nichos desconocidos busca por nombre y exige que sea un negocio (no una calle)", () => {
    const q = buildOverpassQuery({ displayName: "x", areaId: 3600000001 }, undefined, ["tatuaje"]);
    expect(q).toContain('["name"~"tatuaje",i]');
    expect(q).toContain("amenity|shop|office");
  });
});
