import { and, desc, eq } from "drizzle-orm";
import { opportunityPriority } from "@/domain/priority";
import { getDb, tables, type Db } from "@/lib/db";

/** Datos de la ficha que no pertenecen a otro módulo: redes, reseñas, procedencia, servicios y acciones. */
export function getProfileData(companyId: number, db: Db = getDb()) {
  const socials = db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, companyId)).all();
  const reviews = db
    .select()
    .from(tables.reviews)
    .where(eq(tables.reviews.companyId, companyId))
    .orderBy(desc(tables.reviews.publishedAt), desc(tables.reviews.id))
    .limit(8)
    .all();
  const sources = db.select().from(tables.companySources).where(eq(tables.companySources.companyId, companyId)).all();
  const crm = db.select().from(tables.crmEntries).where(eq(tables.crmEntries.companyId, companyId)).get();
  const owner = crm?.ownerId ? db.select().from(tables.members).where(eq(tables.members.id, crm.ownerId)).get() : undefined;
  const opportunities = db
    .select()
    .from(tables.opportunities)
    .where(and(eq(tables.opportunities.companyId, companyId), eq(tables.opportunities.status, "open")))
    .all()
    .sort((a, b) => opportunityPriority(b) - opportunityPriority(a));

  const followUpOverdue = Boolean(crm?.followUpAt && crm.followUpAt.getTime() < Date.now() && crm.status !== "won" && crm.status !== "lost");

  return { socials, reviews, sources, crm, owner, opportunities, followUpOverdue };
}

export type ProfileData = ReturnType<typeof getProfileData>;
