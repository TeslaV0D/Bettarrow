import { describe, expect, it } from "vitest";
import {
  attributeToMuscles, buildPrefillSets, computeLoad, detectPRs, estimate1RM, repRecordsByLoad, setVolume, weightedSets,
  workoutDurationSeconds, workoutTotals, type SetLike,
} from "@/lib/training";

describe("computeLoad", () => {
  it("uses the entered weight for external loads", () => {
    expect(computeLoad({ loadMode: "external", bodyweightFactor: 1, bodyweightKg: 80, weightKg: 60 })).toBe(60);
    expect(computeLoad({ loadMode: "external", bodyweightFactor: 1, bodyweightKg: 80, weightKg: null })).toBeNull();
  });
  it("adds weight for bodyweight_plus", () => {
    expect(computeLoad({ loadMode: "bodyweight_plus", bodyweightFactor: 1, bodyweightKg: 80, weightKg: 20 })).toBe(100);
    expect(computeLoad({ loadMode: "bodyweight_plus", bodyweightFactor: 1, bodyweightKg: 80, weightKg: null })).toBe(80);
  });
  it("subtracts assistance for bodyweight_minus and never goes negative", () => {
    expect(computeLoad({ loadMode: "bodyweight_minus", bodyweightFactor: 1, bodyweightKg: 80, weightKg: 25 })).toBe(55);
    expect(computeLoad({ loadMode: "bodyweight_minus", bodyweightFactor: 1, bodyweightKg: 80, weightKg: 100 })).toBe(0);
  });
  it("applies the bodyweight factor", () => {
    expect(computeLoad({ loadMode: "bodyweight", bodyweightFactor: 0.65, bodyweightKg: 80, weightKg: 10 })).toBe(52);
  });
  it("returns null without a known bodyweight or for load-less exercises", () => {
    expect(computeLoad({ loadMode: "bodyweight_plus", bodyweightFactor: 1, bodyweightKg: null, weightKg: 20 })).toBeNull();
    expect(computeLoad({ loadMode: "none", bodyweightFactor: 1, bodyweightKg: 80, weightKg: 20 })).toBeNull();
  });
});

const set = (p: Partial<SetLike>): SetLike => ({ setType: "working", completed: true, reps: 10, loadKg: 50, ...p });
const opts = { tracking: "reps" as const, loadMode: "external" as const, bodyweightInVolume: true };

describe("volume", () => {
  it("is load × reps for completed working sets", () => {
    expect(setVolume(set({}), opts)).toBe(500);
  });
  it("ignores warm-ups, incomplete sets and duration sets", () => {
    expect(setVolume(set({ setType: "warmup" }), opts)).toBeNull();
    expect(setVolume(set({ completed: false }), opts)).toBeNull();
    expect(setVolume(set({}), { ...opts, tracking: "duration" })).toBeNull();
  });
  it("counts dropsets and failure sets", () => {
    expect(setVolume(set({ setType: "dropset", loadKg: 30, reps: 8 }), opts)).toBe(240);
    expect(setVolume(set({ setType: "failure" }), opts)).toBe(500);
  });
  it("can exclude bodyweight-based loads", () => {
    expect(setVolume(set({ loadKg: 80 }), { ...opts, loadMode: "bodyweight_plus", bodyweightInVolume: false })).toBeNull();
    expect(setVolume(set({ loadKg: 80 }), { ...opts, loadMode: "bodyweight_plus" })).toBe(800);
  });
  it("totals a workout and flags incomplete data", () => {
    const t = workoutTotals([
      { ...opts, sets: [set({}), set({ setType: "warmup", loadKg: 20 }), set({ completed: false })] },
      { ...opts, sets: [set({ loadKg: null })] },
      { ...opts, loadMode: "none", sets: [set({ loadKg: null, reps: 20 })] },
    ]);
    expect(t).toMatchObject({ exercises: 3, workingSets: 3, completedSets: 4, totalSets: 5, volumeKg: 500, volumeIncomplete: true });
  });
});

describe("estimated 1RM", () => {
  it("uses Epley for 1–12 reps", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBe(116.7);
    expect(estimate1RM(100, 13)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
  });
});

describe("prefill", () => {
  it("copies the completed sets of the last session in order", () => {
    const sets = buildPrefillSets([
      { setType: "working", weightKg: 40, reps: 12, durationSeconds: null, completed: true },
      { setType: "working", weightKg: 45, reps: 10, durationSeconds: null, completed: true },
      { setType: "working", weightKg: 45, reps: 8, durationSeconds: null, completed: true },
    ]);
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([[40, 12], [45, 10], [45, 8]]);
    expect(sets[0].previous).toEqual({ weightKg: 40, reps: 12, durationSeconds: null });
  });
  it("skips sets that were not completed", () => {
    const sets = buildPrefillSets([
      { setType: "working", weightKg: 40, reps: 12, durationSeconds: null, completed: true },
      { setType: "working", weightKg: 99, reps: 1, durationSeconds: null, completed: false },
    ]);
    expect(sets).toHaveLength(1);
  });
  it("extends to the template's target set count by repeating the last set", () => {
    const sets = buildPrefillSets(
      [{ setType: "working", weightKg: 40, reps: 12, durationSeconds: null, completed: true }],
      { targetSets: 3 },
    );
    expect(sets).toHaveLength(3);
    expect(sets[2]).toMatchObject({ weightKg: 40, reps: 12, previous: null });
  });
  it("creates empty sets without history", () => {
    const sets = buildPrefillSets(null, { targetSets: 4, repMin: 8 });
    expect(sets).toHaveLength(4);
    expect(sets[0]).toMatchObject({ weightKg: null, reps: 8, previous: null });
  });
});

describe("personal records", () => {
  const prior = [{ loadKg: 100, reps: 5 }, { loadKg: 90, reps: 8 }];
  const o = { tracking: "reps" as const, loadMode: "external" as const };
  it("reports nothing for a first session", () => {
    expect(detectPRs([], [{ loadKg: 100, reps: 5 }], o)).toEqual([]);
  });
  it("detects a heavier load", () => {
    const prs = detectPRs(prior, [{ loadKg: 105, reps: 3 }], o);
    expect(prs.find((p) => p.kind === "max_load")).toMatchObject({ value: 105, previous: 100 });
  });
  it("detects a rep record at a given load", () => {
    const prs = detectPRs(prior, [{ loadKg: 90, reps: 9 }], o);
    expect(prs.find((p) => p.kind === "max_reps_at_load")).toMatchObject({ value: 9, previous: 8, loadKg: 90 });
  });
  it("does not report a rep record when a heavier load had more reps", () => {
    const prs = detectPRs([{ loadKg: 100, reps: 10 }], [{ loadKg: 90, reps: 9 }], o);
    expect(prs.find((p) => p.kind === "max_reps_at_load")).toBeUndefined();
  });
  it("detects set volume and e1RM records", () => {
    const prs = detectPRs(prior, [{ loadKg: 95, reps: 8 }], o);
    expect(prs.map((p) => p.kind).sort()).toEqual(["e1rm", "max_reps_at_load", "max_set_volume"].sort());
  });
  it("only reports rep records for pure bodyweight exercises", () => {
    const prs = detectPRs([{ loadKg: 50, reps: 10 }], [{ loadKg: 60, reps: 12 }], { tracking: "reps", loadMode: "bodyweight" });
    expect(prs.map((p) => p.kind)).toEqual(["max_reps"]);
  });
  it("lists dominant rep records by load", () => {
    expect(repRecordsByLoad([{ loadKg: 100, reps: 5 }, { loadKg: 90, reps: 4 }, { loadKg: 80, reps: 10 }])).toEqual([
      { loadKg: 100, reps: 5 },
      { loadKg: 80, reps: 10 },
    ]);
  });
});

describe("muscle attribution", () => {
  it("separates direct and indirect work", () => {
    const m = attributeToMuscles([
      { primaryMuscleId: "chest", secondaryMuscleIds: ["triceps", "delts_front"], workingSets: 3, volumeKg: 1500 },
      { primaryMuscleId: "triceps", secondaryMuscleIds: [], workingSets: 2, volumeKg: 400 },
    ]);
    expect(m.get("chest")).toEqual({ directSets: 3, indirectSets: 0, directVolume: 1500, indirectVolume: 0 });
    expect(m.get("triceps")).toEqual({ directSets: 2, indirectSets: 3, directVolume: 400, indirectVolume: 1500 });
    expect(weightedSets(m.get("triceps")!, 0.5)).toBe(3.5);
    expect(weightedSets(m.get("triceps")!, 0)).toBe(2);
  });
  it("never counts the primary muscle twice", () => {
    const m = attributeToMuscles([{ primaryMuscleId: "chest", secondaryMuscleIds: ["chest"], workingSets: 3, volumeKg: 0 }]);
    expect(m.get("chest")).toMatchObject({ directSets: 3, indirectSets: 0 });
  });
});

describe("duration", () => {
  it("excludes paused time", () => {
    const startedAt = new Date("2026-10-20T10:00:00Z");
    expect(workoutDurationSeconds({ startedAt, endedAt: new Date("2026-10-20T11:00:00Z"), pausedAt: null, pausedSeconds: 600 })).toBe(3000);
    expect(
      workoutDurationSeconds({ startedAt, endedAt: null, pausedAt: new Date("2026-10-20T10:30:00Z"), pausedSeconds: 0 }, new Date("2026-10-20T12:00:00Z")),
    ).toBe(1800);
  });
});
