import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/types";
import * as s from "@/server/db/schema";
import { addDays, diffDays, isoWeekday, startOfWeek, type YMD } from "@/lib/dates";
import {
  attributeToMuscles,
  estimate1RM,
  repRecordsByLoad,
  supportsE1RM,
  weightedSets,
  weightedVolume,
  workoutDurationSeconds,
  type LoadMode,
  type SetType,
  type Tracking,
} from "@/lib/training";

export interface StatsOptions {
  bodyweightInVolume: boolean;
  secondaryMuscleWeight: number;
  weekStart: number;
}

/** Volume of a set row; mirrors `setVolume` in src/lib/training.ts (kept in sync by tests). */
export function setVolumeSql(bodyweightInVolume: boolean): SQL {
  return sql`case when ${s.workoutSets.completed} and ${s.workoutSets.setType} <> 'warmup'
      and ${s.workoutExercises.tracking} = 'reps' and ${s.workoutExercises.loadMode} <> 'none'
      and (${s.workoutExercises.loadMode} = 'external' or ${bodyweightInVolume})
      and ${s.workoutSets.reps} > 0 and ${s.workoutSets.loadKg} is not null
    then ${s.workoutSets.loadKg} * ${s.workoutSets.reps} else 0 end`;
}

const workingSql = sql`(${s.workoutSets.completed} and ${s.workoutSets.setType} <> 'warmup')`;

export interface ExerciseFact {
  workoutId: string;
  localDate: YMD;
  exerciseId: string;
  workingSets: number;
  volumeKg: number;
  incomplete: boolean;
}

export interface WorkoutFact {
  id: string;
  name: string;
  localDate: YMD;
  durationSeconds: number;
}

/** Per workout-exercise aggregates of completed workouts in a date range (2 queries). */
export async function loadFacts(
  db: DbOrTx,
  range: { from: YMD | null; to: YMD | null },
  opts: Pick<StatsOptions, "bodyweightInVolume">,
): Promise<{ workouts: WorkoutFact[]; exercises: ExerciseFact[] }> {
  const conds = [eq(s.workouts.status, "completed")];
  if (range.from) conds.push(gte(s.workouts.localDate, range.from));
  if (range.to) conds.push(lte(s.workouts.localDate, range.to));
  const [workouts, exercises] = await Promise.all([
    db
      .select({
        id: s.workouts.id,
        name: s.workouts.name,
        localDate: s.workouts.localDate,
        startedAt: s.workouts.startedAt,
        endedAt: s.workouts.endedAt,
        pausedAt: s.workouts.pausedAt,
        pausedSeconds: s.workouts.pausedSeconds,
      })
      .from(s.workouts)
      .where(and(...conds))
      .orderBy(asc(s.workouts.startedAt)),
    db
      .select({
        workoutId: s.workoutExercises.workoutId,
        localDate: s.workouts.localDate,
        exerciseId: s.workoutExercises.exerciseId,
        workingSets: sql<number>`count(${s.workoutSets.id}) filter (where ${workingSql})::int`,
        volumeKg: sql<number>`coalesce(sum(${setVolumeSql(opts.bodyweightInVolume)}), 0)::float8`,
        incomplete: sql<boolean>`bool_or(${workingSql} and ${s.workoutExercises.tracking} = 'reps' and ${s.workoutExercises.loadMode} <> 'none'
          and (${s.workoutExercises.loadMode} = 'external' or ${opts.bodyweightInVolume})
          and (${s.workoutSets.reps} is null or ${s.workoutSets.reps} <= 0 or ${s.workoutSets.loadKg} is null))`,
      })
      .from(s.workoutExercises)
      .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
      .leftJoin(s.workoutSets, eq(s.workoutSets.workoutExerciseId, s.workoutExercises.id))
      .where(and(...conds))
      .groupBy(s.workoutExercises.id, s.workoutExercises.workoutId, s.workouts.localDate, s.workoutExercises.exerciseId),
  ]);
  return {
    workouts: workouts.map((w) => ({ id: w.id, name: w.name, localDate: w.localDate, durationSeconds: workoutDurationSeconds(w) })),
    exercises: exercises.map((e) => ({ ...e, incomplete: !!e.incomplete })),
  };
}

export interface MuscleInfo {
  primary: Map<string, string>;
  secondary: Map<string, string[]>;
  parent: Map<string, string | null>;
}

export async function loadMuscleInfo(db: DbOrTx): Promise<MuscleInfo> {
  const [ex, sec, muscles] = await Promise.all([
    db.select({ id: s.exercises.id, primary: s.exercises.primaryMuscleId }).from(s.exercises),
    db.select().from(s.exerciseSecondaryMuscles),
    db.select({ id: s.muscleGroups.id, parentId: s.muscleGroups.parentId }).from(s.muscleGroups),
  ]);
  const secondary = new Map<string, string[]>();
  for (const r of sec) secondary.set(r.exerciseId, [...(secondary.get(r.exerciseId) ?? []), r.muscleId]);
  return {
    primary: new Map(ex.map((e) => [e.id, e.primary])),
    secondary,
    parent: new Map(muscles.map((m) => [m.id, m.parentId])),
  };
}

export interface MuscleRow {
  muscleId: string;
  directSets: number;
  indirectSets: number;
  directVolume: number;
  indirectVolume: number;
  weightedSets: number;
  weightedVolume: number;
  /** Share of weighted sets among all muscles (0..1). */
  share: number;
}

export function muscleBreakdown(facts: ExerciseFact[], info: MuscleInfo, secondaryWeight: number): MuscleRow[] {
  const contributions = attributeToMuscles(
    facts.map((f) => ({
      primaryMuscleId: info.primary.get(f.exerciseId) ?? "unknown",
      secondaryMuscleIds: info.secondary.get(f.exerciseId) ?? [],
      workingSets: f.workingSets,
      volumeKg: f.volumeKg,
    })),
  );
  const rows = [...contributions.entries()].map(([muscleId, c]) => ({
    muscleId,
    ...c,
    weightedSets: weightedSets(c, secondaryWeight),
    weightedVolume: weightedVolume(c, secondaryWeight),
    share: 0,
  }));
  const total = rows.reduce((a, r) => a + r.weightedSets, 0);
  for (const r of rows) r.share = total ? r.weightedSets / total : 0;
  return rows.sort((a, b) => b.weightedSets - a.weightedSets);
}

export interface Bucket {
  key: YMD;
  sessions: number;
  workingSets: number;
  volumeKg: number;
}

/** Buckets (weekly or monthly) between from and to, including empty ones. */
export function bucketize(
  workouts: WorkoutFact[],
  facts: ExerciseFact[],
  from: YMD,
  to: YMD,
  unit: "week" | "month",
  weekStart: number,
): Bucket[] {
  const keyOf = (d: YMD) => (unit === "week" ? startOfWeek(d, weekStart) : d.slice(0, 8) + "01");
  const buckets = new Map<YMD, Bucket>();
  let cursor = keyOf(from);
  while (cursor <= to) {
    buckets.set(cursor, { key: cursor, sessions: 0, workingSets: 0, volumeKg: 0 });
    if (unit === "week") cursor = addDays(cursor, 7);
    else {
      const [y, m] = cursor.split("-").map(Number);
      cursor = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  for (const w of workouts) {
    const b = buckets.get(keyOf(w.localDate));
    if (b) b.sessions++;
  }
  for (const f of facts) {
    const b = buckets.get(keyOf(f.localDate));
    if (b) {
      b.workingSets += f.workingSets;
      b.volumeKg += f.volumeKg;
    }
  }
  return [...buckets.values()].map((b) => ({ ...b, volumeKg: Math.round(b.volumeKg) }));
}

/** Weekly streaks: weeks with at least one session. The current week counts as soon as it has one. */
export function weekStreaks(dates: YMD[], today: YMD, weekStart: number): { current: number; longest: number } {
  const weeks = new Set(dates.map((d) => startOfWeek(d, weekStart)));
  if (weeks.size === 0) return { current: 0, longest: 0 };
  const sorted = [...weeks].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = diffDays(sorted[i], sorted[i - 1]) === 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const thisWeek = startOfWeek(today, weekStart);
  let cursor = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }
  return { current, longest };
}

export interface PeriodStats {
  from: YMD;
  to: YMD;
  totals: {
    sessions: number;
    trainingDays: number;
    workingSets: number;
    volumeKg: number;
    volumeIncomplete: boolean;
    avgDurationSeconds: number;
    avgSetsPerSession: number;
  };
  bucketUnit: "week" | "month";
  buckets: Bucket[];
  consistency: { weeks: number; activeWeeks: number; currentStreak: number; longestStreak: number; avgSessionsPerWeek: number };
  muscles: MuscleRow[];
  /** Weighted sets per top-level muscle group per bucket. */
  groupTrend: { groupId: string; values: number[] }[];
  trainingDays: { date: YMD; sessions: number }[];
  topExercises: { exerciseId: string; workingSets: number; volumeKg: number; sessions: number }[];
}

export async function getPeriodStats(
  db: DbOrTx,
  range: { from: YMD | null; to: YMD | null },
  today: YMD,
  opts: StatsOptions,
): Promise<PeriodStats> {
  const [facts, info, allDates] = await Promise.all([
    loadFacts(db, range, opts),
    loadMuscleInfo(db),
    db.selectDistinct({ d: s.workouts.localDate }).from(s.workouts).where(eq(s.workouts.status, "completed")),
  ]);
  const from = range.from ?? facts.workouts[0]?.localDate ?? today;
  const to = range.to ?? today;
  const effectiveTo = to > today ? today : to;
  const days = Math.max(1, diffDays(to, from) + 1);
  const bucketUnit = days > 7 * 26 ? "month" : "week";
  const buckets = bucketize(facts.workouts, facts.exercises, from, to, bucketUnit, opts.weekStart);

  const sessions = facts.workouts.length;
  const workingSets = facts.exercises.reduce((a, f) => a + f.workingSets, 0);
  const volumeKg = facts.exercises.reduce((a, f) => a + f.volumeKg, 0);
  const dayCounts = new Map<YMD, number>();
  for (const w of facts.workouts) dayCounts.set(w.localDate, (dayCounts.get(w.localDate) ?? 0) + 1);

  // Consistency over the weeks of the period that already started.
  const firstWeek = startOfWeek(from, opts.weekStart);
  const lastWeek = startOfWeek(effectiveTo < from ? from : effectiveTo, opts.weekStart);
  const weekCount = Math.max(1, Math.floor(diffDays(lastWeek, firstWeek) / 7) + 1);
  const activeWeeks = new Set(facts.workouts.map((w) => startOfWeek(w.localDate, opts.weekStart))).size;
  const streaks = weekStreaks(allDates.map((r) => r.d), today, opts.weekStart);

  // Muscle groups over time (top-level groups, weighted sets).
  const groupOf = (m: string) => info.parent.get(m) ?? m;
  const keyOf = (d: YMD) => (bucketUnit === "week" ? startOfWeek(d, opts.weekStart) : d.slice(0, 8) + "01");
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));
  const trend = new Map<string, number[]>();
  for (const f of facts.exercises) {
    const idx = bucketIndex.get(keyOf(f.localDate));
    if (idx == null || f.workingSets === 0) continue;
    const add = (muscle: string, value: number) => {
      const g = groupOf(muscle);
      const arr = trend.get(g) ?? new Array(buckets.length).fill(0);
      arr[idx] += value;
      trend.set(g, arr);
    };
    const primary = info.primary.get(f.exerciseId);
    if (primary) add(primary, f.workingSets);
    const primaryGroup = primary ? groupOf(primary) : null;
    for (const m of info.secondary.get(f.exerciseId) ?? []) {
      // Indirect work inside the same group as the primary muscle is not counted twice.
      if (groupOf(m) !== primaryGroup) add(m, f.workingSets * opts.secondaryMuscleWeight);
    }
  }

  const byExercise = new Map<string, { workingSets: number; volumeKg: number; sessions: Set<string> }>();
  for (const f of facts.exercises) {
    const e = byExercise.get(f.exerciseId) ?? { workingSets: 0, volumeKg: 0, sessions: new Set<string>() };
    e.workingSets += f.workingSets;
    e.volumeKg += f.volumeKg;
    e.sessions.add(f.workoutId);
    byExercise.set(f.exerciseId, e);
  }

  return {
    from,
    to,
    totals: {
      sessions,
      trainingDays: dayCounts.size,
      workingSets,
      volumeKg: Math.round(volumeKg),
      volumeIncomplete: facts.exercises.some((f) => f.incomplete),
      avgDurationSeconds: sessions ? Math.round(facts.workouts.reduce((a, w) => a + w.durationSeconds, 0) / sessions) : 0,
      avgSetsPerSession: sessions ? Math.round((workingSets / sessions) * 10) / 10 : 0,
    },
    bucketUnit,
    buckets,
    consistency: {
      weeks: weekCount,
      activeWeeks,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      avgSessionsPerWeek: Math.round((sessions / weekCount) * 10) / 10,
    },
    muscles: muscleBreakdown(facts.exercises, info, opts.secondaryMuscleWeight),
    groupTrend: [...trend.entries()]
      .map(([groupId, values]) => ({ groupId, values: values.map((v) => Math.round(v * 10) / 10) }))
      .sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0)),
    trainingDays: [...dayCounts.entries()].map(([date, n]) => ({ date, sessions: n })).sort((a, b) => a.date.localeCompare(b.date)),
    topExercises: [...byExercise.entries()]
      .map(([exerciseId, e]) => ({ exerciseId, workingSets: e.workingSets, volumeKg: Math.round(e.volumeKg), sessions: e.sessions.size }))
      .sort((a, b) => b.workingSets - a.workingSets)
      .slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Exercise progress
// ---------------------------------------------------------------------------

export interface ExerciseSession {
  workoutId: string;
  workoutName: string;
  date: YMD;
  tracking: Tracking;
  loadMode: LoadMode;
  sets: { setType: SetType; weightKg: number | null; reps: number | null; durationSeconds: number | null; loadKg: number | null; rir: number | null; rpe: number | null; completed: boolean }[];
  /** Heaviest working set load */
  topLoad: number | null;
  /** Reps of the heaviest set */
  topLoadReps: number | null;
  bestE1rm: number | null;
  maxReps: number | null;
  totalReps: number;
  workingSets: number;
  volumeKg: number;
  maxDuration: number | null;
}

export interface ExerciseProgress {
  sessions: ExerciseSession[]; // oldest first
  records: {
    maxLoad: { value: number; date: YMD; reps: number | null } | null;
    maxSetVolume: { value: number; date: YMD; loadKg: number; reps: number } | null;
    bestE1rm: { value: number; date: YMD; loadKg: number; reps: number } | null;
    maxReps: { value: number; date: YMD } | null;
    maxDuration: { value: number; date: YMD } | null;
    repsByLoad: { loadKg: number; reps: number }[];
  };
}

export async function getExerciseProgress(db: DbOrTx, exerciseId: string, opts: Pick<StatsOptions, "bodyweightInVolume">): Promise<ExerciseProgress> {
  const rows = await db
    .select({
      workoutId: s.workouts.id,
      workoutName: s.workouts.name,
      date: s.workouts.localDate,
      startedAt: s.workouts.startedAt,
      weId: s.workoutExercises.id,
      tracking: s.workoutExercises.tracking,
      loadMode: s.workoutExercises.loadMode,
      setType: s.workoutSets.setType,
      weightKg: s.workoutSets.weightKg,
      reps: s.workoutSets.reps,
      durationSeconds: s.workoutSets.durationSeconds,
      loadKg: s.workoutSets.loadKg,
      rir: s.workoutSets.rir,
      rpe: s.workoutSets.rpe,
      completed: s.workoutSets.completed,
    })
    .from(s.workoutSets)
    .innerJoin(s.workoutExercises, eq(s.workoutExercises.id, s.workoutSets.workoutExerciseId))
    .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
    .where(and(eq(s.workouts.status, "completed"), eq(s.workoutExercises.exerciseId, exerciseId)))
    .orderBy(asc(s.workouts.startedAt), asc(s.workoutExercises.position), asc(s.workoutSets.position));

  const sessions = new Map<string, ExerciseSession>();
  for (const r of rows) {
    let sess = sessions.get(r.workoutId);
    if (!sess) {
      sess = {
        workoutId: r.workoutId,
        workoutName: r.workoutName,
        date: r.date,
        tracking: r.tracking as Tracking,
        loadMode: r.loadMode as LoadMode,
        sets: [],
        topLoad: null,
        topLoadReps: null,
        bestE1rm: null,
        maxReps: null,
        totalReps: 0,
        workingSets: 0,
        volumeKg: 0,
        maxDuration: null,
      };
      sessions.set(r.workoutId, sess);
    }
    sess.sets.push({ setType: r.setType as SetType, weightKg: r.weightKg, reps: r.reps, durationSeconds: r.durationSeconds, loadKg: r.loadKg, rir: r.rir, rpe: r.rpe, completed: r.completed });
  }

  const out = [...sessions.values()];
  const records: ExerciseProgress["records"] = { maxLoad: null, maxSetVolume: null, bestE1rm: null, maxReps: null, maxDuration: null, repsByLoad: [] };
  const prSets: { loadKg: number | null; reps: number | null }[] = [];
  for (const sess of out) {
    const working = sess.sets.filter((x) => x.completed && x.setType !== "warmup");
    sess.workingSets = working.length;
    const hasLoad = sess.loadMode !== "none" && sess.loadMode !== "bodyweight";
    for (const x of working) {
      if (x.reps != null && x.reps > 0) {
        sess.totalReps += x.reps;
        sess.maxReps = Math.max(sess.maxReps ?? 0, x.reps);
        if (!records.maxReps || x.reps > records.maxReps.value) records.maxReps = { value: x.reps, date: sess.date };
      }
      if (x.durationSeconds != null) {
        sess.maxDuration = Math.max(sess.maxDuration ?? 0, x.durationSeconds);
        if (!records.maxDuration || x.durationSeconds > records.maxDuration.value) records.maxDuration = { value: x.durationSeconds, date: sess.date };
      }
      const countsVolume = sess.tracking === "reps" && sess.loadMode !== "none" && (sess.loadMode === "external" || opts.bodyweightInVolume);
      if (countsVolume && x.loadKg != null && x.reps != null && x.reps > 0) sess.volumeKg += x.loadKg * x.reps;
      if (!hasLoad || x.loadKg == null || x.loadKg <= 0) continue;
      if (sess.topLoad == null || x.loadKg > sess.topLoad || (x.loadKg === sess.topLoad && (x.reps ?? 0) > (sess.topLoadReps ?? 0))) {
        sess.topLoad = x.loadKg;
        sess.topLoadReps = x.reps;
      }
      if (!records.maxLoad || x.loadKg > records.maxLoad.value) records.maxLoad = { value: x.loadKg, date: sess.date, reps: x.reps };
      if (x.reps != null && x.reps > 0) {
        prSets.push({ loadKg: x.loadKg, reps: x.reps });
        const vol = x.loadKg * x.reps;
        if (!records.maxSetVolume || vol > records.maxSetVolume.value) records.maxSetVolume = { value: Math.round(vol * 10) / 10, date: sess.date, loadKg: x.loadKg, reps: x.reps };
        if (supportsE1RM(sess.tracking, sess.loadMode)) {
          const e = estimate1RM(x.loadKg, x.reps);
          if (e != null) {
            sess.bestE1rm = Math.max(sess.bestE1rm ?? 0, e);
            if (!records.bestE1rm || e > records.bestE1rm.value) records.bestE1rm = { value: e, date: sess.date, loadKg: x.loadKg, reps: x.reps };
          }
        }
      }
    }
    sess.volumeKg = Math.round(sess.volumeKg * 10) / 10;
  }
  records.repsByLoad = repRecordsByLoad(prSets);
  return { sessions: out, records };
}

/** ISO weekday helper re-export for UI week strips. */
export { isoWeekday };
