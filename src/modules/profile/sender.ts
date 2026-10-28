import { eq } from "drizzle-orm";
import { getDb, tables, type Db } from "@/lib/db";

/** Quién escribe: se usa para firmar los mensajes y como autor del informe. Persistido en `settings`. */
export interface SenderProfile {
  name?: string;
  agency?: string;
}

const KEY = "profile.sender";

export function getSenderProfile(db: Db = getDb()): SenderProfile {
  const row = db.select().from(tables.settings).where(eq(tables.settings.key, KEY)).get();
  const v = (row?.value ?? {}) as SenderProfile;
  return { name: v.name?.trim() || undefined, agency: v.agency?.trim() || undefined };
}

export function setSenderProfile(profile: SenderProfile, db: Db = getDb()): void {
  const value = { name: profile.name?.trim() ?? "", agency: profile.agency?.trim() ?? "" };
  db.insert(tables.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: tables.settings.key, set: { value, updatedAt: new Date() } })
    .run();
}
