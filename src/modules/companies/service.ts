import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { NotImplementedError } from "@/lib/errors";
import type { CompanyListQuery, CompanyListRow, Page } from "./types";

export type Company = typeof tables.companies.$inferSelect;

export function getCompany(id: number): Company | undefined {
  return getDb().select().from(tables.companies).where(eq(tables.companies.id, id)).get();
}

/**
 * Listado con búsqueda y filtros (nombre, nicho, ubicación, score, nº de oportunidades,
 * problema, servicio, estado CRM, valoración, reseñas), orden y paginación.
 * TODO(sesión CRM/dashboard/filtros).
 */
export function listCompanies(_query: CompanyListQuery): Page<CompanyListRow> {
  throw new NotImplementedError("companies/service → listCompanies");
}
