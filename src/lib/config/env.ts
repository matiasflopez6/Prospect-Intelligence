import { z } from "zod";

/** Cadena vacía → undefined, para que `KEY=` en .env cuente como "no configurado". */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  DATABASE_URL: z.string().default("./data/prospect.db"),
  GOOGLE_PLACES_API_KEY: optionalString,
  OSM_CONTACT: optionalString,
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  PAGESPEED_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  REPORTS_DIR: z.string().default("./data/reports"),
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
