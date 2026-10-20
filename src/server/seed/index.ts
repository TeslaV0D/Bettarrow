import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { ARMS, BACK, CHEST, SHOULDERS } from "./exercises-upper";
import { CORE, LEGS } from "./exercises-lower";
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from "./reference";
import type { SeedExercise } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export const BUILTIN_EXERCISES: SeedExercise[] = [...CHEST, ...BACK, ...SHOULDERS, ...ARMS, ...LEGS, ...CORE];

/**
 * Idempotently installs/updates built-in reference data.
 * Built-in exercises the user edited (is_modified) are left untouched; user fields such as
 * favorites, notes and archive state are never overwritten.
 */
export async function seedReferenceData(db: Db, opts: { defaultTimezone?: string } = {}) {
  await db.transaction(async (tx) => {
    // Parents first because of the self reference.
    const muscles = [...MUSCLE_GROUPS].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    for (const [i, m] of muscles.entries()) {
      const sortOrder = MUSCLE_GROUPS.findIndex((x) => x.id === m.id);
      void i;
      await tx
        .insert(s.muscleGroups)
        .values({ id: m.id, name: m.name, parentId: m.parentId, region: m.region, sortOrder, isBuiltin: true })
        .onConflictDoUpdate({
          target: s.muscleGroups.id,
          set: { name: m.name, parentId: m.parentId, region: m.region, sortOrder },
        });
    }
    await tx
      .insert(s.equipment)
      .values(EQUIPMENT.map((e, i) => ({ ...e, sortOrder: i, isBuiltin: true })))
      .onConflictDoUpdate({
        target: s.equipment.id,
        set: { name: sql`excluded.name`, category: sql`excluded.category`, sortOrder: sql`excluded.sort_order` },
      });
    await tx
      .insert(s.movementPatterns)
      .values(MOVEMENT_PATTERNS.map((p, i) => ({ ...p, sortOrder: i, isBuiltin: true })))
      .onConflictDoUpdate({
        target: s.movementPatterns.id,
        set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
      });

    const rows = BUILTIN_EXERCISES.map((e) => ({
      id: e.id,
      name: e.name,
      aliases: e.aliases ?? [],
      description: e.description,
      instructions: e.cues.join("\n"),
      primaryMuscleId: e.primary,
      equipmentId: e.equipment,
      movementPatternId: e.pattern ?? null,
      mechanic: e.mechanic,
      tracking: e.tracking ?? "reps",
      loadMode: e.load ?? "external",
      bodyweightFactor: e.factor ?? 1,
      repMin: e.reps?.[0] ?? null,
      repMax: e.reps?.[1] ?? null,
      restSeconds: e.rest ?? null,
      isCustom: false,
    }));
    await tx
      .insert(s.exercises)
      .values(rows)
      .onConflictDoUpdate({
        target: s.exercises.id,
        set: {
          name: sql`excluded.name`,
          aliases: sql`excluded.aliases`,
          description: sql`excluded.description`,
          instructions: sql`excluded.instructions`,
          primaryMuscleId: sql`excluded.primary_muscle_id`,
          equipmentId: sql`excluded.equipment_id`,
          movementPatternId: sql`excluded.movement_pattern_id`,
          mechanic: sql`excluded.mechanic`,
          tracking: sql`excluded.tracking`,
          loadMode: sql`excluded.load_mode`,
          bodyweightFactor: sql`excluded.bodyweight_factor`,
          repMin: sql`excluded.rep_min`,
          repMax: sql`excluded.rep_max`,
          restSeconds: sql`excluded.rest_seconds`,
        },
        setWhere: sql`${s.exercises.isCustom} = false and ${s.exercises.isModified} = false`,
      });

    const unmodified = await tx
      .select({ id: s.exercises.id })
      .from(s.exercises)
      .where(
        and(
          eq(s.exercises.isCustom, false),
          eq(s.exercises.isModified, false),
          inArray(s.exercises.id, BUILTIN_EXERCISES.map((e) => e.id)),
        ),
      );
    const ids = new Set(unmodified.map((r) => r.id));
    if (ids.size > 0) {
      await tx.delete(s.exerciseSecondaryMuscles).where(inArray(s.exerciseSecondaryMuscles.exerciseId, [...ids]));
      const sec = BUILTIN_EXERCISES.filter((e) => ids.has(e.id)).flatMap((e) =>
        (e.secondary ?? []).filter((m) => m !== e.primary).map((m) => ({ exerciseId: e.id, muscleId: m })),
      );
      if (sec.length) await tx.insert(s.exerciseSecondaryMuscles).values(sec).onConflictDoNothing();
    }

    await tx
      .insert(s.settings)
      .values({ id: 1, timezone: opts.defaultTimezone ?? "Europe/Berlin" })
      .onConflictDoNothing();
    await tx.insert(s.profile).values({ id: 1 }).onConflictDoNothing();
  });
}
