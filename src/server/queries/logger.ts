import "server-only";
import { db } from "@/server/db";
import { getWorkoutDetail, loadPrefill } from "@/server/services/workouts";
import type { LoggerState } from "@/lib/workout-reducer";
import type { LoggerSettings } from "@/components/workout/workout-logger";
import type { Settings } from "./settings";

/** Builds the initial editor state of a workout, including previous values per exercise. */
export async function getLoggerState(id: string): Promise<LoggerState | null> {
  const w = await getWorkoutDetail(db, id);
  if (!w || w.status === "discarded") return null;
  const prev = await loadPrefill(
    db,
    w.exercises.map((e) => e.exerciseId),
    { excludeWorkoutId: w.id, before: w.status === "completed" ? w.startedAt : undefined },
  );
  return {
    workoutId: w.id,
    status: w.status as "active" | "completed",
    name: w.name,
    notes: w.notes,
    startedAt: w.startedAt.toISOString(),
    pausedAt: w.pausedAt?.toISOString() ?? null,
    pausedSeconds: w.pausedSeconds,
    bodyweightKg: w.bodyweightKg,
    revision: w.revision,
    baseRevision: w.revision,
    exercises: w.exercises.map((e) => {
      const p = prev.get(e.exerciseId);
      return {
        id: e.id,
        exerciseId: e.exerciseId,
        notes: e.notes,
        restSeconds: e.restSeconds,
        tracking: e.tracking,
        loadMode: e.loadMode,
        bodyweightFactor: e.bodyweightFactor,
        previous: p ? { date: p.date, sets: p.sets.map((s) => ({ setType: s.setType, weightKg: s.weightKg, reps: s.reps, durationSeconds: s.durationSeconds })) } : null,
        sets: e.sets.map((s) => ({
          id: s.id,
          setType: s.setType,
          weightKg: s.weightKg,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
          rir: s.rir,
          rpe: s.rpe,
          note: s.note,
          completed: s.completed,
          completedAt: s.completedAt?.toISOString() ?? null,
        })),
      };
    }),
  };
}

export function loggerSettings(s: Settings): LoggerSettings {
  return {
    unit: s.weightUnit === "lb" ? "lb" : "kg",
    effortMetric: (["none", "rir", "rpe"].includes(s.effortMetric) ? s.effortMetric : "rir") as LoggerSettings["effortMetric"],
    defaultRestSeconds: s.defaultRestSeconds,
    autoStartRestTimer: s.autoStartRestTimer,
    restTimerSound: s.restTimerSound,
    keepScreenAwake: s.keepScreenAwake,
    bodyweightInVolume: s.bodyweightInVolume,
  };
}
