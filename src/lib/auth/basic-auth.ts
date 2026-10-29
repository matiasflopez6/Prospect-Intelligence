/**
 * Protección HTTP Basic para despliegues públicos. La app no tiene usuarios ni sesiones y guarda
 * claves de API, así que en un despliegue público todo (páginas, server actions y API) pasa por aquí.
 *
 * - `APP_PASSWORD` definida → se exige usuario (`APP_USERNAME`, por defecto «admin») y contraseña.
 * - Sin `APP_PASSWORD` en local → sin protección (uso en tu propio equipo).
 * - Sin `APP_PASSWORD` pero en Railway (`RAILWAY_ENVIRONMENT` presente) → se bloquea todo con 503
 *   en vez de exponer la app abierta por descuido.
 */

export type AuthDecision = "allow" | "challenge" | "misconfigured";

export interface AuthEnv {
  APP_USERNAME?: string;
  APP_PASSWORD?: string;
  RAILWAY_ENVIRONMENT?: string;
}

/** Rutas sin autenticación: solo el healthcheck de la plataforma. */
export const PUBLIC_PATHS = ["/api/health"];

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Comparación en tiempo constante (compara hashes de longitud fija). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
  return diff === 0;
}

function parseBasic(header: string | null): { user: string; pass: string } | undefined {
  if (!header?.startsWith("Basic ")) return undefined;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)));
    const i = decoded.indexOf(":");
    if (i < 0) return undefined;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return undefined;
  }
}

export async function decideAccess(pathname: string, authorization: string | null, env: AuthEnv): Promise<AuthDecision> {
  if (PUBLIC_PATHS.includes(pathname)) return "allow";
  const password = env.APP_PASSWORD?.trim() ? env.APP_PASSWORD : undefined;
  if (!password) return env.RAILWAY_ENVIRONMENT ? "misconfigured" : "allow";
  const username = env.APP_USERNAME?.trim() || "admin";
  const creds = parseBasic(authorization);
  if (!creds) return "challenge";
  const [userOk, passOk] = await Promise.all([safeEqual(creds.user, username), safeEqual(creds.pass, password)]);
  return userOk && passOk ? "allow" : "challenge";
}
