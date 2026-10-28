import { NextResponse } from "next/server";
import { getIntegrationStatuses } from "@/lib/config/integrations";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().run(sql`select 1`);
  } catch (e) {
    return NextResponse.json({ ok: false, db: String(e) }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    integrations: getIntegrationStatuses().map(({ id, configured, missingEnv }) => ({ id, configured, missingEnv })),
  });
}
