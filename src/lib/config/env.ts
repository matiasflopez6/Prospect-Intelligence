import { z } from "zod";

/** Cadena vacía → undefined, para que `KEY=` en .env cuente como "no configurado". */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

/** `KEY=` vacío cuenta como no definida y toma el valor por defecto. */
const emptyAsUndefined = <T extends z.ZodType>(inner: T) => z.preprocess((v) => (v === "" ? undefined : v), inner);

const schema = z.object({
  DATABASE_URL: z.string().default("./data/prospect.db"),
  GOOGLE_PLACES_API_KEY: optionalString,
  OSM_CONTACT: optionalString,
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  NOMINATIM_URL: z.string().default("https://nominatim.openstreetmap.org/search"),
  PAGESPEED_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  /** Google AI Studio (Gemini): clave de https://aistudio.google.com/apikey */
  GEMINI_API_KEY: optionalString,
  /** Modelo por defecto: Flash Lite (barato y con cuota amplia). */
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  /**
   * Modelos de respaldo, en orden de preferencia, separados por comas. Se usan si el principal no existe
   * (404), está saturado (5xx) o agotó su cuota. Cada modelo tiene su propia cuota en AI Studio.
   */
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3.8-flash,gemini-flash-lite-latest,gemini-flash-latest"),
  /** Peticiones por minuto máximas a Gemini, por modelo. El plan gratuito de Flash Lite permite 15. */
  GEMINI_RPM: emptyAsUndefined(z.coerce.number().int().min(1).max(10_000).default(15)),
  /** Reintentos máximos ante 429 (límite por minuto) por modelo, esperando el tiempo que indique Google. */
  GEMINI_MAX_RETRIES: emptyAsUndefined(z.coerce.number().int().min(0).max(20).default(6)),
  /** Fuerza el proveedor cuando hay varias claves; vacío = el que tenga clave. */
  LLM_PROVIDER: z.enum(["anthropic", "gemini"]).optional().or(z.literal("").transform(() => undefined)),
  REPORTS_DIR: z.string().default("./data/reports"),
  CHROMIUM_PATH: optionalString,
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Variables de entorno validadas. Solo en servidor. */
export function getEnv(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** Solo para tests. */
export function resetEnvCache() {
  cached = undefined;
}
