import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import path from "node:path";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export function openDatabase(options: { url?: string; dataDir?: string } = {}) {
  if (options.url) {
    const client = new pg.Pool({ connectionString: options.url, max: 5 });
    const db = postgresDrizzle(client, { schema });
    return { db: db as Database, migrate: () => migratePostgres(db, { migrationsFolder: path.resolve("drizzle") }), close: () => client.end() };
  }
  const client = new PGlite(options.dataDir ?? "memory://");
  const db = pgliteDrizzle(client, { schema });
  return { db: db as Database, migrate: () => migratePglite(db, { migrationsFolder: path.resolve("drizzle") }), close: () => client.close() };
}
type Connection = ReturnType<typeof openDatabase>;
const globalDatabase = globalThis as typeof globalThis & { estimateDatabase?: Connection };
export function getConnection() {
  if (!globalDatabase.estimateDatabase) {
    if (!process.env.DATABASE_URL && !process.env.PGLITE_DATA_DIR) throw new Error("DB 설정이 없습니다. setup을 실행하세요.");
    globalDatabase.estimateDatabase = openDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DATA_DIR });
  }
  return globalDatabase.estimateDatabase;
}
