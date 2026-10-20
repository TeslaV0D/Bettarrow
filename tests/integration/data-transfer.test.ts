import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { exportData, importData, validateExport } from "@/server/services/data-transfer";
import { createBackup, listBackups, readBackup } from "@/server/services/backups";
import { saveTemplate } from "@/server/services/templates";
import { createRule, planEntry } from "@/server/services/calendar";
import { finishWorkout, getWorkoutDetail, startWorkout, syncWorkout } from "@/server/services/workouts";
import { closeTestDb, resetUserData, testDb } from "../support/db";

const db = testDb();
afterAll(closeTestDb);
beforeEach(() => resetUserData(db));

async function fixture() {
  await db.update(s.profile).set({ name: "Max", heightCm: 182, birthDate: null }).where(eq(s.profile.id, 1));
  await db.update(s.settings).set({ secondaryMuscleWeight: 0.25, timezone: "Europe/Berlin" }).where(eq(s.settings.id, 1));
  await db.insert(s.bodyWeightEntries).values([{ date: "2026-10-01", weightKg: 80.4, note: "morgens" }, { date: "2026-10-08", weightKg: 79.9 }]);
  await db.update(s.exercises).set({ isFavorite: true, notes: "Sitz 4" }).where(eq(s.exercises.id, "leg-press"));
  await db.insert(s.exercises).values({ id: "custom-x-1", name: "Meine Übung", primaryMuscleId: "chest", equipmentId: "cable", isCustom: true });
  await db.insert(s.exerciseSecondaryMuscles).values({ exerciseId: "custom-x-1", muscleId: "triceps" });
  const tpl = await saveTemplate(db, null, { name: "Push", items: [{ exerciseId: "custom-x-1", targetSets: 2, notes: "langsam" }, { exerciseId: "pull-up", targetSets: 3 }] });
  await createRule(db, { kind: "workout", templateId: tpl, weekdays: [1, 4], startDate: "2026-10-01" });
  await planEntry(db, { date: "2026-10-25", kind: "rest" });
  const { id } = await startWorkout(db, { templateId: tpl }, { timezone: "UTC", now: new Date("2026-10-09T17:00:00Z") });
  const d = (await getWorkoutDetail(db, id))!;
  await syncWorkout(db, id, {
    revision: Date.now(), baseRevision: d.revision, deviceId: "dev-12345678", name: "Push", notes: "gut", pausedAt: null, pausedSeconds: 30, bodyweightKg: d.bodyweightKg,
    exercises: d.exercises.map((e) => ({
      id: e.id, exerciseId: e.exerciseId, notes: "n", restSeconds: 90,
      sets: e.sets.map((x, i) => ({ id: x.id, setType: i === 0 ? "warmup" : "working", weightKg: 10 + i, reps: 8, durationSeconds: null, rir: 2, rpe: 8, note: i ? null : "w", completed: true, completedAt: "2026-10-09T17:10:00.000Z" })),
    })),
  });
  await finishWorkout(db, id, { now: new Date("2026-10-09T18:00:00Z") });
}

describe("export / import", () => {
  it("round-trips all personal data without loss", async () => {
    await fixture();
    const first = await exportData(db, new Date("2026-10-20T00:00:00Z"));
    expect(first.format).toBe("bettarrow-export");
    expect(first.workouts[0].exercises[0].sets[0]).toMatchObject({ setType: "warmup", rir: 2, rpe: 8, note: "w" });
    const v = validateExport(JSON.parse(JSON.stringify(first)));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.summary).toMatchObject({ workouts: 1, templates: 1, customExercises: 1, bodyWeight: 2 });

    await resetUserData(db);
    await db.update(s.profile).set({ name: null }).where(eq(s.profile.id, 1));
    await importData(db, v.data);
    const second = await exportData(db, new Date("2026-10-20T00:00:00Z"));
    expect(second).toEqual(first);
  });

  it("rejects foreign, newer or inconsistent files", async () => {
    expect(validateExport({ hello: 1 })).toMatchObject({ ok: false });
    await fixture();
    const data = JSON.parse(JSON.stringify(await exportData(db)));
    expect(validateExport({ ...data, version: 99 })).toMatchObject({ ok: false });
    const broken = JSON.parse(JSON.stringify(data));
    broken.workouts[0].exercises[0].exerciseId = "missing-exercise";
    const res = validateExport(broken);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/missing-exercise/);
    const badType = JSON.parse(JSON.stringify(data));
    badType.bodyWeight[0].weightKg = "achtzig";
    expect(validateExport(badType).ok).toBe(false);
  });

  it("an import is atomic: a failing import leaves the existing data untouched", async () => {
    await fixture();
    const data = await exportData(db);
    const bad = structuredClone(data);
    bad.workouts[0].exercises[0].sets.push({ ...bad.workouts[0].exercises[0].sets[0] }); // duplicate primary key
    await expect(importData(db, bad)).rejects.toThrow();
    const after = await exportData(db, new Date(data.exportedAt));
    expect(after).toEqual(data);
  });
});

describe("backups", () => {
  it("writes, lists, prunes and restores gzipped backups", async () => {
    await fixture();
    const dir = await mkdtemp(path.join(tmpdir(), "bettarrow-backup-"));
    try {
      await writeFile(path.join(dir, "unrelated.txt"), "x");
      for (let i = 0; i < 4; i++) await createBackup(db, dir, { keep: 3, now: new Date(Date.UTC(2026, 9, 1 + i)) });
      await createBackup(db, dir, { keep: 3, label: "vor-import", now: new Date(Date.UTC(2026, 9, 10)) });
      const files = await listBackups(dir);
      expect(files.map((f) => f.name)).toEqual([
        "bettarrow-2026-10-10T00-00-00-vor-import.json.gz",
        "bettarrow-2026-10-04T00-00-00.json.gz",
        "bettarrow-2026-10-03T00-00-00.json.gz",
        "bettarrow-2026-10-02T00-00-00.json.gz",
      ]);
      expect(await readdir(dir)).toContain("unrelated.txt");
      const raw = await readBackup(dir, files[1].name);
      const v = validateExport(raw);
      expect(v.ok).toBe(true);
      await resetUserData(db);
      if (v.ok) await importData(db, v.data);
      expect((await exportData(db)).workouts).toHaveLength(1);
      await expect(readBackup(dir, "../etc/passwd")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
