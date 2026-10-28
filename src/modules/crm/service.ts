import { and, asc, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { CRM_STATUSES, CRM_STATUS_LABELS, type CrmStatus } from "@/domain";
import { getDb, tables, type Db } from "@/lib/db";
import { logActivity } from "../activity/service";
import { toDateInput } from "./dates";

/**
 * API de CRM. Toda mutación registra actividad (`crm.*`) para la línea de tiempo y el panel.
 * Un cambio de estado fija `statusChangedAt`; pasar a «Contactada» fija `lastContactedAt`.
 */
export interface CrmUpdate {
  status?: CrmStatus;
  ownerId?: number | null;
  nextAction?: string | null;
  followUpAt?: Date | null;
  lostReason?: string | null;
}

export type CrmEntry = typeof tables.crmEntries.$inferSelect;
export type Member = typeof tables.members.$inferSelect;
export type CrmNote = typeof tables.crmNotes.$inferSelect & { authorName: string | null };

const clean = (s: string | null | undefined) => {
  const v = s?.trim();
  return v ? v : null;
};

/** Entrada CRM de la empresa; se crea (estado «Nueva» o «Analizada» según el análisis) si faltara. */
export function ensureCrmEntry(companyId: number, db: Db = getDb()): CrmEntry {
  const existing = db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, companyId)).get();
  if (existing) return existing;
  const company = db.select({ status: tables.companies.analysisStatus }).from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!company) throw new Error(`Empresa ${companyId} no encontrada`);
  return db
    .insert(tables.crmEntries)
    .values({ companyId, status: company.status === "done" ? "analyzed" : "new" })
    .onConflictDoNothing()
    .returning()
    .get() ?? (db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, companyId)).get() as CrmEntry);
}

export function getCrm(companyId: number, db: Db = getDb()): (CrmEntry & { ownerName: string | null }) | undefined {
  const exists = db.select({ id: tables.companies.id }).from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!exists) return undefined;
  const entry = ensureCrmEntry(companyId, db);
  const owner = entry.ownerId ? db.select().from(tables.members).where(eq(tables.members.id, entry.ownerId)).get() : undefined;
  return { ...entry, ownerName: owner?.name ?? null };
}

export function listMembers(db: Db = getDb()): Member[] {
  return db.select().from(tables.members).orderBy(asc(tables.members.name)).all();
}

export function createMember(name: string, db: Db = getDb()): Member {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Indica un nombre");
  const existing = db.select().from(tables.members).where(sql`lower(${tables.members.name}) = lower(${trimmed})`).get();
  if (existing) return existing;
  return db.insert(tables.members).values({ name: trimmed }).returning().get();
}

function describeChange(prev: CrmEntry, next: Partial<CrmEntry>, ownerName: string | null): string[] {
  const parts: string[] = [];
  if (next.status && next.status !== prev.status) parts.push(`Estado: ${CRM_STATUS_LABELS[prev.status]} → ${CRM_STATUS_LABELS[next.status]}`);
  if (next.nextAction !== undefined && next.nextAction !== prev.nextAction) parts.push(next.nextAction ? `Próxima acción: ${next.nextAction}` : "Próxima acción eliminada");
  if (next.followUpAt !== undefined && toDateInput(next.followUpAt) !== toDateInput(prev.followUpAt))
    parts.push(next.followUpAt ? `Seguimiento: ${toDateInput(next.followUpAt)}` : "Seguimiento eliminado");
  if (next.ownerId !== undefined && next.ownerId !== prev.ownerId) parts.push(next.ownerId ? `Responsable: ${ownerName}` : "Responsable quitado");
  return parts;
}

/** Actualiza el seguimiento comercial. Devuelve la entrada resultante; no hace nada si no hay cambios. */
export function updateCrm(companyId: number, update: CrmUpdate, db: Db = getDb()): CrmEntry {
  const prev = ensureCrmEntry(companyId, db);
  const patch: Partial<CrmEntry> = {};

  if (update.status !== undefined) {
    if (!CRM_STATUSES.includes(update.status)) throw new Error(`Estado no válido: ${update.status}`);
    patch.status = update.status;
  }
  if (update.nextAction !== undefined) patch.nextAction = clean(update.nextAction);
  if (update.followUpAt !== undefined) patch.followUpAt = update.followUpAt;
  let ownerName: string | null = null;
  if (update.ownerId !== undefined) {
    if (update.ownerId !== null) {
      const owner = db.select().from(tables.members).where(eq(tables.members.id, update.ownerId)).get();
      if (!owner) throw new Error("Responsable no encontrado");
      ownerName = owner.name;
    }
    patch.ownerId = update.ownerId;
  }

  const finalStatus = patch.status ?? prev.status;
  if (patch.status && patch.status !== prev.status) {
    patch.statusChangedAt = new Date();
    if (patch.status === "contacted") patch.lastContactedAt = new Date();
  }
  if (finalStatus === "lost") {
    if (update.lostReason !== undefined) patch.lostReason = clean(update.lostReason);
  } else if (prev.lostReason || update.lostReason !== undefined) {
    patch.lostReason = null;
  }
  // Un trato cerrado no necesita seguimiento pendiente.
  if ((finalStatus === "won" || finalStatus === "lost") && update.followUpAt === undefined) patch.followUpAt = null;

  const changes = describeChange(prev, patch, ownerName);
  if (patch.lostReason && patch.lostReason !== prev.lostReason) changes.push(`Motivo: ${patch.lostReason}`);
  if (changes.length === 0) return prev;

  const saved = db.update(tables.crmEntries).set(patch).where(eq(tables.crmEntries.companyId, companyId)).returning().get();
  if (changes.length > 0) {
    logActivity({
      type: patch.status && patch.status !== prev.status ? "crm.status_changed" : "crm.updated",
      message: changes.join(" · "),
      companyId,
      actor: "usuario",
      meta: { from: prev.status, to: saved.status },
    });
  }
  return saved;
}

export function addNote(companyId: number, body: string, authorId?: number, db: Db = getDb()): CrmNote {
  const text = body.trim();
  if (!text) throw new Error("La nota no puede estar vacía");
  ensureCrmEntry(companyId, db);
  const note = db.insert(tables.crmNotes).values({ companyId, body: text.slice(0, 4000), authorId }).returning().get();
  logActivity({
    type: "crm.note_added",
    message: `Nota: ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`,
    companyId,
    actor: "usuario",
  });
  return { ...note, authorName: null };
}

export function listNotes(companyId: number, db: Db = getDb()): CrmNote[] {
  return db
    .select({ note: tables.crmNotes, authorName: tables.members.name })
    .from(tables.crmNotes)
    .leftJoin(tables.members, eq(tables.members.id, tables.crmNotes.authorId))
    .where(eq(tables.crmNotes.companyId, companyId))
    .orderBy(desc(tables.crmNotes.createdAt), desc(tables.crmNotes.id))
    .all()
    .map((r) => ({ ...r.note, authorName: r.authorName }));
}

/* ---------------- Pipeline y seguimientos ---------------- */

export interface PipelineCard {
  companyId: number;
  name: string;
  niche: string | null;
  city: string | null;
  score: number | null;
  scoreTier: "high" | "medium" | "low" | null;
  opportunityCount: number;
  status: CrmStatus;
  ownerName: string | null;
  nextAction: string | null;
  followUpAt: Date | null;
  statusChangedAt: Date;
}

export interface PipelineFilters {
  ownerId?: number;
  q?: string;
}

function cardsQuery(db: Db) {
  return db
    .select({
      companyId: tables.companies.id,
      name: tables.companies.name,
      niche: tables.companies.niche,
      city: tables.companies.city,
      score: tables.companies.score,
      scoreTier: tables.companies.scoreTier,
      opportunityCount: tables.companies.opportunityCount,
      status: tables.crmEntries.status,
      ownerName: tables.members.name,
      nextAction: tables.crmEntries.nextAction,
      followUpAt: tables.crmEntries.followUpAt,
      statusChangedAt: tables.crmEntries.statusChangedAt,
    })
    .from(tables.crmEntries)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.crmEntries.companyId))
    .leftJoin(tables.members, eq(tables.members.id, tables.crmEntries.ownerId));
}

export const PIPELINE_COLUMN_LIMIT = 30;

/** Empresas por estado (hasta `limit` tarjetas por columna) y el total real de cada estado. */
export function getPipeline(filters: PipelineFilters = {}, limit = PIPELINE_COLUMN_LIMIT, db: Db = getDb()) {
  const where = and(
    filters.ownerId ? eq(tables.crmEntries.ownerId, filters.ownerId) : undefined,
    filters.q?.trim() ? sql`${tables.companies.name} like ${`%${filters.q.trim()}%`}` : undefined,
  );
  const totals = new Map(
    db
      .select({ status: tables.crmEntries.status, n: sql<number>`count(*)` })
      .from(tables.crmEntries)
      .innerJoin(tables.companies, eq(tables.companies.id, tables.crmEntries.companyId))
      .where(where)
      .groupBy(tables.crmEntries.status)
      .all()
      .map((r) => [r.status, r.n]),
  );
  return CRM_STATUSES.map((status) => {
    const total = totals.get(status) ?? 0;
    const cards = total
      ? cardsQuery(db)
          .where(and(where, eq(tables.crmEntries.status, status)))
          .orderBy(sql`${tables.companies.score} desc nulls last`, desc(tables.crmEntries.statusChangedAt))
          .limit(limit)
          .all()
      : [];
    return { status, total, cards: cards as PipelineCard[] };
  });
}

/** Seguimientos con fecha en empresas abiertas: vencidos primero, luego los próximos `withinDays` días. */
export function listFollowUps(opts: { withinDays?: number; limit?: number; ownerId?: number } = {}, db: Db = getDb()): PipelineCard[] {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + (opts.withinDays ?? 7));
  horizon.setHours(23, 59, 59, 999);
  return cardsQuery(db)
    .where(
      and(
        isNotNull(tables.crmEntries.followUpAt),
        sql`${tables.crmEntries.followUpAt} <= ${horizon.getTime()}`,
        notInArray(tables.crmEntries.status, ["won", "lost"]),
        opts.ownerId ? eq(tables.crmEntries.ownerId, opts.ownerId) : undefined,
      ),
    )
    .orderBy(asc(tables.crmEntries.followUpAt))
    .limit(opts.limit ?? 50)
    .all() as PipelineCard[];
}

