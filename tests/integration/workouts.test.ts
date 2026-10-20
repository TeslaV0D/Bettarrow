import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import {
  discardWorkout, finishWorkout, getActiveWorkoutId, getWorkoutDetail, getWorkoutPRs, loadPrefill, restoreDiscardedWorkout, startWorkout, syncWorkout,
} from "@/server/services/workouts";
import { closeTestDb, resetUserData, testDb } from "../support/db";
import type { SyncPayload } from "@/lib/workout-schema";

const db = testDb();
const tz = "Europe/Berlin";
const DEVICE = "device-aaaaaaaa";

afterAll(closeTestDb);
beforeEach(() => resetUserData(db));

let rev = 1_000;
function payload(detail: NonNullable<Awaited<ReturnType<typeof getWorkoutDetail>>>, patch: Partial<SyncPayload> = {}): SyncPayload {
  rev += 1;
  return {
    revision: rev,
    baseRevision: detail.revision,
    deviceId: DEVICE,
    name: detail.name,
    notes: detail.notes,
    pausedAt: null,
    pausedSeconds: 0,
    bodyweightKg: detail.bodyweightKg,
    exercises: detail.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      notes: e.notes,
      restSeconds: e.restSeconds,
      sets: e.sets.map((x) => ({
        id: x.id, setType: x.setType, weightKg: x.weightKg, reps: x.reps, durationSeconds: x.durationSeconds,
        rir: x.rir, rpe: x.rpe, note: x.note, completed: x.completed, completedAt: x.completedAt?.toISOString() ?? null,
      })),
    })),
    ...patch,
  };
}

async function createTemplate(name: string, items: { exerciseId: string; targetSets?: number; repMin?: number }[]) {
  const [t] = await db.insert(s.templates).values({ name }).returning();
  await db.insert(s.templateExercises).values(
    items.map((it, i) => ({ templateId: t.id, exerciseId: it.exerciseId, position: i, targetSets: it.targetSets ?? 3, repMin: it.repMin ?? null })),
  );
  return t.id;
}

/** Logs a full session with the given sets for one exercise and finishes it. */
async function logSession(exerciseId: string, sets: [number | null, number][], when: Date, opts: { finish?: boolean } = {}) {
  const { id } = await startWorkout(db, { name: "Test" }, { timezone: tz, now: when });
  const d = (await getWorkoutDetail(db, id))!;
  const weId = crypto.randomUUID();
  const p = payload(d, {
    exercises: [
      {
        id: weId, exerciseId, notes: null, restSeconds: null,
        sets: sets.map(([w, r]) => ({
          id: crypto.randomUUID(), setType: "working" as const, weightKg: w, reps: r, durationSeconds: null,
          rir: null, rpe: null, note: null, completed: true, completedAt: when.toISOString(),
        })),
      },
    ],
  });
  expect(await syncWorkout(db, id, p)).toMatchObject({ status: "ok" });
  if (opts.finish !== false) expect(await finishWorkout(db, id, { now: new Date(when.getTime() + 3_600_000) })).toEqual({ ok: true });
  return id;
}

describe("starting workouts", () => {
  it("creates an active workout with start time and local date", async () => {
    const now = new Date("2026-10-19T22:30:00Z"); // 00:30 on Oct 20 in Berlin
    const { id, existing } = await startWorkout(db, {}, { timezone: tz, now });
    expect(existing).toBe(false);
    const d = await getWorkoutDetail(db, id);
    expect(d).toMatchObject({ status: "active", localDate: "2026-10-20", name: "Freies Training" });
    expect(d!.startedAt.toISOString()).toBe(now.toISOString());
  });

  it("never creates a second active workout (resume instead)", async () => {
    const a = await startWorkout(db, {}, { timezone: tz });
    const b = await startWorkout(db, { name: "Another" }, { timezone: tz });
    expect(b).toEqual({ id: a.id, existing: true });
    const [c, d] = await Promise.all([startWorkout(db, {}, { timezone: tz }), startWorkout(db, {}, { timezone: tz })]);
    expect(c.id).toBe(a.id);
    expect(d.id).toBe(a.id);
    const rows = await db.select().from(s.workouts).where(eq(s.workouts.status, "active"));
    expect(rows).toHaveLength(1);
  });

  it("starts from a template with prefilled sets from the last completed session", async () => {
    await logSession("bench-press-barbell", [[40, 12], [45, 10], [45, 8]], new Date("2026-10-10T10:00:00Z"));
    const tpl = await createTemplate("Push", [{ exerciseId: "bench-press-barbell", targetSets: 3 }, { exerciseId: "lateral-raise-dumbbell", targetSets: 2, repMin: 12 }]);
    const { id } = await startWorkout(db, { templateId: tpl }, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    expect(d.name).toBe("Push");
    expect(d.templateId).toBe(tpl);
    expect(d.exercises.map((e) => e.exerciseId)).toEqual(["bench-press-barbell", "lateral-raise-dumbbell"]);
    expect(d.exercises[0].sets.map((x) => [x.weightKg, x.reps, x.completed])).toEqual([[40, 12, false], [45, 10, false], [45, 8, false]]);
    // No history: template target sets with the lower rep bound.
    expect(d.exercises[1].sets.map((x) => [x.weightKg, x.reps])).toEqual([[null, 12], [null, 12]]);
  });
});

describe("prefill rules", () => {
  it("uses the most recent completed session per exercise", async () => {
    await logSession("back-squat", [[100, 5]], new Date("2026-10-01T10:00:00Z"));
    await logSession("back-squat", [[105, 5], [105, 4]], new Date("2026-10-08T10:00:00Z"));
    const map = await loadPrefill(db, ["back-squat", "leg-press"]);
    expect(map.get("back-squat")!.sets.map((x) => x.weightKg)).toEqual([105, 105]);
    expect(map.has("leg-press")).toBe(false);
  });

  it("ignores discarded and active (unfinished) sessions", async () => {
    await logSession("back-squat", [[100, 5]], new Date("2026-10-01T10:00:00Z"));
    const unfinished = await logSession("back-squat", [[200, 1]], new Date("2026-10-05T10:00:00Z"), { finish: false });
    let map = await loadPrefill(db, ["back-squat"]);
    expect(map.get("back-squat")!.sets[0].weightKg).toBe(100);
    await discardWorkout(db, unfinished);
    map = await loadPrefill(db, ["back-squat"]);
    expect(map.get("back-squat")!.sets[0].weightKg).toBe(100);
  });

  it("is not affected by later template changes", async () => {
    const tpl = await createTemplate("Legs", [{ exerciseId: "back-squat", targetSets: 1 }]);
    await logSession("back-squat", [[100, 5]], new Date("2026-10-01T10:00:00Z"));
    await db.update(s.templateExercises).set({ targetSets: 5, repMin: 3 }).where(eq(s.templateExercises.templateId, tpl));
    await db.update(s.templates).set({ name: "Legs v2" }).where(eq(s.templates.id, tpl));
    const map = await loadPrefill(db, ["back-squat"]);
    expect(map.get("back-squat")!.sets).toEqual([{ setType: "working", weightKg: 100, reps: 5, durationSeconds: null, completed: true }]);
  });
});

describe("autosave / sync", () => {
  it("adds any number of sets, edits values and persists them", async () => {
    const { id } = await startWorkout(db, {}, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    const weId = crypto.randomUUID();
    const sets = Array.from({ length: 12 }, (_, i) => ({
      id: crypto.randomUUID(), setType: "working" as const, weightKg: 20 + i, reps: 10, durationSeconds: null,
      rir: i % 3, rpe: null, note: i === 0 ? "leicht" : null, completed: i < 6, completedAt: null,
    }));
    expect(await syncWorkout(db, id, payload(d, { exercises: [{ id: weId, exerciseId: "dumbbell-curl", notes: "Notiz", restSeconds: 60, sets }] }))).toMatchObject({ status: "ok" });
    let after = (await getWorkoutDetail(db, id))!;
    expect(after.exercises[0].sets).toHaveLength(12);
    expect(after.exercises[0].notes).toBe("Notiz");
    expect(after.exercises[0].sets[0]).toMatchObject({ weightKg: 20, reps: 10, rir: 0, note: "leicht", completed: true, loadKg: 20 });
    expect(after.exercises[0].sets[0].completedAt).toBeInstanceOf(Date);

    sets[1] = { ...sets[1], weightKg: 32.5, reps: 7 };
    expect(await syncWorkout(db, id, payload(after, { exercises: [{ id: weId, exerciseId: "dumbbell-curl", notes: null, restSeconds: 60, sets: sets.slice(0, 3) }] }))).toMatchObject({ status: "ok" });
    after = (await getWorkoutDetail(db, id))!;
    expect(after.exercises[0].sets.map((x) => [x.weightKg, x.reps])).toEqual([[20, 10], [32.5, 7], [22, 10]]);
  });

  it("is idempotent and ignores stale snapshots (no duplicate sets)", async () => {
    const { id } = await startWorkout(db, {}, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    const weId = crypto.randomUUID();
    const setId = crypto.randomUUID();
    const mk = (reps: number) => ({
      id: setId, setType: "working" as const, weightKg: 50, reps, durationSeconds: null, rir: null, rpe: null, note: null, completed: true, completedAt: null,
    });
    const older = payload(d, { exercises: [{ id: weId, exerciseId: "barbell-curl", notes: null, restSeconds: null, sets: [mk(8)] }] });
    const newer = payload(d, { exercises: [{ id: weId, exerciseId: "barbell-curl", notes: null, restSeconds: null, sets: [mk(10)] }] });
    expect(await syncWorkout(db, id, newer)).toEqual({ status: "ok", revision: newer.revision });
    expect(await syncWorkout(db, id, newer)).toEqual({ status: "stale", revision: newer.revision }); // retry
    expect(await syncWorkout(db, id, older)).toEqual({ status: "stale", revision: newer.revision }); // late delivery
    const after = (await getWorkoutDetail(db, id))!;
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0].sets).toHaveLength(1);
    expect(after.exercises[0].sets[0].reps).toBe(10);
  });

  it("detects conflicting edits from another device", async () => {
    const { id } = await startWorkout(db, {}, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    const a = payload(d, { name: "A" });
    expect(await syncWorkout(db, id, a)).toMatchObject({ status: "ok" });
    const b = payload(d, { name: "B", deviceId: "device-bbbbbbbb", baseRevision: 0 });
    expect(await syncWorkout(db, id, b)).toMatchObject({ status: "conflict" });
    const b2 = payload(d, { name: "B", deviceId: "device-bbbbbbbb", baseRevision: a.revision });
    expect(await syncWorkout(db, id, b2)).toMatchObject({ status: "ok" });
  });

  it("rejects invalid payloads and unknown exercises", async () => {
    const { id } = await startWorkout(db, {}, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    expect(await syncWorkout(db, id, { nope: true })).toMatchObject({ status: "invalid" });
    const bad = payload(d, { exercises: [{ id: crypto.randomUUID(), exerciseId: "does-not-exist", notes: null, restSeconds: null, sets: [] }] });
    expect(await syncWorkout(db, id, bad)).toMatchObject({ status: "invalid" });
    expect(await syncWorkout(db, crypto.randomUUID(), payload(d))).toEqual({ status: "not_found" });
  });

  it("stores bodyweight snapshots and computed loads for bodyweight exercises", async () => {
    await db.insert(s.bodyWeightEntries).values({ date: "2026-10-01", weightKg: 80 });
    const { id } = await startWorkout(db, {}, { timezone: tz, now: new Date("2026-10-20T10:00:00Z") });
    const d = (await getWorkoutDetail(db, id))!;
    expect(d.bodyweightKg).toBe(80);
    const mk = (w: number | null) => ({ id: crypto.randomUUID(), setType: "working" as const, weightKg: w, reps: 8, durationSeconds: null, rir: null, rpe: null, note: null, completed: true, completedAt: null });
    await syncWorkout(db, id, payload(d, {
      exercises: [
        { id: crypto.randomUUID(), exerciseId: "pull-up", notes: null, restSeconds: null, sets: [mk(20), mk(null)] },
        { id: crypto.randomUUID(), exerciseId: "assisted-pull-up-machine", notes: null, restSeconds: null, sets: [mk(25)] },
        { id: crypto.randomUUID(), exerciseId: "push-up", notes: null, restSeconds: null, sets: [mk(10)] },
      ],
    }));
    await finishWorkout(db, id);
    const after = (await getWorkoutDetail(db, id))!;
    expect(after.exercises[0].sets.map((x) => [x.weightKg, x.bodyweightKg, x.loadKg])).toEqual([[20, 80, 100], [null, 80, 80]]);
    expect(after.exercises[1].sets[0]).toMatchObject({ weightKg: 25, loadKg: 55 });
    expect(after.exercises[2].sets[0]).toMatchObject({ weightKg: null, loadKg: 52 }); // 80 × 0.65, entered weight ignored
    expect(after.exercises[2].loadMode).toBe("bodyweight");

    // Later profile weight changes do not alter history.
    await db.insert(s.bodyWeightEntries).values({ date: "2026-10-21", weightKg: 90 });
    const again = (await getWorkoutDetail(db, id))!;
    expect(again.exercises[0].sets[0].loadKg).toBe(100);
  });

  it("keeps the calculation snapshot when the exercise definition changes later", async () => {
    const id = await logSession("pull-up", [[10, 5]], new Date("2026-10-01T10:00:00Z"));
    await db.update(s.exercises).set({ loadMode: "external", bodyweightFactor: 0.5 }).where(eq(s.exercises.id, "pull-up"));
    const d = (await getWorkoutDetail(db, id))!;
    expect(d.exercises[0]).toMatchObject({ loadMode: "bodyweight_plus", bodyweightFactor: 1 });
    await db.update(s.exercises).set({ loadMode: "bodyweight_plus", bodyweightFactor: 1 }).where(eq(s.exercises.id, "pull-up"));
  });
});

describe("finishing and discarding", () => {
  it("only the explicit finish marks a workout completed; incomplete sets are discarded", async () => {
    const tpl = await createTemplate("Arms", [{ exerciseId: "barbell-curl", targetSets: 3 }, { exerciseId: "skull-crusher", targetSets: 2 }]);
    const { id } = await startWorkout(db, { templateId: tpl }, { timezone: tz });
    const d = (await getWorkoutDetail(db, id))!;
    expect(d.status).toBe("active");
    const p = payload(d);
    p.exercises[0].sets[0] = { ...p.exercises[0].sets[0], weightKg: 30, reps: 10, completed: true };
    await syncWorkout(db, id, p);
    expect(await finishWorkout(db, id, { notes: "Gut" })).toEqual({ ok: true });
    const after = (await getWorkoutDetail(db, id))!;
    expect(after).toMatchObject({ status: "completed", notes: "Gut" });
    expect(after.endedAt).toBeInstanceOf(Date);
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0].sets).toHaveLength(1);
    expect(await finishWorkout(db, id)).toEqual({ ok: false, reason: "not_active" });
    expect(await getActiveWorkoutId(db)).toBeNull();
  });

  it("can mark remaining sets as completed instead", async () => {
    const tpl = await createTemplate("Arms", [{ exerciseId: "barbell-curl", targetSets: 3 }]);
    const { id } = await startWorkout(db, { templateId: tpl }, { timezone: tz });
    await finishWorkout(db, id, { incomplete: "complete" });
    const after = (await getWorkoutDetail(db, id))!;
    expect(after.exercises[0].sets.every((x) => x.completed)).toBe(true);
  });

  it("discard can be undone and does not block a new start", async () => {
    const { id } = await startWorkout(db, {}, { timezone: tz });
    expect(await discardWorkout(db, id)).toBe(true);
    expect(await getActiveWorkoutId(db)).toBeNull();
    expect(await restoreDiscardedWorkout(db, id)).toBe(true);
    expect(await getActiveWorkoutId(db)).toBe(id);
    await discardWorkout(db, id);
    const other = await startWorkout(db, {}, { timezone: tz });
    expect(await restoreDiscardedWorkout(db, id)).toBe(false); // another one is active now
    expect(await getActiveWorkoutId(db)).toBe(other.id);
  });

  it("detects PRs against earlier sessions only", async () => {
    await logSession("bench-press-barbell", [[100, 5], [90, 8]], new Date("2026-10-01T10:00:00Z"));
    const id = await logSession("bench-press-barbell", [[102.5, 3], [90, 10]], new Date("2026-10-08T10:00:00Z"));
    const prs = await getWorkoutPRs(db, (await getWorkoutDetail(db, id))!);
    expect(prs.map((p) => p.kind).sort()).toEqual(["e1rm", "max_load", "max_reps_at_load", "max_set_volume"].sort());
    const first = await db.select().from(s.workouts).where(eq(s.workouts.startedAt, new Date("2026-10-01T10:00:00Z")));
    expect(await getWorkoutPRs(db, (await getWorkoutDetail(db, first[0].id))!)).toEqual([]);
  });
});
