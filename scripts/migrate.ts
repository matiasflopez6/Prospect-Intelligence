import { openDatabase } from "../src/lib/db/client";

const url = process.env.DATABASE_URL ?? "./data/prospect.db";
const { sqlite } = openDatabase(url);
sqlite.close();
console.log(`Migraciones aplicadas en ${url}`);
