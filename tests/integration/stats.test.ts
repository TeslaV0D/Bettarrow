import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/server/db/schema";
import { getExerciseProgress, getPeriodStats, loadFacts } from "@/server/services/stats";
import { finishWorkout, getWorkoutDetail, startWorkout, syncWorkout } from "@/server/services/workouts";
import { workoutTotals } from "@/lib/training";
import { closeTestDb, resetUserData, testDb } from "../support/db";

const db = testDb();
afterAll(closeTestDb);
beforeEach(() => resetUserData(db));

let rev = 10_000;
type SetSpec = { w: number | null; r: number | null; type?: "working" | "warmup" | "dropset"; done?: boolean; dur?: number };

async function session(date: string, items: { exerciseId: string; sets: SetSpec[] }[], bw = 80) {
  await db.insert(s.bodyWeightEntries).values({ date: "2026-01-01", weightKg: bw }).onConflictDoNothing();
  const startedAt = new Date(`${date}T10:00:00Z`);
  const { id } = await startWorkout(db, {}, { timezone: "UTC", now: startedAt });
  const d = (await getWorkoutDetail(db, id))!;
  rev++;
  const res = await syncWorkout(db, id, {
    revision: rev, baseRevision: d.revision, deviceId: "test-device-1", name: "S", notes: null, pausedAt: null, pausedSeconds: 0, bodyweightKg: d.bodyweightKg,
    exercises: items.map((it) => ({
      id: crypto.randomUUID(), exerciseId: it.exerciseId, notes: null, restSeconds: null,
      sets: it.sets.map((x) => ({
        id: crypto.randomUUID(), setType: x.type ?? "working", weightKg: x.w, reps: x.r, durationSeconds: x.dur ?? null,
        rir: null, rpe: null, note: null, completed: x.done ?? true, completedAt: null,
      })),
    })),
  });
  expect(res.status).toBe("ok");
  await finishWorkout(db, id, { incomplete: "keep", now: new Date(startedAt.getTime() + 3_600_000) });
  return id;
}

const opts = { bodyweightInVolume: true, secondaryMuscleWeight: 0.5, weekStart: 1 };

describe("statistics", () => {
  it("SQL volume aggregation matches the TypeScript rules", async () => {
    const id = await session("2026-10-05", [
      { exerciseId: "bench-press-barbell", sets: [{ w: 20, r: 10, type: "warmup" }, { w: 60, r: 8 }, { w: 60, r: null }, { w: 50, r: 10, type: "dropset" }, { w: 70, r: 5, done: false }] },
      { exerciseId: "pull-up", sets: [{ w: 10, r: 6 }, { w: null, r: 8 }] },
      { exerciseId: "crunch", sets: [{ w: null, r: 20 }] },
      { exerciseId: "plank", sets: [{ w: null, r: null, dur: 60 }] },
    ]);
    const d = (await getWorkoutDetail(db, id))!;
    const ts = workoutTotals(d.exercises.map((e) => ({ tracking: e.tracking, loadMode: e.loadMode, bodyweightInVolume: true, sets: e.sets })));
    const facts = await loadFacts(db, { from: null, to: null }, { bodyweightInVolume: true });
    const sqlVolume = facts.exercises.reduce((a, f) => a + f.volumeKg, 0);
    const sqlSets = facts.exercises.reduce((a, f) => a + f.workingSets, 0);
    expect(sqlVolume).toBeCloseTo(ts.volumeKg, 1);
    expect(sqlSets).toBe(ts.workingSets);
    // 60×8 + 50×10 + (80+10)×6 + 80×8 = 480 + 500 + 540 + 640
    expect(ts.volumeKg).toBe(2160);
    expect(ts.workingSets).toBe(7); // warm-up and unfinished set excluded
    expect(facts.exercises.some((f) => f.incomplete)).toBe(true); // 60 × null reps

    const withoutBw = await loadFacts(db, { from: null, to: null }, { bodyweightInVolume: false });
    expect(withoutBw.exercises.reduce((a, f) => a + f.volumeKg, 0)).toBe(980);
  });

  it("aggregates a period with buckets, consistency and muscle attribution", async () => {
    await session("2026-10-05", [{ exerciseId: "bench-press-barbell", sets: [{ w: 60, r: 8 }, { w: 60, r: 8 }] }]);
    await session("2026-10-07", [{ exerciseId: "back-squat", sets: [{ w: 100, r: 5 }] }]);
    await session("2026-10-14", [{ exerciseId: "bench-press-barbell", sets: [{ w: 62.5, r: 8 }] }]);
    await session("2026-09-01", [{ exerciseId: "bench-press-barbell", sets: [{ w: 50, r: 8 }] }]); // outside
    const st = await getPeriodStats(db, { from: "2026-10-05", to: "2026-10-18" }, "2026-10-20", opts);
    expect(st.totals).toMatchObject({ sessions: 3, trainingDays: 3, workingSets: 4 });
    expect(st.totals.volumeKg).toBe(960 + 500 + 500);
    expect(st.buckets.map((b) => [b.key, b.sessions])).toEqual([["2026-10-05", 2], ["2026-10-12", 1]]);
    expect(st.consistency).toMatchObject({ weeks: 2, activeWeeks: 2 });
    const chest = st.muscles.find((m) => m.muscleId === "chest")!;
    const triceps = st.muscles.find((m) => m.muscleId === "triceps")!;
    expect(chest).toMatchObject({ directSets: 3, indirectSets: 0, weightedSets: 3 });
    expect(triceps).toMatchObject({ directSets: 0, indirectSets: 3, weightedSets: 1.5 });
    expect(st.muscles.reduce((a, m) => a + m.share, 0)).toBeCloseTo(1, 5);
  });

  it("computes week streaks", async () => {
    await session("2026-09-28", [{ exerciseId: "crunch", sets: [{ w: null, r: 10 }] }]);
    await session("2026-10-06", [{ exerciseId: "crunch", sets: [{ w: null, r: 10 }] }]);
    await session("2026-10-13", [{ exerciseId: "crunch", sets: [{ w: null, r: 10 }] }]);
    const st = await getPeriodStats(db, { from: null, to: null }, "2026-10-20", opts);
    expect(st.consistency.currentStreak).toBe(3); // current week has none yet → counts from last week
    expect(st.consistency.longestStreak).toBe(3);
  });

  it("builds exercise progress and records", async () => {
    await session("2026-10-01", [{ exerciseId: "back-squat", sets: [{ w: 100, r: 5 }, { w: 90, r: 8 }] }]);
    await session("2026-10-08", [{ exerciseId: "back-squat", sets: [{ w: 105, r: 3 }, { w: 80, r: 12 }] }]);
    const p = await getExerciseProgress(db, "back-squat", { bodyweightInVolume: true });
    expect(p.sessions.map((x) => [x.date, x.topLoad, x.workingSets])).toEqual([["2026-10-01", 100, 2], ["2026-10-08", 105, 2]]);
    expect(p.records.maxLoad).toMatchObject({ value: 105, date: "2026-10-08" });
    expect(p.records.maxSetVolume).toMatchObject({ value: 960, loadKg: 80, reps: 12 });
    expect(p.records.bestE1rm!.value).toBeCloseTo(116.7, 1);
    expect(p.records.repsByLoad).toEqual([{ loadKg: 105, reps: 3 }, { loadKg: 100, reps: 5 }, { loadKg: 90, reps: 8 }, { loadKg: 80, reps: 12 }]);
  });
});
