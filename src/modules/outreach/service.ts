import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { MESSAGE_CHANNELS, MESSAGE_STATUSES, type MessageChannel, type MessageStatus } from "@/domain";
import { opportunityPriority } from "@/domain/priority";
import { getDb, tables, type Db } from "@/lib/db";
import { completeJson, getLlmInfo, llmMissingError, LLM_KEY_VARS } from "@/lib/llm";
import { logActivity } from "../activity/service";
import type { JobContext } from "../jobs/handlers";
import { getSenderProfile } from "../profile/sender";
import { buildOutreachPrompt, OUTREACH_SYSTEM, type OutreachFacts } from "./prompt";
import type { GenerateMessagesInput } from "./types";
import { validateMessage } from "./validate";

export type StoredMessage = typeof tables.messages.$inferSelect;

export interface OutreachDeps {
  db?: Db;
  complete?: typeof completeJson;
  log?: typeof logActivity;
}

/** Mensaje de error de datos insuficientes: no es un fallo del sistema, falta trabajo previo. */
export class OutreachPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutreachPrerequisiteError";
  }
}

const MAX_EVIDENCE = 14;

export function outreachAvailability(): { configured: boolean; missingEnv: string[] } {
  const ok = getLlmInfo() !== undefined;
  return { configured: ok, missingEnv: ok ? [] : [...LLM_KEY_VARS] };
}

/** Oportunidades abiertas de la empresa, de mayor a menor prioridad. */
export function listOpenOpportunities(companyId: number, db: Db = getDb()) {
  return db
    .select()
    .from(tables.opportunities)
    .where(and(eq(tables.opportunities.companyId, companyId), eq(tables.opportunities.status, "open")))
    .all()
    .sort((a, b) => opportunityPriority(b) - opportunityPriority(a) || b.id - a.id);
}

/** Reúne los hechos reales sobre los que se redacta: negocio, oportunidad elegida y sus evidencias. */
export function loadOutreachFacts(companyId: number, opportunityId: number | undefined, db: Db) {
  const company = db.select().from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!company) throw new OutreachPrerequisiteError(`La empresa ${companyId} no existe.`);

  const open = listOpenOpportunities(companyId, db);
  const opportunity = opportunityId ? open.find((o) => o.id === opportunityId) : open[0];
  if (!opportunity) {
    throw new OutreachPrerequisiteError(
      opportunityId
        ? "La oportunidad elegida no existe o está descartada."
        : "No hay oportunidades detectadas para esta empresa. Analiza la empresa antes de generar mensajes.",
    );
  }

  const linkedIds = db
    .select({ id: tables.opportunityEvidence.evidenceId })
    .from(tables.opportunityEvidence)
    .where(eq(tables.opportunityEvidence.opportunityId, opportunity.id))
    .all()
    .map((r) => r.id);
  const scope = opportunity.analysisId
    ? or(eq(tables.evidence.analysisId, opportunity.analysisId), isNull(tables.evidence.analysisId))
    : undefined;
  const rows = db
    .select()
    .from(tables.evidence)
    .where(and(eq(tables.evidence.companyId, companyId), scope))
    .orderBy(desc(tables.evidence.id))
    .all();
  const linked = new Set(linkedIds);
  const evidence = [...rows.filter((e) => linked.has(e.id)), ...rows.filter((e) => !linked.has(e.id))].slice(0, MAX_EVIDENCE);
  if (evidence.length === 0) {
    throw new OutreachPrerequisiteError("No hay evidencias registradas para esta empresa. Analiza la empresa antes de generar mensajes.");
  }

  const facts: OutreachFacts = {
    company: {
      name: company.name,
      category: company.category,
      city: company.city,
      region: company.region,
      country: company.country,
      rating: company.rating,
      reviewCount: company.reviewCount,
      website: company.website,
      hasWhatsapp: Boolean(company.whatsapp),
    },
    opportunity: {
      title: opportunity.title,
      problem: opportunity.problem,
      consequence: opportunity.consequence,
      serviceKey: opportunity.serviceKey,
      confidence: opportunity.confidence,
    },
    evidence: evidence.map((e) => ({ id: e.id, kind: e.kind, label: e.label, detail: e.detail, excerpt: e.excerpt, sourceUrl: e.sourceUrl })),
  };
  return { company, opportunity, facts };
}

function responseSchema(channels: MessageChannel[], known: ReadonlySet<number>) {
  return z
    .object({
      messages: z.array(
        z.object({
          channel: z.enum(MESSAGE_CHANNELS),
          subject: z.string().nullish(),
          body: z.string(),
          evidenceIds: z.array(z.number().int()),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      for (const ch of channels) {
        if (v.messages.filter((m) => m.channel === ch).length !== 1) {
          ctx.addIssue({ code: "custom", message: `Debe haber exactamente un mensaje para el canal ${ch}` });
        }
      }
      for (const m of v.messages) {
        if (!channels.includes(m.channel)) ctx.addIssue({ code: "custom", message: `Canal no solicitado: ${m.channel}` });
        for (const p of validateMessage(m, known)) ctx.addIssue({ code: "custom", message: p });
      }
    });
}

/**
 * Genera y persiste (tabla messages) mensajes personalizados por canal. Cada ejecución crea una versión
 * nueva (las anteriores se conservan). Devuelve los ids de los mensajes creados.
 */
export async function generateMessages(input: GenerateMessagesInput, deps: OutreachDeps = {}): Promise<number[]> {
  const db = deps.db ?? getDb();
  const complete = deps.complete ?? completeJson;
  const log = deps.log ?? logActivity;
  const channels = [...new Set(input.channels)].filter((c) => MESSAGE_CHANNELS.includes(c));
  if (channels.length === 0) throw new OutreachPrerequisiteError("Elige al menos un canal.");
  if (!deps.complete && !getLlmInfo()) throw llmMissingError("generación de mensajes");

  const { company, opportunity, facts } = loadOutreachFacts(input.companyId, input.opportunityId, db);
  const known = new Set(facts.evidence.map((e) => e.id));
  const language = input.language ?? "es";
  const result = await complete({
    system: OUTREACH_SYSTEM,
    prompt: buildOutreachPrompt(facts, channels, getSenderProfile(db), language),
    schema: responseSchema(channels, known),
    maxTokens: 1800,
  });

  const model = getLlmInfo()?.model ?? null;
  const ids = db.transaction((tx) =>
    channels.map((channel) => {
      const m = result.messages.find((x) => x.channel === channel)!;
      return tx
        .insert(tables.messages)
        .values({
          companyId: company.id,
          opportunityId: opportunity.id,
          channel,
          subject: channel === "email" ? m.subject?.trim() : null,
          body: m.body.trim(),
          language,
          evidenceIds: [...new Set(m.evidenceIds)],
          model,
        })
        .returning({ id: tables.messages.id })
        .get().id;
    }),
  );
  log({
    type: "message.generated",
    message: `Mensajes generados (${channels.join(", ")}) para «${company.name}» sobre «${opportunity.title}»`,
    companyId: company.id,
  });
  return ids;
}

export async function generateMessagesForJob(payload: Record<string, unknown>, ctx: JobContext) {
  ctx.setProgress(10, "Preparando evidencias");
  const input = payload as unknown as GenerateMessagesInput;
  ctx.setProgress(30, "Redactando mensajes");
  const ids = await generateMessages(input);
  ctx.setProgress(100, "Listo");
  return { messageIds: ids };
}

/** Todos los mensajes de la empresa, del más reciente al más antiguo. */
export function listMessages(companyId: number, db: Db = getDb()): StoredMessage[] {
  return db.select().from(tables.messages).where(eq(tables.messages.companyId, companyId)).orderBy(desc(tables.messages.id)).all();
}

export interface MessageEdit {
  subject?: string | null;
  body?: string;
  status?: MessageStatus;
}

/** Edición manual de un mensaje (cuerpo, asunto o estado). Persistente. */
export function updateMessage(id: number, edit: MessageEdit, deps: Pick<OutreachDeps, "db" | "log"> = {}): StoredMessage {
  const db = deps.db ?? getDb();
  const log = deps.log ?? logActivity;
  const current = db.select().from(tables.messages).where(eq(tables.messages.id, id)).get();
  if (!current) throw new Error("El mensaje no existe.");
  if (edit.body !== undefined && edit.body.trim() === "") throw new Error("El mensaje no puede estar vacío.");
  if (edit.status !== undefined && !MESSAGE_STATUSES.includes(edit.status)) throw new Error("Estado no válido.");
  const next = db
    .update(tables.messages)
    .set({
      body: edit.body?.trim() ?? current.body,
      subject: current.channel === "email" && edit.subject !== undefined ? (edit.subject?.trim() || null) : current.subject,
      status: edit.status ?? current.status,
    })
    .where(eq(tables.messages.id, id))
    .returning()
    .get();
  if (edit.status && edit.status !== current.status) {
    log({
      type: "message.status_changed",
      message: `Mensaje de ${current.channel} marcado como ${edit.status}`,
      companyId: current.companyId,
    });
  }
  return next;
}

/** Evidencias citadas por los mensajes (id → etiqueta), para mostrar la trazabilidad. */
export function evidenceLabels(ids: number[], db: Db = getDb()): Map<number, { label: string; detail: string }> {
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({ id: tables.evidence.id, label: tables.evidence.label, detail: tables.evidence.detail })
      .from(tables.evidence)
      .where(inArray(tables.evidence.id, ids))
      .all()
      .map((e) => [e.id, { label: e.label, detail: e.detail }]),
  );
}
