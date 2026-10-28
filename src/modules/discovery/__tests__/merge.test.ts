import { describe, expect, it } from "vitest";
import { mergeBusinesses } from "../merge";
import type { DiscoveredBusiness } from "../types";

const at = new Date("2026-01-01");
const biz = (o: Partial<DiscoveredBusiness> & Pick<DiscoveredBusiness, "provider" | "externalId" | "name">): DiscoveredBusiness => ({ fetchedAt: at, ...o });

describe("mergeBusinesses", () => {
  it("fusiona el mismo negocio de dos fuentes conservando la procedencia de cada campo", () => {
    const g = biz({ provider: "google-places", externalId: "g1", name: "Clínica Sonrisa", phone: "+54 387 400-1111", rating: 4.7, reviewCount: 88, lat: -24.78, lng: -65.41, website: "https://www.sonrisa.example/" });
    const o = biz({ provider: "openstreetmap", externalId: "node/1", name: "Clinica Sonrisa", lat: -24.7801, lng: -65.4101, email: "hola@sonrisa.example", socialLinks: [{ platform: "instagram", url: "https://www.instagram.com/sonrisa" }], address: "Calle Falsa 123" });
    const merged = mergeBusinesses([o, g]);
    expect(merged).toHaveLength(1);
    const m = merged[0]!;
    expect(m).toMatchObject({ name: "Clínica Sonrisa", rating: 4.7, email: "hola@sonrisa.example", address: "Calle Falsa 123" });
    expect(m.fieldSources).toMatchObject({ name: "google-places", rating: "google-places", email: "openstreetmap", address: "openstreetmap", socialLinks: "openstreetmap" });
    expect(m.externalIds).toEqual({ "google-places": "g1", openstreetmap: "node/1" });
    expect(m.sources.map((s) => s.provider).sort()).toEqual(["google-places", "openstreetmap"]);
    expect(m.sources.find((s) => s.provider === "openstreetmap")!.fields).toEqual(expect.arrayContaining(["email", "address", "socialLinks"]));
  });

  it("fusiona por teléfono aunque el formato difiera y los nombres sean parecidos", () => {
    const a = biz({ provider: "google-places", externalId: "a", name: "Dental Norte", phone: "+54 9 387 555-0101" });
    const b = biz({ provider: "openstreetmap", externalId: "b", name: "Dental Norte Salta", phone: "0387 555 0101" });
    expect(mergeBusinesses([a, b])).toHaveLength(1);
  });

  it("NO fusiona sucursales con la misma web pero en sitios distintos", () => {
    const a = biz({ provider: "google-places", externalId: "a", name: "Red Dental Centro", website: "https://reddental.example", lat: -24.78, lng: -65.41 });
    const b = biz({ provider: "google-places", externalId: "b", name: "Red Dental Sur", website: "https://reddental.example", lat: -24.85, lng: -65.5 });
    expect(mergeBusinesses([a, b])).toHaveLength(2);
  });

  it("NO fusiona negocios con el mismo nombre en sitios distintos", () => {
    const a = biz({ provider: "google-places", externalId: "a", name: "Farmacia Central", lat: -24.78, lng: -65.41 });
    const b = biz({ provider: "openstreetmap", externalId: "b", name: "Farmacia Central", lat: -24.9, lng: -65.3 });
    expect(mergeBusinesses([a, b])).toHaveLength(2);
  });

  it("sin coordenadas exige coincidir en la dirección", () => {
    const a = biz({ provider: "google-places", externalId: "a", name: "Consultorio Luna", address: "Av. Belgrano 450, Salta" });
    const same = biz({ provider: "openstreetmap", externalId: "b", name: "Consultorio Luna", address: "Belgrano 450" });
    const other = biz({ provider: "openstreetmap", externalId: "c", name: "Consultorio Luna", address: "Mitre 12" });
    expect(mergeBusinesses([a, same])).toHaveLength(1);
    expect(mergeBusinesses([a, other])).toHaveLength(2);
  });

  it("deduplica el mismo id repetido dentro de una fuente y prioriza negocios confirmados por varias fuentes", () => {
    const solo = biz({ provider: "google-places", externalId: "solo", name: "Solo Uno", lat: 1, lng: 1 });
    const g = biz({ provider: "google-places", externalId: "g", name: "Doble Dos", lat: 2, lng: 2 });
    const o = biz({ provider: "openstreetmap", externalId: "o", name: "Doble Dos", lat: 2, lng: 2 });
    const dup = biz({ provider: "google-places", externalId: "solo", name: "Solo Uno", lat: 1, lng: 1 });
    const res = mergeBusinesses([solo, g, o, dup]);
    expect(res.map((m) => m.name)).toEqual(["Doble Dos", "Solo Uno"]);
  });
});
