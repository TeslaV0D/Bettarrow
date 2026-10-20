import "server-only";
import { cache } from "react";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import type { CatalogExercise, MuscleRef, NamedRef } from "@/lib/exercise-search";

export interface ReferenceData {
  muscles: MuscleRef[];
  equipment: NamedRef[];
  patterns: NamedRef[];
}

export const getReferenceData = cache(async (): Promise<ReferenceData> => {
  const [muscles, equipment, patterns] = await Promise.all([
    db
      .select({ id: s.muscleGroups.id, name: s.muscleGroups.name, parentId: s.muscleGroups.parentId, region: s.muscleGroups.region })
      .from(s.muscleGroups)
      .orderBy(asc(s.muscleGroups.sortOrder), asc(s.muscleGroups.name)),
    db
      .select({ id: s.equipment.id, name: s.equipment.name, category: s.equipment.category })
      .from(s.equipment)
      .orderBy(asc(s.equipment.sortOrder), asc(s.equipment.name)),
    db.select({ id: s.movementPatterns.id, name: s.movementPatterns.name }).from(s.movementPatterns).orderBy(asc(s.movementPatterns.sortOrder), asc(s.movementPatterns.name)),
  ]);
  return { muscles, equipment, patterns };
});

const usage = db
  .select({
    exerciseId: s.workoutExercises.exerciseId,
    lastUsed: sql<string>`max(${s.workouts.localDate})::text`.as("last_used"),
    useCount: sql<number>`count(distinct ${s.workouts.id})::int`.as("use_count"),
  })
  .from(s.workoutExercises)
  .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
  .where(eq(s.workouts.status, "completed"))
  .groupBy(s.workoutExercises.exerciseId)
  .as("usage");

/** Full exercise catalog with secondary muscles and usage stats (3 queries, no N+1). */
export const getCatalog = cache(async (): Promise<CatalogExercise[]> => {
  const [rows, secondary] = await Promise.all([
    db
      .select({
        id: s.exercises.id,
        name: s.exercises.name,
        aliases: s.exercises.aliases,
        description: s.exercises.description,
        primaryMuscleId: s.exercises.primaryMuscleId,
        equipmentId: s.exercises.equipmentId,
        movementPatternId: s.exercises.movementPatternId,
        mechanic: s.exercises.mechanic,
        tracking: s.exercises.tracking,
        loadMode: s.exercises.loadMode,
        bodyweightFactor: s.exercises.bodyweightFactor,
        repMin: s.exercises.repMin,
        repMax: s.exercises.repMax,
        restSeconds: s.exercises.restSeconds,
        isCustom: s.exercises.isCustom,
        isFavorite: s.exercises.isFavorite,
        archivedAt: s.exercises.archivedAt,
        lastUsed: usage.lastUsed,
        useCount: usage.useCount,
      })
      .from(s.exercises)
      .leftJoin(usage, eq(usage.exerciseId, s.exercises.id))
      .orderBy(asc(s.exercises.name)),
    db.select().from(s.exerciseSecondaryMuscles),
  ]);
  const sec = new Map<string, string[]>();
  for (const r of secondary) {
    const list = sec.get(r.exerciseId) ?? [];
    list.push(r.muscleId);
    sec.set(r.exerciseId, list);
  }
  return rows.map(({ archivedAt, ...r }) => ({
    ...r,
    mechanic: r.mechanic as CatalogExercise["mechanic"],
    tracking: r.tracking as CatalogExercise["tracking"],
    loadMode: r.loadMode as CatalogExercise["loadMode"],
    secondaryMuscleIds: sec.get(r.id) ?? [],
    archived: archivedAt != null,
    lastUsed: r.lastUsed ?? null,
    useCount: r.useCount ?? 0,
  }));
});

export type ExerciseRecord = typeof s.exercises.$inferSelect & { secondaryMuscleIds: string[] };

export async function getExercise(id: string): Promise<ExerciseRecord | null> {
  const [row] = await db.select().from(s.exercises).where(eq(s.exercises.id, id)).limit(1);
  if (!row) return null;
  const sec = await db.select({ muscleId: s.exerciseSecondaryMuscles.muscleId }).from(s.exerciseSecondaryMuscles).where(eq(s.exerciseSecondaryMuscles.exerciseId, id));
  return { ...row, secondaryMuscleIds: sec.map((x) => x.muscleId) };
}

/** Recently used exercise ids (most recent first). */
export async function getRecentExerciseIds(limit = 12): Promise<string[]> {
  const rows = await db
    .select({ exerciseId: s.workoutExercises.exerciseId })
    .from(s.workoutExercises)
    .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
    .where(inArray(s.workouts.status, ["completed", "active"]))
    .groupBy(s.workoutExercises.exerciseId)
    .orderBy(desc(sql`max(${s.workouts.startedAt})`))
    .limit(limit);
  return rows.map((r) => r.exerciseId);
}

/** Usage of an exercise in templates and workouts (decides between delete and archive). */
export async function getExerciseUsage(id: string): Promise<{ templates: number; workouts: number }> {
  const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(s.templateExercises).where(eq(s.templateExercises.exerciseId, id));
  const [w] = await db.select({ n: sql<number>`count(*)::int` }).from(s.workoutExercises).where(eq(s.workoutExercises.exerciseId, id));
  return { templates: t.n, workouts: w.n };
}
