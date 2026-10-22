import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteTemplate, duplicateTemplate, getTemplate, saveTemplate } from "@/server/services/templates";
import { finishWorkout, getWorkoutDetail, startWorkout } from "@/server/services/workouts";
import { closeTestDb, resetUserData, testDb } from "../support/db";

const db = testDb();
afterAll(closeTestDb);
beforeEach(() => resetUserData(db));

const items = [
  { exerciseId: "back-squat", targetSets: 3, repMin: 5, repMax: 8, restSeconds: 180, notes: "Tief" },
  { exerciseId: "lying-leg-curl", targetSets: 2 },
];

describe("templates", () => {
  it("creates, edits (reorder) and duplicates", async () => {
    const id = await saveTemplate(db, null, { name: "Legs", description: "Beine", items });
    let t = (await getTemplate(db, id))!;
    expect(t.items.map((i) => i.exerciseId)).toEqual(["back-squat", "lying-leg-curl"]);
    expect(t.items[0]).toMatchObject({ targetSets: 3, repMin: 5, repMax: 8, restSeconds: 180, notes: "Tief" });
    await saveTemplate(db, id, { name: "Legs B", items: [items[1], items[0]] });
    t = (await getTemplate(db, id))!;
    expect(t.name).toBe("Legs B");
    expect(t.items.map((i) => i.exerciseId)).toEqual(["lying-leg-curl", "back-squat"]);
    const copy = (await getTemplate(db, await duplicateTemplate(db, id)))!;
    expect(copy.name).toBe("Legs B (Kopie)");
    expect(copy.items).toHaveLength(2);
  });

  it("validates input", async () => {
    await expect(saveTemplate(db, null, { name: "", items: [] })).rejects.toThrow();
    await expect(saveTemplate(db, null, { name: "X", items: [{ exerciseId: "nope", targetSets: 3 }] })).rejects.toThrow(/templates\.unknownExercise/);
    await expect(saveTemplate(db, null, { name: "X", items: [{ exerciseId: "back-squat", targetSets: 3, repMin: 10, repMax: 5 }] })).rejects.toThrow();
  });

  it("editing or deleting a template never changes training history", async () => {
    const id = await saveTemplate(db, null, { name: "Legs", items });
    const w = await startWorkout(db, { templateId: id }, { timezone: "UTC" });
    await finishWorkout(db, w.id, { incomplete: "complete" });
    const before = (await getWorkoutDetail(db, w.id))!;
    await saveTemplate(db, id, { name: "Ganz anders", items: [{ exerciseId: "leg-press", targetSets: 5 }] });
    await deleteTemplate(db, id);
    const after = (await getWorkoutDetail(db, w.id))!;
    expect(after.name).toBe("Legs");
    expect(after.templateId).toBeNull();
    expect(after.exercises.map((e) => [e.exerciseId, e.sets.length])).toEqual(before.exercises.map((e) => [e.exerciseId, e.sets.length]));
  });
});
