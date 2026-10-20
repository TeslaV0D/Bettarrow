import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { env } from "@/server/env";
import { listBackups } from "@/server/services/backups";

export async function getBodyweightEntries() {
  return db.select().from(s.bodyWeightEntries).orderBy(asc(s.bodyWeightEntries.date));
}

export async function getBackups() {
  return { dir: env.BACKUP_DIR, interval: env.BACKUP_INTERVAL_HOURS, keep: env.BACKUP_KEEP, files: await listBackups(env.BACKUP_DIR) };
}
