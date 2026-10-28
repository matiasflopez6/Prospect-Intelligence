import type { CrmStatus, ServiceKey, ScoreTier } from "@/domain";

/** Filtros del listado de empresas (se serializan en la URL como search params). */
export interface CompanyFilters {
  q?: string; // nombre
  niche?: string;
  location?: string;
  scoreMin?: number;
  scoreMax?: number;
  tier?: ScoreTier;
  opportunitiesMin?: number;
  /** Tipo de oportunidad / problema detectado. */
  opportunityType?: string;
  service?: ServiceKey;
  crmStatus?: CrmStatus;
  ratingMin?: number;
  reviewsMin?: number;
  ownerId?: number;
  searchId?: number;
}

export type CompanySortKey = "score" | "name" | "rating" | "reviews" | "opportunities" | "createdAt";

export interface CompanyListQuery extends CompanyFilters {
  sort?: CompanySortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface CompanyListRow {
  id: number;
  name: string;
  niche: string | null;
  location: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  score: number | null;
  scoreTier: ScoreTier | null;
  opportunityCount: number;
  topServiceKey: string | null;
  crmStatus: CrmStatus;
  ownerName: string | null;
  nextAction: string | null;
  followUpAt: Date | null;
  analysisStatus: "pending" | "running" | "done" | "failed";
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
