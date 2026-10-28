export const EVIDENCE_KINDS = [
  "listing", // dato de la ficha del negocio (Google Places, OSM…)
  "website", // observación sobre la web
  "review", // reseña concreta
  "social", // perfil/actividad en redes
  "absence", // algo que se buscó y no se encontró (se registra como evidencia explícita)
  "other",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  listing: "Ficha del negocio",
  website: "Sitio web",
  review: "Reseña",
  social: "Redes sociales",
  absence: "No encontrado",
  other: "Otro",
};
