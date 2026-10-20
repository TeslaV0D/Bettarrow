"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { env } from "@/server/env";
import { bodyweightSchema, profileSchema, settingsSchema, type ProfileInput, type SettingsInput } from "@/lib/settings-schema";
import { createBackup, readBackup } from "@/server/services/backups";
import { importData, validateExport } from "@/server/services/data-transfer";
import { getToday } from "@/server/queries/settings";
import { run, UserError } from "./_util";

export async function updateProfileAction(input: ProfileInput) {
  return run(async () => {
    const data = profileSchema.parse(input);
    await db.update(s.profile).set({ ...data, updatedAt: new Date() }).where(eq(s.profile.id, 1));
    revalidatePath("/", "layout");
  });
}

export async function updateSettingsAction(input: SettingsInput) {
  return run(async () => {
    const data = settingsSchema.parse(input);
    await db.update(s.settings).set({ ...data, updatedAt: new Date() }).where(eq(s.settings.id, 1));
    revalidatePath("/", "layout");
  });
}

/** Adds or replaces the entry of a day (one entry per day). Old entries are never changed implicitly. */
export async function saveBodyweightAction(input: { date: string; weightKg: number; note?: string | null }) {
  return run(async () => {
    const data = bodyweightSchema.parse(input);
    if (data.date > (await getToday())) throw new UserError("Einträge in der Zukunft sind nicht möglich.");
    await db
      .insert(s.bodyWeightEntries)
      .values(data)
      .onConflictDoUpdate({ target: s.bodyWeightEntries.date, set: { weightKg: data.weightKg, note: data.note, updatedAt: new Date() } });
    revalidatePath("/", "layout");
  });
}

export async function deleteBodyweightAction(id: string) {
  return run(async () => {
    const [row] = await db.delete(s.bodyWeightEntries).where(eq(s.bodyWeightEntries.id, z.uuid().parse(id))).returning();
    if (!row) throw new UserError("Eintrag nicht gefunden");
    revalidatePath("/", "layout");
    return { date: row.date, weightKg: row.weightKg, note: row.note };
  });
}

export async function createBackupAction() {
  return run(async () => {
    try {
      const b = await createBackup(db, env.BACKUP_DIR, { keep: env.BACKUP_KEEP, label: "manuell" });
      revalidatePath("/profile");
      return { name: b.name };
    } catch (err) {
      console.error("[backup] failed:", err);
      throw new UserError(`Backup konnte nicht geschrieben werden (${env.BACKUP_DIR} beschreibbar?).`);
    }
  });
}

/** Restores a backup from BACKUP_DIR (creates a safety backup first). */
export async function restoreBackupAction(name: string, confirm: string) {
  return run(async () => {
    if (confirm !== "ERSETZEN") throw new UserError("Bitte zur Bestätigung ERSETZEN eingeben.");
    let raw: unknown;
    try {
      raw = await readBackup(env.BACKUP_DIR, name);
    } catch {
      throw new UserError("Backup-Datei nicht lesbar.");
    }
    const v = validateExport(raw);
    if (!v.ok) throw new UserError(`Backup ungültig: ${v.errors[0]}`);
    await createBackup(db, env.BACKUP_DIR, { keep: env.BACKUP_KEEP, label: "vor-import" });
    await importData(db, v.data);
    revalidatePath("/", "layout");
    return v.summary;
  });
}
