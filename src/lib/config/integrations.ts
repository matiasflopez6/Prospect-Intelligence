import { getLlmInfo, PROVIDER_LABELS } from "../llm";
import { getEnv, type Env } from "./env";

export type IntegrationId = "google-places" | "openstreetmap" | "pagespeed" | "llm";

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
  /** true = basta con UNA de las variables de `requiredEnv`. */
  anyOf?: boolean;
  /** Información de estado adicional (p. ej. proveedor de IA activo). */
  detail?: string;
  docsUrl?: string;
}

/** Estado de cada integración externa, derivado de las variables de entorno. Nunca expone valores. */
export function getIntegrationStatuses(): IntegrationStatus[] {
  const env = getEnv();
  const llm = getLlmInfo();
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
      requiredEnv: [],
      optionalEnv: ["OSM_CONTACT", "OVERPASS_URL"],
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
      id: "llm",
      label: "IA: Claude o Gemini",
      purpose: "Interpretación del análisis, oportunidades, mensajes personalizados e informes. Basta una de las dos claves.",
      requiredEnv: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"],
      optionalEnv: ["LLM_PROVIDER", "ANTHROPIC_MODEL", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "GEMINI_RPM", "GEMINI_MAX_RETRIES"],
      anyOf: true,
      critical: true,
      detail: llm ? `Activo: ${PROVIDER_LABELS[llm.provider]} · ${llm.model}` : undefined,
      docsUrl: "https://aistudio.google.com/apikey",
    },
  ];

  return defs.map((d) => {
    const missing = d.requiredEnv.filter((k) => !env[k]).map(String);
    const configured = d.anyOf ? missing.length < d.requiredEnv.length : missing.length === 0;
    return { ...d, configured, missingEnv: configured ? [] : d.anyOf ? [d.requiredEnv.join(" o ")] : missing };
  });
}

export function isConfigured(id: IntegrationId): boolean {
  return getIntegrationStatuses().find((s) => s.id === id)?.configured ?? false;
}
