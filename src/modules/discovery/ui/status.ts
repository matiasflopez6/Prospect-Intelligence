import type { Tone } from "@/components/ui";

export const SEARCH_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "En cola", tone: "neutral" },
  running: { label: "En curso", tone: "accent" },
  completed: { label: "Completada", tone: "ok" },
  partial: { label: "Parcial", tone: "warn" },
  failed: { label: "Fallida", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const PROVIDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Correcto", tone: "ok" },
  failed: { label: "Falló", tone: "bad" },
  skipped: { label: "Sin configurar", tone: "warn" },
};
