import { getEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { DiscoveryProvider } from "../types";

/**
 * Google Places API (New) — Text Search + Place Details.
 * Variable: GOOGLE_PLACES_API_KEY.
 * TODO(sesión discovery): implementar search() y enrich().
 */
export const googlePlacesProvider: DiscoveryProvider = {
  id: "google-places",
  label: "Google Places",
  description: "Negocios con teléfono, web, valoración, reseñas y horarios.",
  requiredEnv: ["GOOGLE_PLACES_API_KEY"],
  availability() {
    const ok = Boolean(getEnv().GOOGLE_PLACES_API_KEY);
    return { configured: ok, missingEnv: ok ? [] : ["GOOGLE_PLACES_API_KEY"] };
  },
  async search() {
    throw new NotImplementedError("discovery/providers/google-places → search");
  },
};
