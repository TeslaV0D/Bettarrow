import { and, asc, desc, eq, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/types";
import * as s from "@/server/db/schema";
import {
  buildPrefillSets,
  computeLoad,
  detectPRs,
  isBodyweightMode,
  isWorkingSet,
  type HistorySet,
  type LoadMode,
  type PrAchievement,
  type SetType,
  type Tracking,
} from "@/lib/training";
import { todayIn, type YMD } from "@/lib/dates";
import { syncPayloadSchema, type SyncResult } from "@/lib/workout-schema";
import { getCalendarRange, materializeEntry } from "./calendar";

export type WorkoutStatus = "active" | "completed" | "discarded";

// ---------------------------------------------------------------------------
// Prefill / previous values
// ---------------------------------------------------------------------------

export interface PrefillSource {
  workoutId: string;
  date: YMD;
  sets: HistorySet[];
}

/**
 * For each exercise, finds the most recent *completed* workout that contains at least one completed
 * set of that exercise and returns those sets. Discarded and active workouts are never used.
 * Two queries in total, independent of the number of exercises.
 */
export async function loadPrefill(
  db: DbOrTx,
  exerciseIds: string[],
  opts: { excludeWorkoutId?: string; before?: Date } = {},
): Promise<Map<string, PrefillSource>> {
  const result = new Map<string, PrefillSource>();
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return result;

  const conditions = [
    eq(s.workouts.status, "completed"),
    inArray(s.workoutExercises.exerciseId, ids),
    sql`exists (select 1 from ${s.workoutSets} ws where ws.workout_exercise_id = "workout_exercises"."id" and ws.completed)`,
  ];
  if (opts.excludeWorkoutId) conditions.push(ne(s.workouts.id, opts.excludeWorkoutId));
  if (opts.before) conditions.push(lt(s.workouts.startedAt, opts.before));

  const latest = await db
    .selectDistinctOn([s.workoutExercises.exerciseId], {
      workoutExerciseId: s.workoutExercises.id,
      exerciseId: s.workoutExercises.exerciseId,
      workoutId: s.workouts.id,
      date: s.workouts.localDate,
    })
    .from(s.workoutExercises)
    .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
    .where(and(...conditions))
    .orderBy(s.workoutExercises.exerciseId, desc(s.workouts.startedAt), asc(s.workoutExercises.position));

  if (latest.length === 0) return result;
  const sets = await db
    .select({
      workoutExerciseId: s.workoutSets.workoutExerciseId,
      setType: s.workoutSets.setType,
      weightKg: s.workoutSets.weightKg,
      reps: s.workoutSets.reps,
      durationSeconds: s.workoutSets.durationSeconds,
      completed: s.workoutSets.completed,
    })
    .from(s.workoutSets)
    .where(inArray(s.workoutSets.workoutExerciseId, latest.map((l) => l.workoutExerciseId)))
    .orderBy(asc(s.workoutSets.position));

  const byWe = new Map<string, HistorySet[]>();
  for (const st of sets) {
    const list = byWe.get(st.workoutExerciseId) ?? [];
    list.push({
      setType: st.setType as SetType,
      weightKg: st.weightKg,
      reps: st.reps,
      durationSeconds: st.durationSeconds,
      completed: st.completed,
    });
    byWe.set(st.workoutExerciseId, list);
  }
  for (const l of latest) {
    result.set(l.exerciseId, {
      workoutId: l.workoutId,
      date: l.date,
      sets: (byWe.get(l.workoutExerciseId) ?? []).filter((x) => x.completed),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export interface StartInput {
  templateId?: string | null;
  plannedEntryId?: string | null;
  repeatWorkoutId?: string | null;
  name?: string | null;
}

interface PlannedExercise {
  exerciseId: string;
  targetSets: number | null;
  repMin: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export async function getActiveWorkoutId(db: DbOrTx): Promise<string | null> {
  const [row] = await db.select({ id: s.workouts.id }).from(s.workouts).where(eq(s.workouts.status, "active")).limit(1);
  return row?.id ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Starts a workout. If a workout is already active, it is returned instead (`existing: true`), so
 * double clicks, reloads or concurrent requests never create duplicate sessions. A partial unique
 * index on `workouts(status) where status = 'active'` enforces this at the database level as well.
 */
export async function startWorkout(
  db: Db,
  input: StartInput,
  ctx: { timezone: string; now?: Date },
): Promise<{ id: string; existing: boolean }> {
  const now = ctx.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const active = await getActiveWorkoutId(tx);
      if (active) return { id: active, existing: true };

      let templateId = input.templateId ?? null;
      let plannedEntryId: string | null = null;
      let name = input.name?.trim() || null;
      let planned: PlannedExercise[] = [];

      if (input.plannedEntryId) {
        plannedEntryId = await materializeEntry(tx, input.plannedEntryId);
        const [entry] = await tx.select().from(s.plannedEntries).where(eq(s.plannedEntries.id, plannedEntryId)).limit(1);
        if (!entry) throw new Error("Geplanter Eintrag nicht gefunden");
        if (entry.kind !== "workout") throw new Error("Ein Ruhetag kann nicht gestartet werden");
        templateId = templateId ?? entry.templateId;
        name = name ?? entry.title;
      }

      if (input.repeatWorkoutId) {
        const [src] = await tx.select({ name: s.workouts.name, templateId: s.workouts.templateId }).from(s.workouts).where(eq(s.workouts.id, input.repeatWorkoutId)).limit(1);
        if (!src) throw new Error("Training nicht gefunden");
        name = name ?? src.name;
        templateId = templateId ?? src.templateId;
        const rows = await tx
          .select({
            exerciseId: s.workoutExercises.exerciseId,
            restSeconds: s.workoutExercises.restSeconds,
            setCount: sql<number>`(select count(*)::int from ${s.workoutSets} ws where ws.workout_exercise_id = "workout_exercises"."id" and ws.completed and ws.set_type <> 'warmup')`,
          })
          .from(s.workoutExercises)
          .where(eq(s.workoutExercises.workoutId, input.repeatWorkoutId))
          .orderBy(asc(s.workoutExercises.position));
        planned = rows.map((r) => ({ exerciseId: r.exerciseId, targetSets: r.setCount || null, repMin: null, restSeconds: r.restSeconds, notes: null }));
      } else if (templateId) {
        const [tpl] = await tx.select({ name: s.templates.name }).from(s.templates).where(eq(s.templates.id, templateId)).limit(1);
        if (!tpl) throw new Error("Vorlage nicht gefunden");
        name = name ?? tpl.name;
        planned = await tx
          .select({
            exerciseId: s.templateExercises.exerciseId,
            targetSets: s.templateExercises.targetSets,
            repMin: s.templateExercises.repMin,
            restSeconds: s.templateExercises.restSeconds,
            notes: s.templateExercises.notes,
          })
          .from(s.templateExercises)
          .where(eq(s.templateExercises.templateId, templateId))
          .orderBy(asc(s.templateExercises.position));
      }

      const localDate = todayIn(ctx.timezone, now);

      // Starting a template that is planned for today completes that plan entry automatically.
      if (!plannedEntryId && templateId) {
        plannedEntryId = await findPlannedEntryForToday(tx, templateId, localDate);
      }
      const [bw] = await tx
        .select({ weightKg: s.bodyWeightEntries.weightKg })
        .from(s.bodyWeightEntries)
        .where(sql`${s.bodyWeightEntries.date} <= ${localDate}`)
        .orderBy(desc(s.bodyWeightEntries.date))
        .limit(1);
      const bodyweightKg = bw?.weightKg ?? null;

      const [workout] = await tx
        .insert(s.workouts)
        .values({
          name: name ?? "Freies Training",
          templateId,
          plannedEntryId,
          status: "active",
          startedAt: now,
          localDate,
          bodyweightKg,
          revision: 0,
        })
        .returning({ id: s.workouts.id });

      if (planned.length > 0) {
        await insertExercisesWithPrefill(tx, workout.id, planned, 0, bodyweightKg);
      }
      return { id: workout.id, existing: false };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const active = await getActiveWorkoutId(db);
      if (active) return { id: active, existing: true };
    }
    throw err;
  }
}

async function findPlannedEntryForToday(tx: DbOrTx, templateId: string, date: YMD): Promise<string | null> {
  const range = await getCalendarRange(tx, date, date);
  const match = range.entries.find((e) => e.kind === "workout" && e.status === "planned" && e.templateId === templateId);
  if (!match) return null;
  if (match.virtual) return materializeEntry(tx, match.id);
  const linked = await tx.select({ id: s.workouts.id }).from(s.workouts).where(and(eq(s.workouts.plannedEntryId, match.id), ne(s.workouts.status, "discarded"))).limit(1);
  if (linked.length) return null;
  return materializeEntry(tx, match.id);
}

async function insertExercisesWithPrefill(
  tx: DbOrTx,
  workoutId: string,
  planned: PlannedExercise[],
  startPosition: number,
  bodyweightKg: number | null,
): Promise<string[]> {
  const exerciseIds = [...new Set(planned.map((p) => p.exerciseId))];
  const meta = await tx
    .select({
      id: s.exercises.id,
      tracking: s.exercises.tracking,
      loadMode: s.exercises.loadMode,
      bodyweightFactor: s.exercises.bodyweightFactor,
      restSeconds: s.exercises.restSeconds,
      repMin: s.exercises.repMin,
    })
    .from(s.exercises)
    .where(inArray(s.exercises.id, exerciseIds));
  const metaById = new Map(meta.map((m) => [m.id, m]));
  const prefill = await loadPrefill(tx, exerciseIds, { excludeWorkoutId: workoutId });

  const weRows: (typeof s.workoutExercises.$inferInsert)[] = [];
  const setRows: (typeof s.workoutSets.$inferInsert)[] = [];
  planned.forEach((p, i) => {
    const m = metaById.get(p.exerciseId);
    if (!m) throw new Error(`Übung nicht gefunden: ${p.exerciseId}`);
    const weId = crypto.randomUUID();
    weRows.push({
      id: weId,
      workoutId,
      exerciseId: p.exerciseId,
      position: startPosition + i,
      notes: p.notes,
      restSeconds: p.restSeconds ?? m.restSeconds,
      tracking: m.tracking,
      loadMode: m.loadMode,
      bodyweightFactor: m.bodyweightFactor,
    });
    const sets = buildPrefillSets(prefill.get(p.exerciseId)?.sets ?? null, {
      targetSets: p.targetSets,
      repMin: m.tracking === "reps" ? (p.repMin ?? null) : null,
    });
    sets.forEach((st, j) => {
      const loadMode = m.loadMode as LoadMode;
      const bw = isBodyweightMode(loadMode) ? bodyweightKg : null;
      setRows.push({
        id: crypto.randomUUID(),
        workoutExerciseId: weId,
        position: j,
        setType: st.setType,
        weightKg: st.weightKg,
        reps: st.reps,
        durationSeconds: st.durationSeconds,
        completed: false,
        bodyweightKg: bw,
        loadKg: computeLoad({ loadMode, bodyweightFactor: m.bodyweightFactor, bodyweightKg: bw, weightKg: st.weightKg }),
      });
    });
  });
  if (weRows.length) await tx.insert(s.workoutExercises).values(weRows);
  if (setRows.length) await tx.insert(s.workoutSets).values(setRows);
  return weRows.map((r) => r.id as string);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface WorkoutSetRow {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rir: number | null;
  rpe: number | null;
  note: string | null;
  completed: boolean;
  completedAt: Date | null;
  bodyweightKg: number | null;
  loadKg: number | null;
}

export interface WorkoutExerciseRow {
  id: string;
  exerciseId: string;
  position: number;
  notes: string | null;
  restSeconds: number | null;
  tracking: Tracking;
  loadMode: LoadMode;
  bodyweightFactor: number;
  sets: WorkoutSetRow[];
}

export type WorkoutRow = typeof s.workouts.$inferSelect;

export interface WorkoutDetail extends WorkoutRow {
  exercises: WorkoutExerciseRow[];
}

export async function getWorkoutDetail(db: DbOrTx, id: string): Promise<WorkoutDetail | null> {
  const [w] = await db.select().from(s.workouts).where(eq(s.workouts.id, id)).limit(1);
  if (!w) return null;
  const exRows = await db.select().from(s.workoutExercises).where(eq(s.workoutExercises.workoutId, id)).orderBy(asc(s.workoutExercises.position));
  const setRows = exRows.length
    ? await db.select().from(s.workoutSets).where(inArray(s.workoutSets.workoutExerciseId, exRows.map((e) => e.id))).orderBy(asc(s.workoutSets.position))
    : [];
  const setsByWe = new Map<string, WorkoutSetRow[]>();
  for (const r of setRows) {
    const list = setsByWe.get(r.workoutExerciseId) ?? [];
    list.push({ ...r, setType: r.setType as SetType });
    setsByWe.set(r.workoutExerciseId, list);
  }
  return {
    ...w,
    exercises: exRows.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      position: e.position,
      notes: e.notes,
      restSeconds: e.restSeconds,
      tracking: e.tracking as Tracking,
      loadMode: e.loadMode as LoadMode,
      bodyweightFactor: e.bodyweightFactor,
      sets: setsByWe.get(e.id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Sync (autosave)
// ---------------------------------------------------------------------------

/**
 * Applies a full snapshot of a workout (idempotent upsert by client-generated ids).
 * - Snapshots carry a monotonically increasing client revision; older or repeated snapshots are
 *   ignored ("stale"), so retries and out-of-order deliveries never duplicate or roll back data.
 * - A snapshot based on an outdated server revision from a *different* device is rejected as conflict.
 * - Calculation snapshots (load mode, factor) are taken from the exercise when it is first added.
 */
export async function syncWorkout(db: Db, id: string, raw: unknown): Promise<SyncResult> {
  const parsed = syncPayloadSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", message: parsed.error.issues[0]?.message ?? "Ungültige Daten" };
  const p = parsed.data;

  return db.transaction(async (tx) => {
    const [w] = await tx
      .select({ id: s.workouts.id, status: s.workouts.status, revision: s.workouts.revision, syncDeviceId: s.workouts.syncDeviceId })
      .from(s.workouts)
      .where(eq(s.workouts.id, id))
      .for("update")
      .limit(1);
    if (!w || w.status === "discarded") return { status: "not_found" } as const;
    if (p.revision <= w.revision) return { status: "stale", revision: w.revision } as const;
    if (w.syncDeviceId && w.syncDeviceId !== p.deviceId && p.baseRevision < w.revision) {
      return { status: "conflict", revision: w.revision } as const;
    }

    // Validate exercise references and ownership of existing rows.
    const exerciseIds = [...new Set(p.exercises.map((e) => e.exerciseId))];
    const meta = exerciseIds.length
      ? await tx
          .select({ id: s.exercises.id, tracking: s.exercises.tracking, loadMode: s.exercises.loadMode, bodyweightFactor: s.exercises.bodyweightFactor })
          .from(s.exercises)
          .where(inArray(s.exercises.id, exerciseIds))
      : [];
    const metaById = new Map(meta.map((m) => [m.id, m]));
    for (const e of p.exercises) {
      if (!metaById.has(e.exerciseId)) return { status: "invalid", message: `Unbekannte Übung: ${e.exerciseId}` } as const;
    }
    const existing = await tx
      .select({ id: s.workoutExercises.id, exerciseId: s.workoutExercises.exerciseId, tracking: s.workoutExercises.tracking, loadMode: s.workoutExercises.loadMode, bodyweightFactor: s.workoutExercises.bodyweightFactor })
      .from(s.workoutExercises)
      .where(eq(s.workoutExercises.workoutId, id));
    const existingById = new Map(existing.map((e) => [e.id, e]));

    const incomingWeIds = p.exercises.map((e) => e.id);
    if (incomingWeIds.length) {
      const foreign = await tx
        .select({ id: s.workoutExercises.id })
        .from(s.workoutExercises)
        .where(and(inArray(s.workoutExercises.id, incomingWeIds), ne(s.workoutExercises.workoutId, id)))
        .limit(1);
      if (foreign.length) return { status: "invalid", message: "Ungültige Übungs-ID" } as const;
      const setIds = p.exercises.flatMap((e) => e.sets.map((x) => x.id));
      if (setIds.length) {
        const foreignSets = await tx
          .select({ id: s.workoutSets.id })
          .from(s.workoutSets)
          .innerJoin(s.workoutExercises, eq(s.workoutExercises.id, s.workoutSets.workoutExerciseId))
          .where(and(inArray(s.workoutSets.id, setIds), ne(s.workoutExercises.workoutId, id)))
          .limit(1);
        if (foreignSets.length) return { status: "invalid", message: "Ungültige Satz-ID" } as const;
      }
    }

    await tx
      .update(s.workouts)
      .set({
        name: p.name,
        notes: p.notes,
        pausedAt: p.pausedAt ? new Date(p.pausedAt) : null,
        pausedSeconds: p.pausedSeconds,
        bodyweightKg: p.bodyweightKg,
        revision: p.revision,
        syncDeviceId: p.deviceId,
        updatedAt: new Date(),
      })
      .where(eq(s.workouts.id, id));

    // Remove exercises that are no longer part of the snapshot (sets cascade).
    const removed = existing.filter((e) => !incomingWeIds.includes(e.id)).map((e) => e.id);
    if (removed.length) await tx.delete(s.workoutExercises).where(inArray(s.workoutExercises.id, removed));

    const weRows = p.exercises.map((e, i) => {
      const prev = existingById.get(e.id);
      // Keep the calculation snapshot unless the exercise itself was swapped.
      const snap = prev && prev.exerciseId === e.exerciseId ? prev : metaById.get(e.exerciseId)!;
      return {
        id: e.id,
        workoutId: id,
        exerciseId: e.exerciseId,
        position: i,
        notes: e.notes,
        restSeconds: e.restSeconds,
        tracking: snap.tracking,
        loadMode: snap.loadMode,
        bodyweightFactor: snap.bodyweightFactor,
      };
    });
    if (weRows.length) {
      await tx
        .insert(s.workoutExercises)
        .values(weRows)
        .onConflictDoUpdate({
          target: s.workoutExercises.id,
          set: {
            exerciseId: sql`excluded.exercise_id`,
            position: sql`excluded.position`,
            notes: sql`excluded.notes`,
            restSeconds: sql`excluded.rest_seconds`,
            tracking: sql`excluded.tracking`,
            loadMode: sql`excluded.load_mode`,
            bodyweightFactor: sql`excluded.bodyweight_factor`,
          },
        });
    }

    // Sets: delete those missing from the snapshot, upsert the rest.
    if (incomingWeIds.length) {
      const keepSetIds = p.exercises.flatMap((e) => e.sets.map((x) => x.id));
      await tx
        .delete(s.workoutSets)
        .where(
          keepSetIds.length
            ? and(inArray(s.workoutSets.workoutExerciseId, incomingWeIds), notInArray(s.workoutSets.id, keepSetIds))
            : inArray(s.workoutSets.workoutExerciseId, incomingWeIds),
        );
    }
    const setRows = p.exercises.flatMap((e, i) => {
      const we = weRows[i];
      const loadMode = we.loadMode as LoadMode;
      const bw = isBodyweightMode(loadMode) ? p.bodyweightKg : null;
      return e.sets.map((st, j) => ({
        id: st.id,
        workoutExerciseId: e.id,
        position: j,
        setType: st.setType,
        weightKg: loadMode === "bodyweight" || loadMode === "none" ? null : st.weightKg,
        reps: we.tracking === "reps" ? st.reps : null,
        durationSeconds: we.tracking === "duration" ? st.durationSeconds : null,
        rir: st.rir,
        rpe: st.rpe,
        note: st.note,
        completed: st.completed,
        completedAt: st.completed ? (st.completedAt ? new Date(st.completedAt) : new Date()) : null,
        bodyweightKg: bw,
        loadKg: computeLoad({ loadMode, bodyweightFactor: we.bodyweightFactor, bodyweightKg: bw, weightKg: st.weightKg }),
      }));
    });
    if (setRows.length) {
      await tx
        .insert(s.workoutSets)
        .values(setRows)
        .onConflictDoUpdate({
          target: s.workoutSets.id,
          set: {
            workoutExerciseId: sql`excluded.workout_exercise_id`,
            position: sql`excluded.position`,
            setType: sql`excluded.set_type`,
            weightKg: sql`excluded.weight_kg`,
            reps: sql`excluded.reps`,
            durationSeconds: sql`excluded.duration_seconds`,
            rir: sql`excluded.rir`,
            rpe: sql`excluded.rpe`,
            note: sql`excluded.note`,
            completed: sql`excluded.completed`,
            completedAt: sql`excluded.completed_at`,
            bodyweightKg: sql`excluded.bodyweight_kg`,
            loadKg: sql`excluded.load_kg`,
          },
        });
    }
    return { status: "ok", revision: p.revision } as const;
  });
}

/** Adds exercises with prefilled sets to a workout (server-side, used outside the live editor). */
export async function addExercisesToWorkout(db: Db, workoutId: string, exerciseIds: string[]) {
  return db.transaction(async (tx) => {
    const [w] = await tx.select({ bodyweightKg: s.workouts.bodyweightKg }).from(s.workouts).where(eq(s.workouts.id, workoutId)).limit(1);
    if (!w) throw new Error("Training nicht gefunden");
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${s.workoutExercises.position}), -1)::int` })
      .from(s.workoutExercises)
      .where(eq(s.workoutExercises.workoutId, workoutId));
    return insertExercisesWithPrefill(
      tx,
      workoutId,
      exerciseIds.map((exerciseId) => ({ exerciseId, targetSets: null, repMin: null, restSeconds: null, notes: null })),
      max + 1,
      w.bodyweightKg,
    );
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type IncompleteSetPolicy = "discard" | "complete" | "keep";

/**
 * Finishes an active workout. Only this explicit action marks a session as completed.
 * Sets that were never ticked off are discarded (default) or marked complete, depending on policy;
 * exercises without any remaining set are removed.
 */
export async function finishWorkout(
  db: Db,
  id: string,
  opts: { notes?: string | null; incomplete?: IncompleteSetPolicy; now?: Date } = {},
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_active" }> {
  const now = opts.now ?? new Date();
  const policy = opts.incomplete ?? "discard";
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(s.workouts).where(eq(s.workouts.id, id)).for("update").limit(1);
    if (!w) return { ok: false, reason: "not_found" } as const;
    if (w.status !== "active") return { ok: false, reason: "not_active" } as const;

    const weIds = (await tx.select({ id: s.workoutExercises.id }).from(s.workoutExercises).where(eq(s.workoutExercises.workoutId, id))).map((r) => r.id);
    if (weIds.length) {
      const incompleteWhere = and(inArray(s.workoutSets.workoutExerciseId, weIds), eq(s.workoutSets.completed, false));
      if (policy === "discard") await tx.delete(s.workoutSets).where(incompleteWhere);
      else if (policy === "complete") await tx.update(s.workoutSets).set({ completed: true, completedAt: now }).where(incompleteWhere);
      await tx
        .delete(s.workoutExercises)
        .where(
          and(
            eq(s.workoutExercises.workoutId, id),
            sql`not exists (select 1 from ${s.workoutSets} ws where ws.workout_exercise_id = "workout_exercises"."id")`,
          ),
        );
    }

    // If the workout is still paused, the pause ends with the workout.
    const pausedSeconds = w.pausedAt ? w.pausedSeconds + Math.max(0, Math.floor((now.getTime() - w.pausedAt.getTime()) / 1000)) : w.pausedSeconds;
    await tx
      .update(s.workouts)
      .set({
        status: "completed",
        endedAt: now,
        pausedAt: null,
        pausedSeconds,
        notes: opts.notes !== undefined ? opts.notes : w.notes,
        revision: Math.max(w.revision + 1, now.getTime()),
        updatedAt: now,
      })
      .where(eq(s.workouts.id, id));

    if (w.plannedEntryId) {
      await tx.update(s.plannedEntries).set({ status: "completed", updatedAt: now }).where(eq(s.plannedEntries.id, w.plannedEntryId));
    }
    return { ok: true } as const;
  });
}

/** Marks an active workout as discarded. It is kept (for undo) but excluded from history and stats. */
export async function discardWorkout(db: Db, id: string): Promise<boolean> {
  const res = await db
    .update(s.workouts)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(s.workouts.id, id), eq(s.workouts.status, "active")))
    .returning({ id: s.workouts.id });
  return res.length > 0;
}

/** Undo of `discardWorkout`. Fails if another workout became active in the meantime. */
export async function restoreDiscardedWorkout(db: Db, id: string): Promise<boolean> {
  try {
    const res = await db
      .update(s.workouts)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(s.workouts.id, id), eq(s.workouts.status, "discarded")))
      .returning({ id: s.workouts.id });
    return res.length > 0;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** Permanently deletes a workout (history entry). Planned entries linked to it become "planned" again. */
export async function deleteWorkout(db: Db, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [w] = await tx.select({ plannedEntryId: s.workouts.plannedEntryId, status: s.workouts.status }).from(s.workouts).where(eq(s.workouts.id, id)).limit(1);
    if (!w) return false;
    await tx.delete(s.workouts).where(eq(s.workouts.id, id));
    if (w.plannedEntryId && w.status === "completed") {
      await tx.update(s.plannedEntries).set({ status: "planned", updatedAt: new Date() }).where(eq(s.plannedEntries.id, w.plannedEntryId));
    }
    return true;
  });
}

/** Removes discarded workouts older than the given age (housekeeping). */
export async function purgeDiscardedWorkouts(db: Db, olderThan: Date): Promise<number> {
  const res = await db
    .delete(s.workouts)
    .where(and(eq(s.workouts.status, "discarded"), lt(s.workouts.updatedAt, olderThan)))
    .returning({ id: s.workouts.id });
  return res.length;
}

// ---------------------------------------------------------------------------
// Personal records of a session
// ---------------------------------------------------------------------------

export interface WorkoutPr extends PrAchievement {
  exerciseId: string;
}

/** PRs achieved in `workout` compared to all completed workouts that started before it. */
export async function getWorkoutPRs(db: DbOrTx, workout: WorkoutDetail): Promise<WorkoutPr[]> {
  const exerciseIds = [...new Set(workout.exercises.map((e) => e.exerciseId))];
  if (exerciseIds.length === 0) return [];
  const prior = await db
    .select({ exerciseId: s.workoutExercises.exerciseId, loadKg: s.workoutSets.loadKg, reps: s.workoutSets.reps })
    .from(s.workoutSets)
    .innerJoin(s.workoutExercises, eq(s.workoutExercises.id, s.workoutSets.workoutExerciseId))
    .innerJoin(s.workouts, eq(s.workouts.id, s.workoutExercises.workoutId))
    .where(
      and(
        eq(s.workouts.status, "completed"),
        lt(s.workouts.startedAt, workout.startedAt),
        inArray(s.workoutExercises.exerciseId, exerciseIds),
        eq(s.workoutSets.completed, true),
        ne(s.workoutSets.setType, "warmup"),
      ),
    );
  const priorBy = new Map<string, { loadKg: number | null; reps: number | null }[]>();
  for (const r of prior) {
    const list = priorBy.get(r.exerciseId) ?? [];
    list.push(r);
    priorBy.set(r.exerciseId, list);
  }
  const out: WorkoutPr[] = [];
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    if (seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    const current = workout.exercises
      .filter((e) => e.exerciseId === ex.exerciseId)
      .flatMap((e) => e.sets)
      .filter((st) => isWorkingSet(st))
      .map((st) => ({ loadKg: st.loadKg, reps: st.reps }));
    for (const pr of detectPRs(priorBy.get(ex.exerciseId) ?? [], current, { tracking: ex.tracking, loadMode: ex.loadMode })) {
      out.push({ ...pr, exerciseId: ex.exerciseId });
    }
  }
  return out;
}
