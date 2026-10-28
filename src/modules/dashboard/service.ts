import { count, eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

export interface DashboardCounts {
  companies: number;
  analyzed: number;
  searches: number;
}

/**
 * Conteos mínimos reales para el shell. TODO(sesión CRM/dashboard/filtros): reemplazar por el
 * dashboard completo (prioritarias, distribución de scores, problemas más habituales, servicios,
 * pipeline, actividad reciente).
 */
export function getDashboardCounts(): DashboardCounts {
  const db = getDb();
  const companies = db.select({ n: count() }).from(tables.companies).get()?.n ?? 0;
  const searches = db.select({ n: count() }).from(tables.searches).get()?.n ?? 0;
  const analyzed =
    db.select({ n: count() }).from(tables.companies).where(eq(tables.companies.analysisStatus, "done")).get()?.n ?? 0;
  return { companies, analyzed, searches };
}
