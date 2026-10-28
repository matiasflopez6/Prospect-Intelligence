import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "../config/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

interface DbHandle {
  sqlite: Database.Database;
  db: Db;
}

const globalForDb = globalThis as unknown as { __prospectDb?: DbHandle };

export function openDatabase(url: string, opts: { migrate?: boolean } = {}): DbHandle {
  if (url !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(url)), { recursive: true });
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  if (opts.migrate ?? true) {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  }
  return { sqlite, db };
}

/** Singleton de base de datos (sobrevive al HMR de Next). Aplica migraciones pendientes al abrir. */
export function getDb(): Db {
  if (!globalForDb.__prospectDb) {
    globalForDb.__prospectDb = openDatabase(getEnv().DATABASE_URL);
  }
  return globalForDb.__prospectDb.db;
}
