import type { ServiceKey } from "./services";

/**
 * Tipos de oportunidad conocidos. El motor de oportunidades puede emitir tipos
 * adicionales (`type` es texto libre en la base de datos): la UI debe tolerar
 * claves desconocidas mostrando la clave o el título.
 */
export const OPPORTUNITY_TYPES = {
  no_instant_response: { label: "Leads sin respuesta inmediata", service: "instant_lead_response" },
  no_followup: { label: "Falta de seguimiento", service: "lead_followup" },
  no_whatsapp: { label: "Sin WhatsApp visible", service: "whatsapp_automation" },
  no_booking: { label: "Sin sistema de reserva", service: "online_booking" },
  poor_call_handling: { label: "Gestión de llamadas mejorable", service: "call_handling" },
  unanswered_reviews: { label: "Reseñas sin responder", service: "review_management" },
  low_reputation: { label: "Reputación mejorable", service: "review_management" },
  few_reviews: { label: "Pocas reseñas públicas", service: "review_management" },
  weak_forms: { label: "Formularios poco optimizados", service: "lead_qualification" },
  weak_cta: { label: "Llamadas a la acción débiles", service: "web_conversion" },
  no_chat: { label: "Sin chat ni asistente", service: "ai_chat_assistant" },
  manual_processes: { label: "Procesos manuales", service: "process_automation" },
  no_crm: { label: "Ausencia de CRM", service: "crm_implementation" },
  no_reactivation: { label: "Sin recuperación de leads antiguos", service: "lead_reactivation" },
  poor_lead_qualification: { label: "Mala cualificación de leads", service: "lead_qualification" },
  poor_website: { label: "Web deficiente", service: "web_conversion" },
  other: { label: "Otra oportunidad", service: "process_automation" },
} as const satisfies Record<string, { label: string; service: ServiceKey }>;

export type KnownOpportunityType = keyof typeof OPPORTUNITY_TYPES;

export const IMPACT_LEVELS = ["low", "medium", "high"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export const IMPACT_LABELS: Record<ImpactLevel, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

/** Severidad del problema, 1 (menor) a 5 (crítico). */
export type Severity = 1 | 2 | 3 | 4 | 5;

export const OPPORTUNITY_STATUSES = ["open", "dismissed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export function opportunityTypeLabel(type: string): string {
  return type in OPPORTUNITY_TYPES ? OPPORTUNITY_TYPES[type as KnownOpportunityType].label : type;
}
