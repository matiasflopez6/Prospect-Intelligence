"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CRM_STATUSES } from "@/domain";
import { errorMessage } from "@/lib/errors";
import { parseDateInput } from "./dates";
import { addNote, createMember, updateCrm } from "./service";

export interface CrmFormState {
  ok?: boolean;
  error?: string;
}

const companyIdSchema = z.coerce.number().int().positive();

function refresh(companyId: number) {
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

const saveSchema = z.object({
  companyId: companyIdSchema,
  status: z.enum(CRM_STATUSES),
  ownerId: z.string(),
  newOwner: z.string().trim().max(80),
  nextAction: z.string().trim().max(500),
  followUpAt: z.string(),
  lostReason: z.string().trim().max(500),
});

/** Guarda estado, responsable, próxima acción y fecha de seguimiento de una empresa. */
export async function saveCrmAction(_prev: CrmFormState, form: FormData): Promise<CrmFormState> {
  const parsed = saveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Datos no válidos" };
  const d = parsed.data;
  const followUpAt = parseDateInput(d.followUpAt);
  if (d.followUpAt && !followUpAt) return { error: "Fecha de seguimiento no válida" };
  try {
    let ownerId: number | null = d.ownerId ? Number(d.ownerId) : null;
    if (d.newOwner) ownerId = createMember(d.newOwner).id;
    updateCrm(d.companyId, {
      status: d.status,
      ownerId,
      nextAction: d.nextAction || null,
      followUpAt,
      lostReason: d.status === "lost" ? d.lostReason || null : null,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  refresh(d.companyId);
  return { ok: true };
}

export async function addNoteAction(_prev: CrmFormState, form: FormData): Promise<CrmFormState> {
  const companyId = companyIdSchema.safeParse(form.get("companyId"));
  const body = String(form.get("body") ?? "");
  const authorRaw = form.get("authorId");
  if (!companyId.success) return { error: "Empresa no válida" };
  if (!body.trim()) return { error: "Escribe la nota" };
  try {
    addNote(companyId.data, body, authorRaw ? Number(authorRaw) : undefined);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  refresh(companyId.data);
  return { ok: true };
}

/** Cambio rápido de estado (tarjetas del pipeline). */
export async function setStatusAction(companyId: number, status: string): Promise<{ error?: string }> {
  const id = companyIdSchema.safeParse(companyId);
  const st = z.enum(CRM_STATUSES).safeParse(status);
  if (!id.success || !st.success) return { error: "Datos no válidos" };
  try {
    updateCrm(id.data, { status: st.data });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  refresh(id.data);
  return {};
}
