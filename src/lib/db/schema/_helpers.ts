import { integer } from "drizzle-orm/sqlite-core";

export const id = () => integer("id").primaryKey({ autoIncrement: true });

export const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
