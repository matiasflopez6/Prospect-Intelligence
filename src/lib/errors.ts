/** Falta una credencial/variable de entorno para usar una integración. Es un bloqueo, no un bug. */
export class MissingCredentialError extends Error {
  readonly missingEnv: string[];
  constructor(integration: string, missingEnv: string[]) {
    super(`Falta configurar ${integration}: define ${missingEnv.join(", ")} en .env.local`);
    this.name = "MissingCredentialError";
    this.missingEnv = missingEnv;
  }
}

/** Funcionalidad con contrato definido pero aún sin implementar por su módulo propietario. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`No implementado todavía: ${what}`);
    this.name = "NotImplementedError";
  }
}

/** Fallo de un proveedor externo (HTTP, cuota, respuesta inválida). */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, status?: number) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
