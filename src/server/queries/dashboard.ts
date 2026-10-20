import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { getCalendarRange } from "@/server/services/calendar";
import { getPeriodStats, loadFacts, loadMuscleInfo } from "@/server/services/stats";
import { getWorkoutDetail, getWorkoutPRs, type WorkoutPr } from "@/server/services/workouts";
import { addDays, endOfWeek, startOfWeek, type YMD } from "@/lib/dates";
import { listHistory } from "./history";
import { getSettings } from "./settings";

export interface WeekExercise {
  exerciseId: string;
  workingSets: number;
  volumeKg: number;
  primaryMuscleId: string;
  secondaryMuscleIds: string[];
}

export async function getDashboardData(today: YMD) {
  const settings = await getSettings();
  const opts = { bodyweightInVolume: settings.bodyweightInVolume, secondaryMuscleWeight: settings.secondaryMuscleWeight, weekStart: settings.weekStart };
  const weekFrom = startOfWeek(today, settings.weekStart);
  const weekTo = endOfWeek(today, settings.weekStart);
  const lastFrom = addDays(weekFrom, -7);
  const since30 = addDays(today, -30);

  const [week, lastWeek, calendar, recent, info, facts30, activeRow] = await Promise.all([
    getPeriodStats(db, { from: weekFrom, to: weekTo }, today, opts),
    loadFacts(db, { from: lastFrom, to: addDays(weekFrom, -1) }, opts),
    getCalendarRange(db, weekFrom, weekTo),
    listHistory({ limit: 4 }),
    loadMuscleInfo(db),
    loadFacts(db, { from: since30, to: today }, opts),
    db.select({ id: s.workouts.id, name: s.workouts.name }).from(s.workouts).where(eq(s.workouts.status, "active")).limit(1),
  ]);

  // Exercises of the current week (for the muscle map detail panel).
  const weekFacts = await loadFacts(db, { from: weekFrom, to: weekTo }, opts);
  const byExercise = new Map<string, WeekExercise>();
  for (const f of weekFacts.exercises) {
    const e = byExercise.get(f.exerciseId) ?? {
      exerciseId: f.exerciseId,
      workingSets: 0,
      volumeKg: 0,
      primaryMuscleId: info.primary.get(f.exerciseId) ?? "",
      secondaryMuscleIds: info.secondary.get(f.exerciseId) ?? [],
    };
    e.workingSets += f.workingSets;
    e.volumeKg += f.volumeKg;
    byExercise.set(f.exerciseId, e);
  }

  // Last time each top-level muscle group was trained directly (last 30 days).
  const lastTrained = new Map<string, YMD>();
  for (const f of facts30.exercises) {
    if (f.workingSets === 0) continue;
    const m = info.primary.get(f.exerciseId);
    if (!m) continue;
    const g = info.parent.get(m) ?? m;
    if (!lastTrained.has(g) || lastTrained.get(g)! < f.localDate) lastTrained.set(g, f.localDate);
  }

  // PRs of recent sessions (last 30 days, max 8 sessions).
  const recentIds = await db
    .select({ id: s.workouts.id })
    .from(s.workouts)
    .where(and(eq(s.workouts.status, "completed"), gte(s.workouts.localDate, since30)))
    .orderBy(desc(s.workouts.startedAt))
    .limit(8);
  const prs: (WorkoutPr & { date: YMD; workoutId: string })[] = [];
  for (const { id } of recentIds) {
    const detail = await getWorkoutDetail(db, id);
    if (!detail) continue;
    for (const pr of await getWorkoutPRs(db, detail)) prs.push({ ...pr, date: detail.localDate, workoutId: id });
  }

  return {
    settings,
    weekFrom,
    weekTo,
    week,
    lastWeek: {
      sessions: lastWeek.workouts.length,
      workingSets: lastWeek.exercises.reduce((a, f) => a + f.workingSets, 0),
      volumeKg: Math.round(lastWeek.exercises.reduce((a, f) => a + f.volumeKg, 0)),
    },
    calendar,
    recent,
    weekExercises: [...byExercise.values()].sort((a, b) => b.workingSets - a.workingSets),
    lastTrained: [...lastTrained.entries()].map(([groupId, date]) => ({ groupId, date })).sort((a, b) => b.date.localeCompare(a.date)),
    prs: prs.slice(0, 12),
    active: activeRow[0] ?? null,
  };
}
