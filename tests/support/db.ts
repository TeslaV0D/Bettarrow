import { sql } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import type { Db } from "../../src/server/db/types";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://bettarrow:bettarrow@localhost:5432/bettarrow_test";

let handle: { db: Db; close: () => Promise<void> } | null = null;

export function testDb(): Db {
  handle ??= createDb(TEST_DATABASE_URL, 4);
  return handle.db;
}

export async function closeTestDb() {
  await handle?.close();
  handle = null;
}

/** Removes all user data but keeps reference data (muscles, equipment, built-in exercises). */
export async function resetUserData(db: Db) {
  await db.execute(sql`
    truncate table workout_sets, workout_exercises, workouts, planned_entries, plan_rules,
      template_exercises, templates, body_weight_entries, auth_sessions restart identity cascade
  `);
  await db.execute(sql`delete from exercises where is_custom = true`);
  await db.execute(sql`update exercises set is_favorite = false, notes = null, archived_at = null`);
  await db.execute(sql`update settings set secondary_muscle_weight = 0.5, bodyweight_in_volume = true, timezone = 'Europe/Berlin', week_start = 1`);
}
