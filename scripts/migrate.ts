/*
 * Controlled database migration job.
 * - Docker/Portainer: runs once as the `migrate` service before the web app starts
 *   (node /app/migrate.mjs, bundled with esbuild during the image build).
 * - Development: `npm run db:migrate`.
 * Applies pending SQL migrations from ./drizzle and the built-in reference data under a PostgreSQL
 * advisory lock, so concurrent runs are serialized. Exits non-zero on failure.
 */
import postgres from "postgres";
import { migrateAndSeed } from "../src/server/db/migrate";
import { resolveDatabaseUrl } from "../src/server/database-url";

const url = resolveDatabaseUrl();
const log = (msg: string) => console.log(`[migrate] ${msg}`);

async function waitForDatabase(attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await sql`select 1`;
      return;
    } catch (err) {
      if (i === attempts) throw err;
      log(`database not reachable yet (${(err as Error).message}), retry ${i}/${attempts} …`);
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
}

async function main() {
  const started = Date.now();
  await waitForDatabase();
  await migrateAndSeed(url, { defaultTimezone: process.env.DEFAULT_TIMEZONE, migrationsFolder: process.env.MIGRATIONS_DIR });
  log(`database is up to date (${Date.now() - started} ms)`);
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
