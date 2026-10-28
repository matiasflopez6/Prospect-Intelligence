import { desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import type { ScoreComponent } from "./types";

export interface ScoreView {
  id: number;
  total: number;
  tier: "high" | "medium" | "low";
  confidence: number;
  components: ScoreComponent[];
  methodVersion: string;
  createdAt: Date;
  /** Puntuación del análisis anterior (si existe), para mostrar la evolución. */
  previousTotal: number | null;
}

export function getLatestScore(companyId: number): ScoreView | undefined {
  const rows = getDb().select().from(tables.scores).where(eq(tables.scores.companyId, companyId)).orderBy(desc(tables.scores.id)).limit(2).all();
  const latest = rows[0];
  if (!latest) return undefined;
  return {
    id: latest.id,
    total: latest.total,
    tier: latest.tier,
    confidence: latest.confidence,
    components: latest.components as ScoreComponent[],
    methodVersion: latest.methodVersion,
    createdAt: latest.createdAt,
    previousTotal: rows[1]?.total ?? null,
  };
}
