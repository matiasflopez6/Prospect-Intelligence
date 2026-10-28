import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { tables, type Db } from "@/lib/db";
import { MissingCredentialError } from "@/lib/errors";
import { runDiscovery, type DiscoveryDeps } from "../service";
import type { DiscoveredBusiness, DiscoveryProvider } from "../types";

const at = new Date("2026-02-01");
let db: Db;
const ctx = { setProgress: vi.fn() };

const provider = (id: string, impl: DiscoveryProvider["search"], configured = true): DiscoveryProvider => ({
  id,
  label: id,
  description: id,
  requiredEnv: configured ? [] : ["FAKE_KEY"],
  availability: () => ({ configured, missingEnv: configured ? [] : ["FAKE_KEY"] }),
  search: impl,
});

const google: DiscoveredBusiness[] = [
  { provider: "google-places", externalId: "g-1", name: "Clínica de Prueba Uno", category: "Dentista", address: "Calle 1", city: "Ciudad Prueba", lat: -24.8, lng: -65.4, phone: "+00 111 1111", website: "https://uno.example", rating: 4.5, reviewCount: 40, openingHours: ["lunes: 9–18"], reviews: [{ author: "Persona", rating: 3, text: "Regular" }], fetchedAt: at },
  { provider: "google-places", externalId: "g-2", name: "Clínica de Prueba Dos", city: "Ciudad Prueba", lat: -24.9, lng: -65.5, rating: 3.9, reviewCount: 10, fetchedAt: at },
];
const osm: DiscoveredBusiness[] = [
  { provider: "openstreetmap", externalId: "node/9", name: "Clinica de Prueba Uno", lat: -24.8001, lng: -65.4001, email: "osm@uno.example", socialLinks: [{ platform: "instagram", url: "https://www.instagram.com/uno" }], fetchedAt: at },
  { provider: "openstreetmap", externalId: "node/10", name: "Consultorio Solo OSM", lat: -24.7, lng: -65.3, fetchedAt: at },
];

function baseDeps(over: Partial<DiscoveryDeps> = {}): DiscoveryDeps {
  return {
    db,
    log: () => undefined,
    enqueue: vi.fn(() => 1),
    enrichWebsite: async () => ({ pagesVisited: [], emails: [], socialLinks: [], phones: [] }),
    providers: [provider("google-places", async () => google), provider("openstreetmap", async () => osm)],
    ...over,
  };
}

function newSearch(over: Partial<typeof tables.searches.$inferInsert> = {}) {
  return db.insert(tables.searches).values({ niche: "clínicas dentales", location: "Ciudad Prueba", targetCount: 10, ...over }).returning({ id: tables.searches.id }).get().id;
}

beforeEach(() => {
  const handle = openDatabase(":memory:");
  db = handle.db;
  // logActivity() usa el singleton: lo apuntamos a la misma base en memoria.
  (globalThis as unknown as { __prospectDb?: unknown }).__prospectDb = handle;
  ctx.setProgress.mockClear();
});

describe("runDiscovery", () => {
  it("persiste empresas fusionadas con procedencia, CRM 'new', redes, reseñas y encola el análisis", async () => {
    const id = newSearch();
    const deps = baseDeps();
    const out = (await runDiscovery(id, ctx, deps)) as { status: string; found: number; created: number };
    expect(out).toMatchObject({ status: "completed", found: 3, created: 3 });

    const companies = db.select().from(tables.companies).all();
    expect(companies.map((c) => c.name).sort()).toEqual(["Clínica de Prueba Dos", "Clínica de Prueba Uno", "Consultorio Solo OSM"]);
    const uno = companies.find((c) => c.name === "Clínica de Prueba Uno")!;
    expect(uno).toMatchObject({ googlePlaceId: "g-1", osmId: "node/9", email: "osm@uno.example", rating: 4.5, reviewCount: 40, websiteDomain: "uno.example", niche: "clínicas dentales", location: "Ciudad Prueba" });

    const sources = db.select().from(tables.companySources).where(eq(tables.companySources.companyId, uno.id)).all();
    expect(sources.map((s) => s.provider).sort()).toEqual(["google-places", "openstreetmap"]);
    expect(sources.find((s) => s.provider === "openstreetmap")!.fields).toContain("email");

    expect(db.select().from(tables.crmEntries).all()).toHaveLength(3);
    expect(db.select().from(tables.crmEntries).all().every((c) => c.status === "new")).toBe(true);
    expect(db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, uno.id)).all()).toMatchObject([{ platform: "instagram", handle: "uno", foundVia: "openstreetmap" }]);
    expect(db.select().from(tables.reviews).where(eq(tables.reviews.companyId, uno.id)).all()).toMatchObject([{ source: "google-places", author: "Persona", ownerReplied: null }]);
    expect(db.select().from(tables.searchCompanies).all()).toHaveLength(3);

    const search = db.select().from(tables.searches).where(eq(tables.searches.id, id)).get()!;
    expect(search).toMatchObject({ status: "completed", foundCount: 3 });
    expect(search.providerResults).toEqual({ "google-places": { status: "ok", found: 2 }, openstreetmap: { status: "ok", found: 2 } });
    expect(deps.enqueue).toHaveBeenCalledTimes(3);
    expect(deps.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "company.analyze", payload: { companyId: uno.id } }));
    expect(db.select().from(tables.activityLog).all().some((a) => a.type === "search.completed")).toBe(true);
  });

  it("no duplica empresas al repetir la búsqueda y actualiza lo que cambia", async () => {
    await runDiscovery(newSearch(), ctx, baseDeps());
    const second = newSearch();
    const updated = google.map((g) => (g.externalId === "g-1" ? { ...g, rating: 4.8, reviewCount: 55 } : g));
    const out = (await runDiscovery(second, ctx, baseDeps({ providers: [provider("google-places", async () => updated), provider("openstreetmap", async () => osm)] }))) as { created: number; found: number };
    expect(out).toMatchObject({ created: 0, found: 3 });
    expect(db.select().from(tables.companies).all()).toHaveLength(3);
    expect(db.select().from(tables.crmEntries).all()).toHaveLength(3);
    expect(db.select().from(tables.companies).where(eq(tables.companies.googlePlaceId, "g-1")).get()).toMatchObject({ rating: 4.8, reviewCount: 55 });
    expect(db.select().from(tables.reviews).all()).toHaveLength(1); // reemplazadas, no acumuladas
    expect(db.select().from(tables.searchCompanies).all()).toHaveLength(6);
  });

  it("completa email, WhatsApp y redes desde la web y lo registra como fuente 'website'", async () => {
    const id = newSearch();
    const enrichWebsite = vi.fn(async (url: string) => ({
      finalUrl: url,
      pagesVisited: [url],
      emails: ["info@uno.example"],
      email: "info@uno.example",
      whatsapp: "+5493875550101",
      socialLinks: [{ platform: "facebook", url: "https://www.facebook.com/uno" }],
      phones: [],
    }));
    await runDiscovery(id, ctx, baseDeps({ enrichWebsite, providers: [provider("google-places", async () => google)] }));
    expect(enrichWebsite).toHaveBeenCalledTimes(1); // solo la empresa con web
    const uno = db.select().from(tables.companies).where(eq(tables.companies.googlePlaceId, "g-1")).get()!;
    expect(uno).toMatchObject({ email: "info@uno.example", whatsapp: "+5493875550101" });
    const web = db.select().from(tables.companySources).where(eq(tables.companySources.provider, "website")).all();
    expect(web).toHaveLength(1);
    expect(web[0]!.fields).toEqual(["email", "whatsapp", "socialLinks"]);
    expect(db.select().from(tables.socialProfiles).all()).toMatchObject([{ platform: "facebook", foundVia: "website" }]);
  });

  it("si un proveedor falla y otro responde, queda 'partial' con el error visible", async () => {
    const id = newSearch();
    const providers = [provider("google-places", async () => google), provider("openstreetmap", async () => { throw new Error("Overpass caído"); })];
    const out = (await runDiscovery(id, ctx, baseDeps({ providers }))) as { status: string };
    expect(out.status).toBe("partial");
    const s = db.select().from(tables.searches).where(eq(tables.searches.id, id)).get()!;
    expect(s.providerResults?.openstreetmap).toMatchObject({ status: "failed", error: "Overpass caído" });
    expect(db.select().from(tables.companies).all()).toHaveLength(2);
  });

  it("un proveedor sin configurar se marca 'skipped' con la variable que falta (bloqueo, no error)", async () => {
    const id = newSearch();
    const providers = [provider("google-places", async () => google, false), provider("openstreetmap", async () => osm)];
    const out = (await runDiscovery(id, ctx, baseDeps({ providers }))) as { status: string };
    expect(out.status).toBe("partial");
    const s = db.select().from(tables.searches).where(eq(tables.searches.id, id)).get()!;
    expect(s.providerResults?.["google-places"]).toMatchObject({ status: "skipped", error: expect.stringContaining("FAKE_KEY") });
  });

  it("falla con MissingCredentialError si ninguna fuente está configurada", async () => {
    const id = newSearch();
    await expect(runDiscovery(id, ctx, baseDeps({ providers: [provider("google-places", async () => google, false)] }))).rejects.toBeInstanceOf(MissingCredentialError);
    expect(db.select().from(tables.searches).where(eq(tables.searches.id, id)).get()).toMatchObject({ status: "failed", error: expect.stringContaining("FAKE_KEY") });
  });

  it("falla si todas las fuentes configuradas fallan, sin guardar nada", async () => {
    const id = newSearch();
    const providers = [provider("openstreetmap", async () => { throw new Error("sin red"); })];
    await expect(runDiscovery(id, ctx, baseDeps({ providers }))).rejects.toThrow(/Ninguna fuente respondió/);
    expect(db.select().from(tables.companies).all()).toHaveLength(0);
  });

  it("respeta el número objetivo y no encola análisis si autoAnalyze es false", async () => {
    const id = newSearch({ targetCount: 2, autoAnalyze: false });
    const deps = baseDeps();
    const out = (await runDiscovery(id, ctx, deps)) as { found: number };
    expect(out.found).toBe(2);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("devuelve 0 empresas sin inventar nada cuando la fuente no encuentra resultados", async () => {
    const id = newSearch();
    const out = (await runDiscovery(id, ctx, baseDeps({ providers: [provider("openstreetmap", async () => [])] }))) as { status: string; found: number };
    expect(out).toMatchObject({ status: "completed", found: 0 });
  });
});
