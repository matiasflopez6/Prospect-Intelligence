import { NotImplementedError } from "@/lib/errors";
import type { JobContext } from "../jobs/handlers";
import type { GenerateMessagesInput } from "./types";

/**
 * Genera y persiste (tabla messages) mensajes personalizados por canal. Reglas: mencionar algo
 * específico y real del negocio, breve, abrir conversación, no inventar datos.
 * TODO(sesión ficha/mensajes/informe).
 */
export async function generateMessages(_input: GenerateMessagesInput): Promise<number[]> {
  throw new NotImplementedError("outreach/service → generateMessages");
}

export async function generateMessagesForJob(payload: Record<string, unknown>, _ctx: JobContext) {
  return generateMessages(payload as unknown as GenerateMessagesInput);
}
