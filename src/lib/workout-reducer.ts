/**
 * State management of the live workout editor. Pure reducer, unit tested.
 * The client state is the source of truth while training; it is persisted locally after every
 * change and synced to the server as a full snapshot (see use-workout-sync).
 */
import type { LoadMode, SetType, Tracking } from "./training";
import type { SyncPayload } from "./workout-schema";

export interface PreviousSet {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
}

export interface LSet {
  id: string;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rir: number | null;
  rpe: number | null;
  note: string | null;
  completed: boolean;
  completedAt: string | null;
}

export interface LExercise {
  id: string;
  exerciseId: string;
  notes: string | null;
  restSeconds: number | null;
  tracking: Tracking;
  loadMode: LoadMode;
  bodyweightFactor: number;
  previous: { date: string; sets: PreviousSet[] } | null;
  sets: LSet[];
}

export interface LoggerState {
  workoutId: string;
  status: "active" | "completed";
  name: string;
  notes: string | null;
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  bodyweightKg: number | null;
  exercises: LExercise[];
  /** Local revision (ms timestamp) of the latest change. */
  revision: number;
  /** Server revision this state is based on. */
  baseRevision: number;
}

export interface ExerciseMeta {
  tracking: Tracking;
  loadMode: LoadMode;
  bodyweightFactor: number;
  restSeconds: number | null;
}

export type Action =
  | { type: "setName"; name: string }
  | { type: "setNotes"; notes: string }
  | { type: "setBodyweight"; kg: number | null }
  | { type: "pause"; at: string }
  | { type: "resume"; at: string }
  | { type: "updateSet"; exId: string; setId: string; patch: Partial<Omit<LSet, "id">> }
  | { type: "toggleSet"; exId: string; setId: string; at: string }
  | { type: "addSet"; exId: string; id: string }
  | { type: "removeSet"; exId: string; setId: string }
  | { type: "addExercises"; items: { id: string; exerciseId: string; meta: ExerciseMeta; previous: LExercise["previous"]; sets: LSet[] }[] }
  | { type: "removeExercise"; exId: string }
  | { type: "moveExercise"; exId: string; dir: -1 | 1 }
  | { type: "replaceExercise"; exId: string; exerciseId: string; meta: ExerciseMeta; previous: LExercise["previous"]; sets: LSet[] }
  | { type: "setExerciseNotes"; exId: string; notes: string }
  | { type: "setExerciseRest"; exId: string; seconds: number | null }
  | { type: "replaceState"; state: LoggerState }
  | { type: "synced"; serverRevision: number };

function nextRevision(prev: number): number {
  return Math.max(prev + 1, Date.now());
}

function mapEx(state: LoggerState, exId: string, fn: (e: LExercise) => LExercise): LExercise[] {
  return state.exercises.map((e) => (e.id === exId ? fn(e) : e));
}

export function newSetFrom(id: string, source: Partial<LSet> | null): LSet {
  return {
    id,
    setType: source?.setType === "warmup" ? "working" : (source?.setType ?? "working"),
    weightKg: source?.weightKg ?? null,
    reps: source?.reps ?? null,
    durationSeconds: source?.durationSeconds ?? null,
    rir: null,
    rpe: null,
    note: null,
    completed: false,
    completedAt: null,
  };
}

export function loggerReducer(state: LoggerState, action: Action): LoggerState {
  const changed = (patch: Partial<LoggerState>): LoggerState => ({ ...state, ...patch, revision: nextRevision(state.revision) });

  switch (action.type) {
    case "setName":
      return changed({ name: action.name });
    case "setNotes":
      return changed({ notes: action.notes || null });
    case "setBodyweight":
      return changed({ bodyweightKg: action.kg });
    case "pause":
      return state.pausedAt ? state : changed({ pausedAt: action.at });
    case "resume": {
      if (!state.pausedAt) return state;
      const extra = Math.max(0, Math.floor((new Date(action.at).getTime() - new Date(state.pausedAt).getTime()) / 1000));
      return changed({ pausedAt: null, pausedSeconds: state.pausedSeconds + extra });
    }
    case "updateSet":
      return changed({
        exercises: mapEx(state, action.exId, (e) => ({
          ...e,
          sets: e.sets.map((s) => (s.id === action.setId ? { ...s, ...action.patch } : s)),
        })),
      });
    case "toggleSet":
      return changed({
        exercises: mapEx(state, action.exId, (e) => ({
          ...e,
          sets: e.sets.map((s, i) => {
            if (s.id !== action.setId) return s;
            if (s.completed) return { ...s, completed: false, completedAt: null };
            // Completing an empty set takes over the previous values (one-tap logging).
            const prev = e.previous?.sets[i];
            return {
              ...s,
              weightKg: s.weightKg ?? prev?.weightKg ?? null,
              reps: s.reps ?? prev?.reps ?? null,
              durationSeconds: s.durationSeconds ?? prev?.durationSeconds ?? null,
              completed: true,
              completedAt: action.at,
            };
          }),
        })),
      });
    case "addSet":
      return changed({
        exercises: mapEx(state, action.exId, (e) => {
          const last = e.sets[e.sets.length - 1] ?? null;
          const prev = e.previous?.sets[e.sets.length] ?? null;
          return { ...e, sets: [...e.sets, newSetFrom(action.id, last ?? prev)] };
        }),
      });
    case "removeSet":
      return changed({ exercises: mapEx(state, action.exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== action.setId) })) });
    case "addExercises":
      return changed({
        exercises: [
          ...state.exercises,
          ...action.items.map((it) => ({
            id: it.id,
            exerciseId: it.exerciseId,
            notes: null,
            restSeconds: it.meta.restSeconds,
            tracking: it.meta.tracking,
            loadMode: it.meta.loadMode,
            bodyweightFactor: it.meta.bodyweightFactor,
            previous: it.previous,
            sets: it.sets,
          })),
        ],
      });
    case "removeExercise":
      return changed({ exercises: state.exercises.filter((e) => e.id !== action.exId) });
    case "moveExercise": {
      const i = state.exercises.findIndex((e) => e.id === action.exId);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= state.exercises.length) return state;
      const exercises = [...state.exercises];
      [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
      return changed({ exercises });
    }
    case "replaceExercise":
      return changed({
        exercises: mapEx(state, action.exId, (e) => ({
          ...e,
          exerciseId: action.exerciseId,
          tracking: action.meta.tracking,
          loadMode: action.meta.loadMode,
          bodyweightFactor: action.meta.bodyweightFactor,
          restSeconds: action.meta.restSeconds,
          previous: action.previous,
          sets: action.sets,
        })),
      });
    case "setExerciseNotes":
      return changed({ exercises: mapEx(state, action.exId, (e) => ({ ...e, notes: action.notes || null })) });
    case "setExerciseRest":
      return changed({ exercises: mapEx(state, action.exId, (e) => ({ ...e, restSeconds: action.seconds })) });
    case "replaceState":
      return action.state;
    case "synced":
      return { ...state, baseRevision: Math.max(state.baseRevision, action.serverRevision) };
    default:
      return state;
  }
}

export function toSyncPayload(state: LoggerState, deviceId: string): SyncPayload {
  return {
    revision: state.revision,
    baseRevision: state.baseRevision,
    deviceId,
    name: state.name.trim() || "Training",
    notes: state.notes,
    pausedAt: state.pausedAt,
    pausedSeconds: state.pausedSeconds,
    bodyweightKg: state.bodyweightKg,
    exercises: state.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      notes: e.notes,
      restSeconds: e.restSeconds,
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
        completedAt: s.completedAt,
      })),
    })),
  };
}

/** Parses a user-entered decimal ("52,5", "52.5"). Returns undefined for invalid input, null for empty. */
export function parseDecimal(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d{0,4}(\.\d{0,3})?$/.test(t) || t === ".") return undefined;
  return Number(t);
}

export function parseIntStrict(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,4}$/.test(t)) return undefined;
  return Number(t);
}

/** "1:30" / "90" → seconds */
export function parseDurationInput(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  const m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return parseIntStrict(t);
}
