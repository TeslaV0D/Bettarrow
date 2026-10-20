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

/**
 * Compares the newest migration in ./drizzle/meta/_journal.json (bundled at build time) with the
 * migrations recorded in the database. Used by the web app when migrations run as a separate job.
 */
export async function getSchemaStatus(url: string): Promise<{ upToDate: boolean; expected: number; applied: number }> {
  const journal = (await import("../../../drizzle/meta/_journal.json")).default as { entries: { when: number }[] };
  const expected = journal.entries.length;
  const latest = Math.max(0, ...journal.entries.map((e) => e.when));
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [{ exists }] = await client<{ exists: boolean }[]>`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
    if (!exists) return { upToDate: expected === 0, expected, applied: 0 };
    const [row] = await client<{ applied: number; latest: string | null }[]>`
      select count(*)::int as applied, max(created_at)::text as latest from drizzle.__drizzle_migrations`;
    return { upToDate: Number(row.latest ?? 0) >= latest, expected, applied: row.applied };
  } finally {
    await client.end({ timeout: 5 });
  }
}
