"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { getSettings, getToday } from "@/server/queries/settings";
import { getCalendarRange } from "@/server/services/calendar";
import {
  deleteWorkout,
  discardWorkout,
  finishWorkout,
  loadPrefill,
  restoreDiscardedWorkout,
  startWorkout,
  type PrefillSource,
} from "@/server/services/workouts";
import { run, UserError } from "./_util";

const id = z.uuid("Ungültige ID");

function revalidateAll() {
  revalidatePath("/", "layout");
}

const startSchema = z.object({
  templateId: z.uuid().nullish(),
  plannedEntryId: z.string().max(100).nullish(),
  repeatWorkoutId: z.uuid().nullish(),
  name: z.string().trim().max(120).nullish(),
});

export async function startWorkoutAction(input: z.input<typeof startSchema>) {
  return run(async () => {
    const data = startSchema.parse(input);
    const settings = await getSettings();
    try {
      const res = await startWorkout(db, data, { timezone: settings.timezone });
      revalidateAll();
      return res;
    } catch (err) {
      if (err instanceof Error && /nicht gefunden|Ruhetag/.test(err.message)) throw new UserError(err.message);
      throw err;
    }
  });
}

export interface StartOptions {
  planned: { id: string; title: string; templateId: string | null }[];
  templates: { id: string; name: string; exerciseCount: number; lastUsed: string | null }[];
}

export async function getStartOptionsAction() {
  return run<StartOptions>(async () => {
    const today = await getToday();
    const [range, templates] = await Promise.all([
      getCalendarRange(db, today, today),
      db
        .select({
          id: s.templates.id,
          name: s.templates.name,
          exerciseCount: sql<number>`(select count(*)::int from ${s.templateExercises} te where te.template_id = "templates"."id")`,
          lastUsed: sql<string | null>`(select max(w.local_date)::text from ${s.workouts} w where w.template_id = "templates"."id" and w.status = 'completed')`,
        })
        .from(s.templates)
        .orderBy(sql`(select max(w.started_at) from ${s.workouts} w where w.template_id = "templates"."id" and w.status = 'completed') desc nulls last`, s.templates.name),
    ]);
    return {
      planned: range.entries
        .filter((e) => e.kind === "workout" && e.status === "planned")
        .map((e) => ({ id: e.id, title: e.title, templateId: e.templateId })),
      templates,
    };
  });
}

export async function finishWorkoutAction(workoutId: string, input: { notes?: string | null; incomplete?: "discard" | "complete" }) {
  return run(async () => {
    const wid = id.parse(workoutId);
    const opts = z
      .object({ notes: z.string().max(5000).nullish(), incomplete: z.enum(["discard", "complete"]).default("discard") })
      .parse(input);
    const res = await finishWorkout(db, wid, { notes: opts.notes ?? null, incomplete: opts.incomplete });
    if (!res.ok) throw new UserError(res.reason === "not_found" ? "Training nicht gefunden." : "Dieses Training ist bereits abgeschlossen.");
    revalidateAll();
    return { id: wid };
  });
}

export async function discardWorkoutAction(workoutId: string) {
  return run(async () => {
    const ok = await discardWorkout(db, id.parse(workoutId));
    if (!ok) throw new UserError("Training konnte nicht verworfen werden.");
    revalidateAll();
  });
}

export async function restoreWorkoutAction(workoutId: string) {
  return run(async () => {
    const ok = await restoreDiscardedWorkout(db, id.parse(workoutId));
    if (!ok) throw new UserError("Wiederherstellen nicht möglich – es läuft bereits ein anderes Training.");
    revalidateAll();
  });
}

export async function deleteWorkoutAction(workoutId: string) {
  return run(async () => {
    const ok = await deleteWorkout(db, id.parse(workoutId));
    if (!ok) throw new UserError("Training nicht gefunden.");
    revalidateAll();
  });
}

/** Previous values for exercises added in the live editor (one request for all exercises). */
export async function getPrefillAction(exerciseIds: string[], workoutId: string) {
  return run<Record<string, PrefillSource>>(async () => {
    const ids = z.array(z.string().min(1).max(120)).max(60).parse(exerciseIds);
    const wid = id.parse(workoutId);
    const [w] = await db.select({ startedAt: s.workouts.startedAt, status: s.workouts.status }).from(s.workouts).where(eq(s.workouts.id, wid)).limit(1);
    const map = await loadPrefill(db, ids, { excludeWorkoutId: wid, before: w?.status === "completed" ? w.startedAt : undefined });
    return Object.fromEntries(map);
  });
}
