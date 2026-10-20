import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seedReferenceData } from "@/server/seed";
import * as schema from "./schema";

const LOCK_ID = 727_001;

/**
 * Applies pending migrations and built-in reference data.
 * Uses a dedicated single connection so the session-level advisory lock is reliable.
 */
export async function migrateAndSeed(url: string, opts: { migrationsFolder?: string; defaultTimezone?: string } = {}) {
  const migrationsFolder = opts.migrationsFolder ?? path.join(process.cwd(), "drizzle");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  try {
    await db.execute(sql`select pg_advisory_lock(${LOCK_ID})`);
    try {
      await migrate(db, { migrationsFolder });
      await seedReferenceData(db, { defaultTimezone: opts.defaultTimezone });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${LOCK_ID})`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
