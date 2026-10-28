import type { CrmStatus } from "@/domain";
import { NotImplementedError } from "@/lib/errors";

/**
 * API de CRM. Toda mutación debe registrar actividad (logActivity "crm.*") para la línea de tiempo.
 * TODO(sesión CRM/dashboard/filtros).
 */
export interface CrmUpdate {
  status?: CrmStatus;
  ownerId?: number | null;
  nextAction?: string | null;
  followUpAt?: Date | null;
  lostReason?: string | null;
}

export function updateCrm(_companyId: number, _update: CrmUpdate): void {
  throw new NotImplementedError("crm/service → updateCrm");
}

export function addNote(_companyId: number, _body: string, _authorId?: number): void {
  throw new NotImplementedError("crm/service → addNote");
}
