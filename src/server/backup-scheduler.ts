import { env } from "@/server/env";

/**
 * Automatic JSON backups. Checks hourly whether the newest backup is older than
 * BACKUP_INTERVAL_HOURS and creates a new one if needed (BACKUP_INTERVAL_HOURS=0 disables).
 */
export function startBackupScheduler() {
  const hours = env.BACKUP_INTERVAL_HOURS;
  if (!hours) {
    console.log("[bettarrow] automatic backups disabled");
    return;
  }
  const g = globalThis as unknown as { __bettarrowBackupTimer?: ReturnType<typeof setInterval> };
  if (g.__bettarrowBackupTimer) return;

  const check = async () => {
    try {
      const { listBackups, createBackup, isAutomaticBackup } = await import("@/server/services/backups");
      const { db } = await import("@/server/db");
      const files = await listBackups(env.BACKUP_DIR);
      const newestAuto = files.find((f) => isAutomaticBackup(f.name));
      if (newestAuto && Date.now() - newestAuto.createdAt.getTime() < hours * 3_600_000) return;
      const b = await createBackup(db, env.BACKUP_DIR, { keep: env.BACKUP_KEEP });
      console.log(`[bettarrow] backup written: ${b.name} (${Math.round(b.size / 1024)} KB)`);
    } catch (err) {
      console.error("[bettarrow] automatic backup failed:", (err as Error).message);
    }
  };
  setTimeout(check, 60_000);
  g.__bettarrowBackupTimer = setInterval(check, 3_600_000);
  console.log(`[bettarrow] automatic backups every ${hours} h into ${env.BACKUP_DIR} (keep ${env.BACKUP_KEEP})`);
}
