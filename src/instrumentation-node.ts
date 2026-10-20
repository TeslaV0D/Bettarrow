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
    // Development / single-container mode: migrate in-process (serialized by an advisory lock).
    const { migrateAndSeed } = await import("@/server/db/migrate");
    const started = Date.now();
    try {
      await migrateAndSeed(env.DATABASE_URL, { defaultTimezone: env.DEFAULT_TIMEZONE });
      log(`database ready (migrations + reference data, ${Date.now() - started} ms)`);
    } catch (err) {
      console.error("[bettarrow] database migration failed:", (err as Error).message);
      if (process.env.NODE_ENV === "production") process.exit(1);
    }
  } else {
    // Compose / Portainer: migrations run in the separate `migrate` job; only verify the result.
    const { getSchemaStatus } = await import("@/server/db/migrate");
    try {
      // After a host reboot the database may still be starting: retry for ~30 s.
      let status: Awaited<ReturnType<typeof getSchemaStatus>> | null = null;
      for (let attempt = 1; !status; attempt++) {
        try {
          status = await getSchemaStatus(env.DATABASE_URL);
        } catch (err) {
          if (attempt >= 15) throw err;
          log(`waiting for database (${(err as Error).message}) …`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!status.upToDate) {
        console.error(
          `[bettarrow] database schema is outdated (${status.applied}/${status.expected} migrations applied). ` +
            "Run the migrate job (docker compose run --rm migrate) or redeploy the stack.",
        );
        if (process.env.NODE_ENV === "production") process.exit(1);
      } else {
        log(`database schema up to date (${status.applied} migrations)`);
      }
    } catch (err) {
      console.error("[bettarrow] database not reachable:", (err as Error).message);
      if (process.env.NODE_ENV === "production") process.exit(1);
    }
  }

  const { startBackupScheduler } = await import("@/server/backup-scheduler");
  startBackupScheduler();
}
