import "server-only";
import { cache } from "react";
import { desc, eq, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { bodyWeightEntries, profile, settings } from "@/server/db/schema";
import { env } from "@/server/env";
import { todayIn, type YMD } from "@/lib/dates";

export type Settings = typeof settings.$inferSelect;
export type Profile = typeof profile.$inferSelect;

export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(settings)
    .values({ id: 1, timezone: env.DEFAULT_TIMEZONE })
    .onConflictDoUpdate({ target: settings.id, set: { id: 1 } })
    .returning();
  return created;
});

export const getProfile = cache(async (): Promise<Profile> => {
  const [row] = await db.select().from(profile).where(eq(profile.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(profile).values({ id: 1 }).onConflictDoUpdate({ target: profile.id, set: { id: 1 } }).returning();
  return created;
});

export async function getToday(): Promise<YMD> {
  const s = await getSettings();
  return todayIn(s.timezone);
}

/** Latest bodyweight entry on or before `date` (defaults to the latest overall). */
export async function getBodyweightAt(date?: YMD): Promise<{ date: YMD; weightKg: number } | null> {
  const q = db
    .select({ date: bodyWeightEntries.date, weightKg: bodyWeightEntries.weightKg })
    .from(bodyWeightEntries)
    .orderBy(desc(bodyWeightEntries.date))
    .limit(1);
  const [row] = date ? await q.where(lte(bodyWeightEntries.date, date)) : await q;
  return row ?? null;
}
