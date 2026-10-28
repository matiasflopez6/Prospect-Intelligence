/**
 * Catálogo de servicios que una consultora de IA/automatización puede ofrecer.
 * Es la lista cerrada a la que apuntan las oportunidades (`serviceKey`).
 * Se puede ampliar; nunca renombrar claves ya persistidas.
 */
export const SERVICES = {
  whatsapp_automation: {
    label: "Automatización de WhatsApp",
    description: "Atención y derivación automática de consultas por WhatsApp Business.",
  },
  instant_lead_response: {
    label: "Respuesta inmediata a leads",
    description: "Respuesta automática en segundos a formularios, llamadas perdidas y mensajes.",
  },
  lead_followup: {
    label: "Seguimiento automático de leads",
    description: "Secuencias de seguimiento para que ninguna consulta quede sin respuesta.",
  },
  online_booking: {
    label: "Sistema de reservas online",
    description: "Agenda online con confirmaciones y recordatorios automáticos.",
  },
  ai_chat_assistant: {
    label: "Asistente de IA en web/chat",
    description: "Chatbot que responde preguntas frecuentes y cualifica consultas 24/7.",
  },
  call_handling: {
    label: "Gestión de llamadas",
    description: "Recepción de llamadas perdidas, desvío a WhatsApp y registro automático.",
  },
  review_management: {
    label: "Gestión y respuesta de reseñas",
    description: "Solicitud de reseñas y respuestas asistidas para mejorar la reputación.",
  },
  lead_qualification: {
    label: "Cualificación de leads",
    description: "Formularios y flujos que filtran y puntúan consultas antes del contacto humano.",
  },
  crm_implementation: {
    label: "Implementación de CRM",
    description: "Centralizar contactos, pipeline y seguimiento en un CRM.",
  },
  lead_reactivation: {
    label: "Reactivación de leads antiguos",
    description: "Campañas automáticas para recuperar pacientes/clientes inactivos.",
  },
  web_conversion: {
    label: "Optimización de conversión web",
    description: "Mejoras de propuesta, llamadas a la acción y formularios en la web.",
  },
  process_automation: {
    label: "Automatización de procesos internos",
    description: "Eliminar tareas manuales repetitivas con flujos automáticos.",
  },
} as const;

export type ServiceKey = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

export function serviceLabel(key: string): string {
  return key in SERVICES ? SERVICES[key as ServiceKey].label : key;
}
