"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { exerciseInputSchema, type ExerciseInput } from "@/lib/exercise-schema";
import { BUILTIN_EXERCISES } from "@/server/seed";
import { getExerciseUsage } from "@/server/queries/exercises";
import { run, UserError } from "./_util";

const exerciseId = z.string().min(1).max(120);

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function validateRefs(data: ReturnType<typeof exerciseInputSchema.parse>) {
  const muscleIds = [data.primaryMuscleId, ...data.secondaryMuscleIds];
  const muscles = await db.select({ id: s.muscleGroups.id, parentId: s.muscleGroups.parentId }).from(s.muscleGroups);
  const known = new Set(muscles.map((m) => m.id));
  const parents = new Set(muscles.map((m) => m.parentId).filter(Boolean));
  for (const id of muscleIds) if (!known.has(id)) throw new UserError("Unbekannte Muskelgruppe");
  if (parents.has(data.primaryMuscleId)) throw new UserError("Bitte eine konkrete Muskelgruppe als primären Muskel wählen");
  const [eq1] = await db.select({ id: s.equipment.id }).from(s.equipment).where(eq(s.equipment.id, data.equipmentId)).limit(1);
  if (!eq1) throw new UserError("Unbekanntes Equipment");
  if (data.movementPatternId) {
    const [p] = await db.select({ id: s.movementPatterns.id }).from(s.movementPatterns).where(eq(s.movementPatterns.id, data.movementPatternId)).limit(1);
    if (!p) throw new UserError("Unbekanntes Bewegungsmuster");
  }
}

function columns(data: ReturnType<typeof exerciseInputSchema.parse>) {
  return {
    name: data.name,
    aliases: [...new Set(data.aliases)],
    description: data.description || null,
    instructions: data.instructions || null,
    primaryMuscleId: data.primaryMuscleId,
    equipmentId: data.equipmentId,
    movementPatternId: data.movementPatternId,
    mechanic: data.mechanic,
    tracking: data.tracking,
    loadMode: data.loadMode,
    bodyweightFactor: data.bodyweightFactor,
    repMin: data.repMin,
    repMax: data.repMax,
    restSeconds: data.restSeconds,
    notes: data.notes || null,
  };
}

export async function createExerciseAction(input: ExerciseInput) {
  return run(async () => {
    const data = exerciseInputSchema.parse(input);
    await validateRefs(data);
    const id = `custom-${slugify(data.name) || "uebung"}-${crypto.randomUUID().slice(0, 8)}`;
    await db.transaction(async (tx) => {
      await tx.insert(s.exercises).values({ id, ...columns(data), isCustom: true });
      const sec = data.secondaryMuscleIds.filter((m) => m !== data.primaryMuscleId);
      if (sec.length) await tx.insert(s.exerciseSecondaryMuscles).values([...new Set(sec)].map((muscleId) => ({ exerciseId: id, muscleId })));
    });
    revalidatePath("/exercises");
    return { id };
  });
}

export async function updateExerciseAction(id: string, input: ExerciseInput) {
  return run(async () => {
    const eid = exerciseId.parse(id);
    const data = exerciseInputSchema.parse(input);
    await validateRefs(data);
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ isCustom: s.exercises.isCustom }).from(s.exercises).where(eq(s.exercises.id, eid)).limit(1);
      if (!row) throw new UserError("Übung nicht gefunden");
      // Edited built-ins are marked so app updates never overwrite the user's changes.
      await tx
        .update(s.exercises)
        .set({ ...columns(data), isModified: !row.isCustom, updatedAt: new Date() })
        .where(eq(s.exercises.id, eid));
      await tx.delete(s.exerciseSecondaryMuscles).where(eq(s.exerciseSecondaryMuscles.exerciseId, eid));
      const sec = data.secondaryMuscleIds.filter((m) => m !== data.primaryMuscleId);
      if (sec.length) await tx.insert(s.exerciseSecondaryMuscles).values([...new Set(sec)].map((muscleId) => ({ exerciseId: eid, muscleId })));
    });
    revalidatePath("/exercises", "layout");
    return { id: eid };
  });
}

/** Restores the shipped definition of an edited built-in exercise (user notes and favorites stay). */
export async function resetBuiltinExerciseAction(id: string) {
  return run(async () => {
    const eid = exerciseId.parse(id);
    const def = BUILTIN_EXERCISES.find((e) => e.id === eid);
    if (!def) throw new UserError("Keine Standardübung");
    await db.transaction(async (tx) => {
      await tx
        .update(s.exercises)
        .set({
          name: def.name,
          aliases: def.aliases ?? [],
          description: def.description,
          instructions: def.cues.join("\n"),
          primaryMuscleId: def.primary,
          equipmentId: def.equipment,
          movementPatternId: def.pattern ?? null,
          mechanic: def.mechanic,
          tracking: def.tracking ?? "reps",
          loadMode: def.load ?? "external",
          bodyweightFactor: def.factor ?? 1,
          repMin: def.reps?.[0] ?? null,
          repMax: def.reps?.[1] ?? null,
          restSeconds: def.rest ?? null,
          isModified: false,
          updatedAt: new Date(),
        })
        .where(eq(s.exercises.id, eid));
      await tx.delete(s.exerciseSecondaryMuscles).where(eq(s.exerciseSecondaryMuscles.exerciseId, eid));
      const sec = (def.secondary ?? []).filter((m) => m !== def.primary);
      if (sec.length) await tx.insert(s.exerciseSecondaryMuscles).values(sec.map((muscleId) => ({ exerciseId: eid, muscleId })));
    });
    revalidatePath("/exercises", "layout");
  });
}

export async function toggleFavoriteAction(id: string, favorite: boolean) {
  return run(async () => {
    await db.update(s.exercises).set({ isFavorite: favorite }).where(eq(s.exercises.id, exerciseId.parse(id)));
    revalidatePath("/exercises", "layout");
  });
}

export async function setExerciseNotesAction(id: string, notes: string) {
  return run(async () => {
    const text = z.string().max(5000).parse(notes).trim();
    await db.update(s.exercises).set({ notes: text || null }).where(eq(s.exercises.id, exerciseId.parse(id)));
    revalidatePath(`/exercises/${id}`);
  });
}

export async function setArchivedAction(id: string, archived: boolean) {
  return run(async () => {
    await db.update(s.exercises).set({ archivedAt: archived ? new Date() : null }).where(eq(s.exercises.id, exerciseId.parse(id)));
    revalidatePath("/exercises", "layout");
  });
}

/**
 * Deletes a custom exercise that was never used. Exercises with history or template references
 * (and all built-in exercises) are archived instead, so no training data is ever lost.
 */
export async function deleteExerciseAction(id: string) {
  return run<{ archived: boolean }>(async () => {
    const eid = exerciseId.parse(id);
    const [row] = await db.select({ isCustom: s.exercises.isCustom }).from(s.exercises).where(eq(s.exercises.id, eid)).limit(1);
    if (!row) throw new UserError("Übung nicht gefunden");
    const usage = await getExerciseUsage(eid);
    if (!row.isCustom || usage.templates > 0 || usage.workouts > 0) {
      await db.update(s.exercises).set({ archivedAt: new Date() }).where(eq(s.exercises.id, eid));
      revalidatePath("/exercises", "layout");
      return { archived: true };
    }
    await db.delete(s.exercises).where(and(eq(s.exercises.id, eid), eq(s.exercises.isCustom, true), sql`true`));
    revalidatePath("/exercises", "layout");
    return { archived: false };
  });
}
