import { getEnv, type Env } from "./env";

export type IntegrationId = "google-places" | "openstreetmap" | "pagespeed" | "anthropic";

export interface IntegrationStatus {
  id: IntegrationId;
  label: string;
  /** Qué funcionalidad habilita. */
  purpose: string;
  /** Variables de entorno que necesita (vacío = no necesita credenciales). */
  requiredEnv: (keyof Env)[];
  /** Variables opcionales que mejoran el servicio. */
  optionalEnv: (keyof Env)[];
  configured: boolean;
  missingEnv: string[];
  /** true si la integración es imprescindible para el flujo principal. */
  critical: boolean;
  docsUrl?: string;
}

/** Estado de cada integración externa, derivado de las variables de entorno. Nunca expone valores. */
export function getIntegrationStatuses(): IntegrationStatus[] {
  const env = getEnv();
  const defs: Omit<IntegrationStatus, "configured" | "missingEnv">[] = [
    {
      id: "google-places",
      label: "Google Places",
      purpose: "Descubrimiento de negocios con teléfono, web, valoración, reseñas y horarios.",
      requiredEnv: ["GOOGLE_PLACES_API_KEY"],
      optionalEnv: [],
      critical: true,
      docsUrl: "https://developers.google.com/maps/documentation/places/web-service/overview",
    },
    {
      id: "openstreetmap",
      label: "OpenStreetMap (Nominatim + Overpass)",
      purpose: "Descubrimiento gratuito sin clave. Cobertura variable según la zona.",
      requiredEnv: ["OSM_CONTACT"],
      optionalEnv: ["OVERPASS_URL"],
      critical: false,
      docsUrl: "https://operations.osmfoundation.org/policies/nominatim/",
    },
    {
      id: "pagespeed",
      label: "Google PageSpeed Insights",
      purpose: "Velocidad y rendimiento móvil de las webs (funciona sin clave con cuota baja).",
      requiredEnv: [],
      optionalEnv: ["PAGESPEED_API_KEY"],
      critical: false,
      docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    },
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      purpose: "Interpretación del análisis, oportunidades, mensajes personalizados e informes.",
      requiredEnv: ["ANTHROPIC_API_KEY"],
      optionalEnv: ["ANTHROPIC_MODEL"],
      critical: true,
      docsUrl: "https://console.anthropic.com/",
    },
  ];

  return defs.map((d) => {
    const missingEnv = d.requiredEnv.filter((k) => !env[k]).map(String);
    return { ...d, configured: missingEnv.length === 0, missingEnv };
  });
}

export function isConfigured(id: IntegrationId): boolean {
  return getIntegrationStatuses().find((s) => s.id === id)?.configured ?? false;
}
