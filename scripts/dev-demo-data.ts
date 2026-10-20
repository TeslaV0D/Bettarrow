/*
 * Development helper: fills an EMPTY database with 12 weeks of realistic demo training data
 * (via the real services, so all calculations are exercised). Never runs against a database that
 * already contains workouts unless --force is given.
 *   DATABASE_URL=... npx tsx scripts/dev-demo-data.ts
 */
import { sql } from "drizzle-orm";
import { createDb } from "../src/server/db/client";
import * as s from "../src/server/db/schema";
import { saveTemplate } from "../src/server/services/templates";
import { finishWorkout, getWorkoutDetail, startWorkout, syncWorkout } from "../src/server/services/workouts";
import { createRule } from "../src/server/services/calendar";
import { addDays, startOfWeek, todayIn } from "../src/lib/dates";

const url = process.env.DATABASE_URL ?? "postgres://bettarrow:bettarrow@localhost:5432/bettarrow";
const { db, close } = createDb(url, 2);
const TZ = "Europe/Berlin";

type Plan = { exerciseId: string; base: number; inc: number; reps: number[] }[];
const PUSH: Plan = [
  { exerciseId: "bench-press-barbell", base: 70, inc: 1.25, reps: [8, 8, 7] },
  { exerciseId: "incline-bench-press-dumbbell", base: 24, inc: 0.5, reps: [10, 9, 8] },
  { exerciseId: "lateral-raise-dumbbell", base: 9, inc: 0.25, reps: [15, 14, 12] },
  { exerciseId: "triceps-pushdown-rope", base: 25, inc: 0.5, reps: [12, 12, 10] },
  { exerciseId: "dip-chest", base: 0, inc: 1, reps: [10, 9, 8] },
];
const PULL: Plan = [
  { exerciseId: "pull-up", base: 0, inc: 1, reps: [8, 7, 6] },
  { exerciseId: "barbell-row", base: 60, inc: 1.25, reps: [10, 9, 8] },
  { exerciseId: "lat-pulldown", base: 55, inc: 1, reps: [12, 10, 10] },
  { exerciseId: "face-pull", base: 20, inc: 0.5, reps: [15, 15, 15] },
  { exerciseId: "ez-bar-curl", base: 27.5, inc: 0.5, reps: [10, 9, 8] },
];
const LEGS: Plan = [
  { exerciseId: "back-squat", base: 90, inc: 2.5, reps: [6, 6, 5] },
  { exerciseId: "romanian-deadlift-barbell", base: 80, inc: 2.5, reps: [8, 8, 8] },
  { exerciseId: "leg-press", base: 150, inc: 5, reps: [12, 10, 10] },
  { exerciseId: "lying-leg-curl", base: 40, inc: 1, reps: [12, 11, 10] },
  { exerciseId: "standing-calf-raise-machine", base: 60, inc: 2, reps: [15, 14, 12] },
  { exerciseId: "plank", base: 0, inc: 0, reps: [] },
];

async function main() {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from workouts`)) as unknown as { n: number }[];
  if (n > 0 && !process.argv.includes("--force")) {
    console.error(`Database already contains ${n} workouts – aborting (use --force to add anyway).`);
    process.exit(1);
  }
  const today = todayIn(TZ);
  const weeks = 12;
  const start = startOfWeek(addDays(today, -7 * weeks), 1);

  for (let w = 0; w <= weeks; w++) {
    await db
      .insert(s.bodyWeightEntries)
      .values({ date: addDays(start, w * 7), weightKg: Math.round((81 - w * 0.15 + (w % 3) * 0.2) * 10) / 10 })
      .onConflictDoNothing();
  }

  const tpl = {
    push: await saveTemplate(db, null, { name: "Push", description: "Brust, Schultern, Trizeps", items: PUSH.map((p) => ({ exerciseId: p.exerciseId, targetSets: 3 })) }),
    pull: await saveTemplate(db, null, { name: "Pull", description: "Rücken, Bizeps", items: PULL.map((p) => ({ exerciseId: p.exerciseId, targetSets: 3 })) }),
    legs: await saveTemplate(db, null, { name: "Legs", description: "Beine, Core", items: LEGS.map((p) => ({ exerciseId: p.exerciseId, targetSets: 3 })) }),
  };
  await createRule(db, { kind: "workout", templateId: tpl.push, weekdays: [1], startDate: addDays(today, 1) });
  await createRule(db, { kind: "workout", templateId: tpl.pull, weekdays: [3], startDate: addDays(today, 1) });
  await createRule(db, { kind: "workout", templateId: tpl.legs, weekdays: [5], startDate: addDays(today, 1) });

  let rev = Date.now();
  for (let w = 0; w < weeks; w++) {
    for (const [offset, key, plan] of [[0, "push", PUSH], [2, "pull", PULL], [4, "legs", LEGS]] as const) {
      if ((w * 3 + offset) % 11 === 7) continue; // occasionally skip a session
      const day = addDays(start, w * 7 + offset);
      const startedAt = new Date(`${day}T16:${String(10 + w).padStart(2, "0")}:00Z`);
      const { id } = await startWorkout(db, { templateId: tpl[key] }, { timezone: TZ, now: startedAt });
      const d = (await getWorkoutDetail(db, id))!;
      const exercises = d.exercises.map((e) => {
        const p = plan.find((x) => x.exerciseId === e.exerciseId)!;
        const weight = p.base + p.inc * Math.floor(w / 2);
        const reps = e.tracking === "duration" ? [60, 60, 45] : p.reps;
        return {
          id: e.id,
          exerciseId: e.exerciseId,
          notes: null,
          restSeconds: e.restSeconds,
          sets: reps.map((r, i) => ({
            id: e.sets[i]?.id ?? crypto.randomUUID(),
            setType: "working" as const,
            weightKg: e.loadMode === "external" ? weight : e.loadMode === "bodyweight_plus" && w > 6 ? 5 : null,
            reps: e.tracking === "reps" ? r + (w % 2) : null,
            durationSeconds: e.tracking === "duration" ? r + w * 5 : null,
            rir: e.tracking === "reps" ? 2 : null,
            rpe: null,
            note: null,
            completed: true,
            completedAt: new Date(startedAt.getTime() + (i + 1) * 180_000).toISOString(),
          })),
        };
      });
      rev += 1;
      const res = await syncWorkout(db, id, {
        revision: rev,
        baseRevision: d.revision,
        deviceId: "demo-data-script",
        name: d.name,
        notes: null,
        pausedAt: null,
        pausedSeconds: 0,
        bodyweightKg: d.bodyweightKg,
        exercises,
      });
      if (res.status !== "ok") throw new Error(`sync failed: ${JSON.stringify(res)}`);
      await finishWorkout(db, id, { now: new Date(startedAt.getTime() + (55 + (w % 4) * 5) * 60_000) });
    }
  }
  console.log("Demo data created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => close());
