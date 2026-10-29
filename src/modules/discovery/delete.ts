import fs from "node:fs/promises";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb, tables, type Db } from "@/lib/db";
import { resolveReportPath } from "../reports/pdf";

/** Estados CRM sin trabajo comercial: la empresa solo fue descubierta (y quizá analizada). */
const UNTOUCHED_STATUSES = ["new", "analyzed"];
const CHUNK = 500;

export interface SearchDeletionPlan {
  searchId: number;
  niche: string;
  location: string;
  /** La búsqueda sigue en cola o ejecutándose: se cancelará. */
  active: boolean;
  /** Empresas vinculadas a la búsqueda. */
  total: number;
  /** Se borrarán con sus análisis, oportunidades, puntuaciones, informes y mensajes en borrador. */
  removeIds: number[];
  /** Se conservan porque otra búsqueda también las encontró. */
  keepShared: number;
  /** Se conservan porque tienen trabajo comercial (estado CRM avanzado, notas, responsable, seguimiento, mensajes aprobados/enviados). */
  keepWorked: number;
}

export interface SearchDeletionResult {
  searchId: number;
  removedCompanies: number;
  keptCompanies: number;
  wasActive: boolean;
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Decide, para cada empresa de la búsqueda, si se borra o se conserva. Solo lee. */
export function planSearchDeletion(searchId: number, db: Db = getDb()): SearchDeletionPlan | undefined {
  const search = db.select().from(tables.searches).where(eq(tables.searches.id, searchId)).get();
  if (!search) return undefined;

  const companyIds = db
    .select({ id: tables.searchCompanies.companyId })
    .from(tables.searchCompanies)
    .where(eq(tables.searchCompanies.searchId, searchId))
    .all()
    .map((r) => r.id);

  const plan: SearchDeletionPlan = {
    searchId,
    niche: search.niche,
    location: search.location,
    active: search.status === "queued" || search.status === "running",
    total: companyIds.length,
    removeIds: [],
    keepShared: 0,
    keepWorked: 0,
  };

  for (const companyId of companyIds) {
    const otherSearches = db
      .select({ n: count() })
      .from(tables.searchCompanies)
      .where(and(eq(tables.searchCompanies.companyId, companyId), ne(tables.searchCompanies.searchId, searchId)))
      .get()?.n ?? 0;
    if (otherSearches > 0) {
      plan.keepShared++;
      continue;
    }
    if (hasCommercialWork(db, companyId)) plan.keepWorked++;
    else plan.removeIds.push(companyId);
  }
  return plan;
}

function hasCommercialWork(db: Db, companyId: number): boolean {
  const crm = db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, companyId)).get();
  if (crm && (!UNTOUCHED_STATUSES.includes(crm.status) || crm.ownerId || crm.nextAction || crm.followUpAt || crm.lastContactedAt)) return true;
  const notes = db.select({ n: count() }).from(tables.crmNotes).where(eq(tables.crmNotes.companyId, companyId)).get()?.n ?? 0;
  if (notes > 0) return true;
  const used = db
    .select({ n: count() })
    .from(tables.messages)
    .where(and(eq(tables.messages.companyId, companyId), ne(tables.messages.status, "draft")))
    .get()?.n ?? 0;
  return used > 0;
}

/**
 * Borra una búsqueda y sus vínculos. Las empresas que solo encontró esta búsqueda y no tienen trabajo
 * comercial se borran con todo lo derivado (análisis, evidencias, oportunidades, puntuaciones, mensajes en
 * borrador, informes y sus PDF); el resto se conserva intacto. Los trabajos pendientes de la búsqueda se
 * cancelan; uno en ejecución detecta que la búsqueda ya no existe y se detiene sin guardar nada.
 */
export async function deleteSearch(searchId: number, db: Db = getDb()): Promise<SearchDeletionResult | undefined> {
  const pdfPaths: string[] = [];
  let removedIds: number[] = [];

  const plan = db.transaction((tx) => {
    const p = planSearchDeletion(searchId, tx as unknown as Db);
    if (!p) return undefined;
    removedIds = p.removeIds;

    for (const ids of chunks(p.removeIds)) {
      pdfPaths.push(
        ...tx
          .select({ path: tables.reports.pdfPath })
          .from(tables.reports)
          .where(inArray(tables.reports.companyId, ids))
          .all()
          .flatMap((r) => (r.path ? [r.path] : [])),
      );
    }

    // Lo que se conserva (trabajos de análisis, línea de tiempo) se desvincula para que no caiga con la búsqueda.
    tx.update(tables.jobs).set({ searchId: null }).where(and(eq(tables.jobs.searchId, searchId), isNotNull(tables.jobs.companyId))).run();
    tx.update(tables.activityLog).set({ searchId: null }).where(and(eq(tables.activityLog.searchId, searchId), isNotNull(tables.activityLog.companyId))).run();

    for (const ids of chunks(p.removeIds)) tx.delete(tables.companies).where(inArray(tables.companies.id, ids)).run();
    // Cascada: search_companies, trabajos (incluido el de descubrimiento) y actividad sin empresa.
    tx.delete(tables.searches).where(eq(tables.searches.id, searchId)).run();

    tx.insert(tables.activityLog)
      .values({
        type: "search.deleted",
        message: `Búsqueda borrada: ${p.niche} en ${p.location} (${p.removeIds.length} empresas eliminadas, ${p.total - p.removeIds.length} conservadas)`,
        meta: { removed: p.removeIds.length, kept: p.total - p.removeIds.length },
      })
      .run();
    return p;
  });
  if (!plan) return undefined;

  await removeReportFiles(removedIds, pdfPaths);
  return { searchId, removedCompanies: removedIds.length, keptCompanies: plan.total - removedIds.length, wasActive: plan.active };
}

/** Borra los PDF (y la carpeta por empresa) de las empresas eliminadas. Un fallo de disco no deshace el borrado. */
async function removeReportFiles(companyIds: number[], pdfPaths: string[]): Promise<void> {
  const targets = [...pdfPaths, ...companyIds.map(String)];
  await Promise.all(
    targets.map(async (relative) => {
      try {
        await fs.rm(resolveReportPath(relative), { recursive: true, force: true });
      } catch (e) {
        console.error(`[discovery] No se pudo borrar el informe ${relative}:`, e);
      }
    }),
  );
}
