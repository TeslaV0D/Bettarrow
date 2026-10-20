"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { run, UserError } from "./_util";

const name = z.string().trim().min(2, "Name zu kurz").max(60, "Name zu lang");
const slug = (n: string) =>
  "custom_" +
  n
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) +
  "_" +
  crypto.randomUUID().slice(0, 4);

export async function addCategoryAction(input: { type: "equipment" | "pattern" | "muscle"; name: string; category?: string; parentId?: string | null; region?: "upper" | "core" | "lower" }) {
  return run(async () => {
    const n = name.parse(input.name);
    const id = slug(n);
    if (input.type === "equipment") {
      await db.insert(s.equipment).values({ id, name: n, category: z.string().trim().min(1).max(40).parse(input.category || "Sonstige"), sortOrder: 1000, isBuiltin: false });
    } else if (input.type === "pattern") {
      await db.insert(s.movementPatterns).values({ id, name: n, sortOrder: 1000, isBuiltin: false });
    } else {
      const parentId = input.parentId || null;
      if (parentId) {
        const [p] = await db.select({ parentId: s.muscleGroups.parentId }).from(s.muscleGroups).where(eq(s.muscleGroups.id, parentId));
        if (!p || p.parentId) throw new UserError("Ungültige Obergruppe");
      }
      await db.insert(s.muscleGroups).values({ id, name: n, parentId, region: z.enum(["upper", "core", "lower"]).parse(input.region ?? "upper"), sortOrder: 1000, isBuiltin: false });
    }
    revalidatePath("/", "layout");
    return { id };
  });
}

/** Deletes a custom category if it is not referenced by any exercise. */
export async function deleteCategoryAction(type: "equipment" | "pattern" | "muscle", id: string) {
  return run(async () => {
    const cid = z.string().startsWith("custom_").parse(id);
    if (type === "equipment") {
      const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(s.exercises).where(eq(s.exercises.equipmentId, cid));
      if (u.n) throw new UserError(`Wird von ${u.n} Übung(en) verwendet.`);
      await db.delete(s.equipment).where(and(eq(s.equipment.id, cid), eq(s.equipment.isBuiltin, false)));
    } else if (type === "pattern") {
      await db.delete(s.movementPatterns).where(and(eq(s.movementPatterns.id, cid), eq(s.movementPatterns.isBuiltin, false)));
    } else {
      const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(s.exercises).where(eq(s.exercises.primaryMuscleId, cid));
      const [v] = await db.select({ n: sql<number>`count(*)::int` }).from(s.exerciseSecondaryMuscles).where(eq(s.exerciseSecondaryMuscles.muscleId, cid));
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(s.muscleGroups).where(or(eq(s.muscleGroups.parentId, cid)));
      if (u.n + v.n + c.n) throw new UserError("Muskelgruppe wird noch verwendet.");
      await db.delete(s.muscleGroups).where(and(eq(s.muscleGroups.id, cid), eq(s.muscleGroups.isBuiltin, false)));
    }
    revalidatePath("/", "layout");
  });
}
