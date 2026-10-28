import { getEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { DiscoveryProvider } from "../types";

/**
 * OpenStreetMap: Nominatim (geocodificación) + Overpass (POIs). Sin API key, pero la política
 * de OSM exige identificar la aplicación: variable OSM_CONTACT.
 * TODO(sesión discovery): implementar search().
 */
export const openStreetMapProvider: DiscoveryProvider = {
  id: "openstreetmap",
  label: "OpenStreetMap",
  description: "Fuente abierta y gratuita; cobertura variable según la zona.",
  requiredEnv: ["OSM_CONTACT"],
  availability() {
    const ok = Boolean(getEnv().OSM_CONTACT);
    return {
      configured: ok,
      missingEnv: ok ? [] : ["OSM_CONTACT"],
      note: "No requiere clave, solo un contacto para el User-Agent (política de uso de OSM).",
    };
  },
  async search() {
    throw new NotImplementedError("discovery/providers/openstreetmap → search");
  },
};
