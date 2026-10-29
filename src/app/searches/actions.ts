"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { discoveryProviders } from "@/modules/discovery/registry";
import { errorMessage } from "@/lib/errors";
import { deleteSearch, planSearchDeletion } from "@/modules/discovery/delete";
import { addCompanyByWebsite, createSearch } from "@/modules/discovery/service";

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

const manualSchema = z.object({
  website: z.string().trim().min(3, "Indica la web del negocio").max(300),
  name: z.string().trim().max(120).optional(),
  niche: z.string().trim().min(2, "Indica el tipo de negocio").max(120),
  location: z.string().trim().min(2, "Indica la ciudad o ubicación").max(160),
});

export async function addCompany(_prev: SearchFormState, form: FormData): Promise<SearchFormState> {
  const parsed = manualSchema.safeParse({
    website: form.get("website"),
    name: form.get("name") || undefined,
    niche: form.get("niche"),
    location: form.get("location"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  let companyId: number;
  try {
    ({ companyId } = await addCompanyByWebsite({ ...parsed.data, autoAnalyze: form.get("autoAnalyze") === "on" }));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/companies/${companyId}`);
}

export interface DeletionPreview {
  active: boolean;
  total: number;
  remove: number;
  keepShared: number;
  keepWorked: number;
}

export type PreviewResult = { preview: DeletionPreview } | { error: string };
export type DeleteResult = { removed: number; kept: number } | { error: string };

const idSchema = z.coerce.number().int().positive();

/** Qué pasaría al borrar la búsqueda (para el diálogo de confirmación). No modifica nada. */
export async function previewSearchDeletion(searchId: number): Promise<PreviewResult> {
  const id = idSchema.safeParse(searchId);
  if (!id.success) return { error: "Búsqueda no válida" };
  try {
    const plan = planSearchDeletion(id.data);
    if (!plan) return { error: "La búsqueda ya no existe" };
    return { preview: { active: plan.active, total: plan.total, remove: plan.removeIds.length, keepShared: plan.keepShared, keepWorked: plan.keepWorked } };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteSearchAction(searchId: number): Promise<DeleteResult> {
  const id = idSchema.safeParse(searchId);
  if (!id.success) return { error: "Búsqueda no válida" };
  let result;
  try {
    result = await deleteSearch(id.data);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  if (!result) return { error: "La búsqueda ya no existe" };
  for (const path of ["/", "/searches", "/companies", "/pipeline", "/reports"]) revalidatePath(path);
  return { removed: result.removedCompanies, kept: result.keptCompanies };
}
