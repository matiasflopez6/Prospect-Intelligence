/**
 * Prueba en vivo del descubrimiento contra las fuentes reales (sin base de datos).
 *
 *   npm run discovery:live -- "clínicas dentales" "Salta, Argentina" 10
 *   npm run discovery:live -- "clínicas dentales" "Salta, Argentina" 10 --providers=openstreetmap --no-web
 *
 * Imprime una tabla y guarda el JSON completo (con la procedencia de cada campo) en data/discovery-live.json.
 */
import fs from "node:fs";
import { discoveryProviders } from "../src/modules/discovery/registry";
import { mergeBusinesses } from "../src/modules/discovery/merge";
import { enrichFromWebsite } from "../src/modules/discovery/website";
import { errorMessage } from "../src/lib/errors";
import type { DiscoveredBusiness } from "../src/modules/discovery/types";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [niche, location, limitArg] = args.filter((a) => !a.startsWith("--"));
if (!niche || !location) {
  console.error('Uso: npm run discovery:live -- "<nicho>" "<ubicación>" [límite] [--providers=a,b] [--no-web]');
  process.exit(2);
}
const limit = Number(limitArg ?? 10);
const only = flags.find((f) => f.startsWith("--providers="))?.split("=")[1]?.split(",");
const skipWeb = flags.includes("--no-web");

async function main() {
  const found: DiscoveredBusiness[] = [];
  for (const p of discoveryProviders.filter((p) => !only || only.includes(p.id))) {
    const a = p.availability();
    if (!a.configured) {
      console.log(`⚠ ${p.label}: falta configurar ${a.missingEnv.join(", ")} (bloqueo, se omite)`);
      continue;
    }
    try {
      const res = await p.search({ niche: niche!, location: location!, limit }, { log: (m) => console.log(`  · ${p.id}: ${m}`) });
      console.log(`✓ ${p.label}: ${res.length} resultados`);
      found.push(...res);
    } catch (e) {
      console.log(`✗ ${p.label}: ${errorMessage(e)}`);
    }
  }
  const merged = mergeBusinesses(found).slice(0, limit);
  const out = [];
  for (const b of merged) {
    const site = !skipWeb && b.website ? await enrichFromWebsite(b.website).catch(() => undefined) : undefined;
    out.push({ ...b, email: b.email ?? site?.email, whatsapp: b.whatsapp ?? site?.whatsapp, website_enrichment: site });
  }
  console.table(
    out.map((b) => ({
      nombre: b.name,
      fuentes: b.sources.map((s) => s.provider).join("+"),
      web: b.website ?? "",
      tel: b.phone ?? "",
      email: b.email ?? "",
      "★": b.rating ?? "",
      reseñas: b.reviewCount ?? "",
      redes: b.socialLinks?.length ?? 0,
    })),
  );
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/discovery-live.json", JSON.stringify(out, null, 2));
  console.log(`${out.length} empresas → data/discovery-live.json`);
}

void main();
