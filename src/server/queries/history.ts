import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { setVolumeSql } from "@/server/services/stats";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { getWorkoutDetail, getWorkoutPRs, type WorkoutDetail, type WorkoutPr } from "@/server/services/workouts";
import { attributeToMuscles, isWorkingSet, setVolume, workoutDurationSeconds, workoutTotals, type MuscleContribution } from "@/lib/training";
import type { YMD } from "@/lib/dates";
import { getSettings } from "./settings";

export const workingSetSql = sql`(${s.workoutSets.completed} and ${s.workoutSets.setType} <> 'warmup')`;

export interface HistoryItem {
  id: string;
  name: string;
  localDate: YMD;
  startedAt: Date;
  durationSeconds: number;
  exerciseCount: number;
  workingSets: number;
  volumeKg: number;
  exerciseIds: string[];
}

/** Completed workouts with aggregated totals (one query for totals, one for exercise ids). */
export async function listHistory(opts: { from?: YMD | null; to?: YMD | null; limit?: number; offset?: number } = {}): Promise<HistoryItem[]> {
  const settings = await getSettings();
  const conds = [eq(s.workouts.status, "completed")];
  if (opts.from) conds.push(gte(s.workouts.localDate, opts.from));
  if (opts.to) conds.push(lte(s.workouts.localDate, opts.to));
  const workouts = await db
    .select({
      id: s.workouts.id,
      name: s.workouts.name,
      localDate: s.workouts.localDate,
      startedAt: s.workouts.startedAt,
      endedAt: s.workouts.endedAt,
      pausedAt: s.workouts.pausedAt,
      pausedSeconds: s.workouts.pausedSeconds,
    })
    .from(s.workouts)
    .where(and(...conds))
    .orderBy(desc(s.workouts.startedAt))
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0);
  if (workouts.length === 0) return [];
  const ids = workouts.map((w) => w.id);
  const agg = await db
    .select({
      workoutId: s.workoutExercises.workoutId,
      exerciseId: s.workoutExercises.exerciseId,
      position: s.workoutExercises.position,
      workingSets: sql<number>`count(*) filter (where ${workingSetSql})::int`,
      volume: sql<number>`coalesce(sum(${setVolumeSql(settings.bodyweightInVolume)}), 0)::float8`,
    })
    .from(s.workoutExercises)
    .leftJoin(s.workoutSets, eq(s.workoutSets.workoutExerciseId, s.workoutExercises.id))
    .where(inArray(s.workoutExercises.workoutId, ids))
    .groupBy(s.workoutExercises.workoutId, s.workoutExercises.id, s.workoutExercises.exerciseId, s.workoutExercises.position);
  const byWorkout = new Map<string, typeof agg>();
  for (const a of agg) byWorkout.set(a.workoutId, [...(byWorkout.get(a.workoutId) ?? []), a]);
  return workouts.map((w) => {
    const rows = (byWorkout.get(w.id) ?? []).sort((a, b) => a.position - b.position);
    return {
      id: w.id,
      name: w.name,
      localDate: w.localDate,
      startedAt: w.startedAt,
      durationSeconds: workoutDurationSeconds(w),
      exerciseCount: rows.length,
      workingSets: rows.reduce((x, r) => x + r.workingSets, 0),
      volumeKg: Math.round(rows.reduce((x, r) => x + r.volume, 0) * 10) / 10,
      exerciseIds: rows.map((r) => r.exerciseId),
    };
  });
}

export interface WorkoutSummary {
  workout: WorkoutDetail;
  durationSeconds: number;
  totals: ReturnType<typeof workoutTotals>;
  prs: WorkoutPr[];
  muscles: { muscleId: string; contribution: MuscleContribution }[];
  perExercise: { id: string; workingSets: number; volumeKg: number; incomplete: boolean }[];
}

export async function getWorkoutSummary(id: string): Promise<WorkoutSummary | null> {
  const [workout, settings] = await Promise.all([getWorkoutDetail(db, id), getSettings()]);
  if (!workout || workout.status === "discarded") return null;
  const exerciseIds = [...new Set(workout.exercises.map((e) => e.exerciseId))];
  const [prs, exRows, secRows] = await Promise.all([
    workout.status === "completed" ? getWorkoutPRs(db, workout) : Promise.resolve([]),
    exerciseIds.length ? db.select({ id: s.exercises.id, primary: s.exercises.primaryMuscleId }).from(s.exercises).where(inArray(s.exercises.id, exerciseIds)) : [],
    exerciseIds.length ? db.select().from(s.exerciseSecondaryMuscles).where(inArray(s.exerciseSecondaryMuscles.exerciseId, exerciseIds)) : [],
  ]);
  const opts = (e: WorkoutDetail["exercises"][number]) => ({ tracking: e.tracking, loadMode: e.loadMode, bodyweightInVolume: settings.bodyweightInVolume });
  const totals = workoutTotals(workout.exercises.map((e) => ({ ...opts(e), sets: e.sets })));
  const perExercise = workout.exercises.map((e) => {
    const t = workoutTotals([{ ...opts(e), sets: e.sets }]);
    return { id: e.id, workingSets: t.workingSets, volumeKg: t.volumeKg, incomplete: t.volumeIncomplete };
  });
  const primary = new Map(exRows.map((r) => [r.id, r.primary]));
  const sec = new Map<string, string[]>();
  for (const r of secRows) sec.set(r.exerciseId, [...(sec.get(r.exerciseId) ?? []), r.muscleId]);
  const contributions = attributeToMuscles(
    workout.exercises.map((e) => ({
      primaryMuscleId: primary.get(e.exerciseId) ?? "unknown",
      secondaryMuscleIds: sec.get(e.exerciseId) ?? [],
      workingSets: e.sets.filter((x) => isWorkingSet(x)).length,
      volumeKg: e.sets.reduce((a, x) => a + (setVolume(x, opts(e)) ?? 0), 0),
    })),
  );
  const muscles = [...contributions.entries()]
    .map(([muscleId, contribution]) => ({ muscleId, contribution }))
    .sort((a, b) => b.contribution.directSets + b.contribution.indirectSets * 0.5 - (a.contribution.directSets + a.contribution.indirectSets * 0.5));
  return { workout, durationSeconds: workoutDurationSeconds(workout), totals, prs, muscles, perExercise };
}
