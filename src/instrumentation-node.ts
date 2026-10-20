/**
 * Node.js-only startup tasks (imported from instrumentation.ts): validates configuration, applies
 * database migrations + reference data, and schedules automatic backups. If migrations fail, the
 * process exits so the container restarts instead of serving a half-migrated app.
 */
export async function startup() {
  const { env, assertProductionEnv } = await import("@/server/env");
  const log = (msg: string) => console.log(`[bettarrow] ${msg}`);

  try {
    assertProductionEnv();
  } catch (err) {
    console.error(`[bettarrow] configuration error: ${(err as Error).message}`);
    if (process.env.NODE_ENV === "production") process.exit(1);
  }

  if (env.MIGRATE_ON_START) {
    const { migrateAndSeed } = await import("@/server/db/migrate");
    const started = Date.now();
    try {
      await migrateAndSeed(env.DATABASE_URL, { defaultTimezone: env.DEFAULT_TIMEZONE });
      log(`database ready (migrations + reference data, ${Date.now() - started} ms)`);
    } catch (err) {
      console.error("[bettarrow] database migration failed:", (err as Error).message);
      if (process.env.NODE_ENV === "production") process.exit(1);
    }
  }

  const { startBackupScheduler } = await import("@/server/backup-scheduler");
  startBackupScheduler();
}
