"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { discoveryProviders } from "@/modules/discovery/registry";
import { createSearch } from "@/modules/discovery/service";

export interface SearchFormState {
  error?: string;
}

const schema = z.object({
  niche: z.string().trim().min(2, "Indica el tipo de negocio").max(120),
  location: z.string().trim().min(2, "Indica la ciudad o ubicación").max(160),
  targetCount: z.coerce.number().int("Debe ser un número entero").min(1, "Mínimo 1 empresa").max(200, "Máximo 200 empresas por búsqueda"),
  providers: z.array(z.string()),
  autoAnalyze: z.boolean(),
});

export async function startSearch(_prev: SearchFormState, form: FormData): Promise<SearchFormState> {
  const parsed = schema.safeParse({
    niche: form.get("niche"),
    location: form.get("location"),
    targetCount: form.get("targetCount"),
    providers: form.getAll("providers").map(String),
    autoAnalyze: form.get("autoAnalyze") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const known = new Set(discoveryProviders.map((p) => p.id));
  const providers = parsed.data.providers.filter((p) => known.has(p));
  if (providers.length === 0) return { error: "Elige al menos una fuente de datos" };

  const id = createSearch({
    niche: parsed.data.niche,
    location: parsed.data.location,
    targetCount: parsed.data.targetCount,
    providers,
    autoAnalyze: parsed.data.autoAnalyze,
  });
  redirect(`/searches/${id}`);
}
