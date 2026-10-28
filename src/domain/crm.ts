/** Estados del pipeline comercial, en orden de avance. */
export const CRM_STATUSES = [
  "new",
  "analyzed",
  "priority",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "won",
  "lost",
] as const;

export type CrmStatus = (typeof CRM_STATUSES)[number];

export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  new: "Nueva",
  analyzed: "Analizada",
  priority: "Prioritaria",
  contacted: "Contactada",
  replied: "Respondió",
  meeting: "Reunión",
  proposal: "Propuesta",
  won: "Ganada",
  lost: "Perdida",
};

/** Estados "abiertos": la empresa sigue en juego. */
export const CRM_OPEN_STATUSES: readonly CrmStatus[] = CRM_STATUSES.filter(
  (s) => s !== "won" && s !== "lost",
);
