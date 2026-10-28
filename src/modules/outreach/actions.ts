"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MESSAGE_CHANNELS, MESSAGE_STATUSES } from "@/domain";
import { isLlmConfigured, LLM_KEYS_HINT } from "@/lib/llm";
import { errorMessage } from "@/lib/errors";
import type { StartResult } from "@/components/jobs/job-button";
import { enqueueJob } from "../jobs/service";
import { activeJobId } from "../profile/jobs";
import { setSenderProfile } from "../profile/sender";
import { updateMessage } from "./service";

const startSchema = z.object({
  companyId: z.number().int().positive(),
  channels: z.array(z.enum(MESSAGE_CHANNELS)).min(1, "Elige al menos un canal"),
  opportunityId: z.number().int().positive().optional(),
});

export async function startMessageGeneration(input: z.input<typeof startSchema>): Promise<StartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  if (!isLlmConfigured()) return { error: `Falta configurar ${LLM_KEYS_HINT} para generar mensajes personalizados.` };
  const existing = activeJobId(parsed.data.companyId, "message.generate");
  if (existing) return { jobId: existing };
  return { jobId: enqueueJob({ type: "message.generate", payload: parsed.data, companyId: parsed.data.companyId }) };
}

const saveSchema = z.object({
  id: z.number().int().positive(),
  subject: z.string().max(200).nullish(),
  body: z.string().min(1, "El mensaje no puede estar vacío").max(5000),
  status: z.enum(MESSAGE_STATUSES).optional(),
});

export async function saveMessage(input: z.input<typeof saveSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  try {
    const m = updateMessage(parsed.data.id, parsed.data);
    revalidatePath(`/companies/${m.companyId}`);
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

const senderSchema = z.object({ name: z.string().max(120).optional(), agency: z.string().max(120).optional(), companyId: z.number().int().positive() });

export async function saveSender(input: z.input<typeof senderSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = senderSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos" };
  setSenderProfile(parsed.data);
  revalidatePath(`/companies/${parsed.data.companyId}`);
  return { ok: true };
}
