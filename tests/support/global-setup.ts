import postgres from "postgres";
import { migrateAndSeed } from "../../src/server/db/migrate";
import { TEST_DATABASE_URL } from "./db";

/** Recreates the test schema from scratch and applies all migrations (also tests migrations). */
export default async function setup() {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  await migrateAndSeed(TEST_DATABASE_URL, { defaultTimezone: "Europe/Berlin" });
}
