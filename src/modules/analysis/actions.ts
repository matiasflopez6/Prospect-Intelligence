"use server";

import { revalidatePath } from "next/cache";
import { getDb, tables } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requestAnalysis } from "./service";

/** Acción de formulario: (re)analizar una empresa. Idempotente mientras haya un análisis en curso. */
export async function analyzeCompanyAction(formData: FormData): Promise<void> {
  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId) || companyId <= 0) return;
  const exists = getDb().select({ id: tables.companies.id }).from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!exists) return;
  requestAnalysis(companyId);
  revalidatePath(`/companies/${companyId}`);
}
