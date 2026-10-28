export const JOB_TYPES = [
  "discovery.run", // ejecuta una búsqueda: descubre y persiste empresas
  "company.analyze", // analiza web + reseñas, detecta oportunidades y puntúa
  "message.generate", // genera mensajes de contacto
  "report.generate", // genera informe comercial (y PDF)
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
