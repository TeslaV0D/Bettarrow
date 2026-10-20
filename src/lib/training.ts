/**
 * Core training calculations. Pure functions, shared by server and client.
 *
 * Volume rules (documented in ARCHITECTURE.md):
 * - Only completed, non-warm-up sets ("working sets": working, dropset, failure) count.
 * - Set volume = effective load (kg) × reps.
 * - Duration-tracked sets (planks, holds) count as sets but have no volume.
 * - Sets without reps or without a computable load are counted as sets, excluded from volume,
 *   and flagged so the UI can mark the volume as incomplete.
 * - Bodyweight-based loads are included in volume unless disabled in the settings.
 */

export const LOAD_MODES = ["external", "bodyweight", "bodyweight_plus", "bodyweight_minus", "none"] as const;
export type LoadMode = (typeof LOAD_MODES)[number];

export const SET_TYPES = ["working", "warmup", "dropset", "failure"] as const;
export type SetType = (typeof SET_TYPES)[number];

export const TRACKING_TYPES = ["reps", "duration"] as const;
export type Tracking = (typeof TRACKING_TYPES)[number];

export const LOAD_MODE_LABELS: Record<LoadMode, string> = {
  external: "Externe Last",
  bodyweight: "Körpergewicht",
  bodyweight_plus: "Körpergewicht + Zusatzgewicht",
  bodyweight_minus: "Körpergewicht − Unterstützung",
  none: "Ohne Last (nur Wdh./Zeit)",
};

export const LOAD_MODE_HINTS: Record<LoadMode, string> = {
  external: "Last = eingetragenes Gewicht.",
  bodyweight: "Last = Körpergewicht × Faktor. Kein Gewicht einzutragen.",
  bodyweight_plus: "Last = Körpergewicht × Faktor + Zusatzgewicht (z. B. Gewichtsgürtel).",
  bodyweight_minus: "Last = Körpergewicht × Faktor − Unterstützung (z. B. Gegengewicht, Band).",
  none: "Keine Last erfasst (z. B. Crunches, Bänder). Zählt als Satz, aber nicht zum Volumen.",
};

/** Label of the weight input column for a load mode, or null if no weight is entered. */
export function weightInputLabel(mode: LoadMode): string | null {
  switch (mode) {
    case "external":
      return "kg";
    case "bodyweight_plus":
      return "+kg";
    case "bodyweight_minus":
      return "−kg";
    default:
      return null;
  }
}

export const SET_TYPE_LABELS: Record<SetType, string> = {
  working: "Arbeitssatz",
  warmup: "Aufwärmsatz",
  dropset: "Dropset",
  failure: "Bis Muskelversagen",
};

export const SET_TYPE_SHORT: Record<SetType, string> = {
  working: "",
  warmup: "W",
  dropset: "D",
  failure: "F",
};

export function isBodyweightMode(mode: LoadMode): boolean {
  return mode === "bodyweight" || mode === "bodyweight_plus" || mode === "bodyweight_minus";
}

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export interface LoadInput {
  loadMode: LoadMode;
  bodyweightFactor: number;
  bodyweightKg: number | null;
  weightKg: number | null;
}

/**
 * Effective load of a set in kg, or null if it cannot be determined
 * (no weight entered for an external load, or no bodyweight known for bodyweight modes).
 */
export function computeLoad({ loadMode, bodyweightFactor, bodyweightKg, weightKg }: LoadInput): number | null {
  if (loadMode === "none") return null;
  if (loadMode === "external") {
    return weightKg == null || weightKg < 0 ? null : round(weightKg);
  }
  if (bodyweightKg == null || bodyweightKg <= 0) return null;
  const base = bodyweightKg * bodyweightFactor;
  const extra = weightKg != null && weightKg > 0 ? weightKg : 0;
  if (loadMode === "bodyweight") return round(base);
  if (loadMode === "bodyweight_plus") return round(base + extra);
  return round(Math.max(0, base - extra));
}

export interface SetLike {
  setType: SetType;
  completed: boolean;
  reps: number | null;
  durationSeconds?: number | null;
  loadKg: number | null;
}

export function isWorkingSet(set: Pick<SetLike, "setType" | "completed">): boolean {
  return set.completed && set.setType !== "warmup";
}

export interface VolumeOptions {
  tracking: Tracking;
  loadMode: LoadMode;
  bodyweightInVolume: boolean;
}

/** Volume of a single set, or null if the set does not contribute to volume. */
export function setVolume(set: SetLike, opts: VolumeOptions): number | null {
  if (!isWorkingSet(set) || opts.tracking !== "reps" || opts.loadMode === "none") return null;
  if (isBodyweightMode(opts.loadMode) && !opts.bodyweightInVolume) return null;
  if (set.reps == null || set.reps <= 0 || set.loadKg == null) return null;
  return round(set.loadKg * set.reps);
}

/** A working set whose volume should exist but could not be computed. */
export function isVolumeIncomplete(set: SetLike, opts: VolumeOptions): boolean {
  if (!isWorkingSet(set) || opts.tracking !== "reps" || opts.loadMode === "none") return false;
  if (isBodyweightMode(opts.loadMode) && !opts.bodyweightInVolume) return false;
  return set.reps == null || set.reps <= 0 || set.loadKg == null;
}

export const E1RM_MAX_REPS = 12;

/**
 * Estimated one-rep max (Epley: load × (1 + reps / 30)). This is an estimate and is only
 * computed for 1–12 reps with a positive, load-based weight. Pure bodyweight exercises and
 * duration exercises are excluded because the estimate is not meaningful there.
 */
export function estimate1RM(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || reps == null || loadKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return round(loadKg, 1);
  return round(loadKg * (1 + reps / 30), 1);
}

export function supportsE1RM(tracking: Tracking, loadMode: LoadMode): boolean {
  return tracking === "reps" && loadMode !== "bodyweight" && loadMode !== "none";
}

export interface ExerciseLike extends VolumeOptions {
  sets: SetLike[];
}

export interface WorkoutTotals {
  exercises: number;
  workingSets: number;
  completedSets: number;
  totalSets: number;
  volumeKg: number;
  volumeIncomplete: boolean;
}

export function workoutTotals(exercises: ExerciseLike[]): WorkoutTotals {
  let workingSets = 0;
  let completedSets = 0;
  let totalSets = 0;
  let volumeKg = 0;
  let volumeIncomplete = false;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      totalSets++;
      if (s.completed) completedSets++;
      if (isWorkingSet(s)) workingSets++;
      const v = setVolume(s, ex);
      if (v != null) volumeKg += v;
      else if (isVolumeIncomplete(s, ex)) volumeIncomplete = true;
    }
  }
  return {
    exercises: exercises.length,
    workingSets,
    completedSets,
    totalSets,
    volumeKg: round(volumeKg, 1),
    volumeIncomplete,
  };
}

/** Elapsed active seconds of a workout, excluding pauses. */
export function workoutDurationSeconds(
  w: { startedAt: Date; endedAt: Date | null; pausedAt: Date | null; pausedSeconds: number },
  now: Date = new Date(),
): number {
  const end = w.endedAt ?? w.pausedAt ?? now;
  const raw = Math.floor((end.getTime() - w.startedAt.getTime()) / 1000);
  return Math.max(0, raw - w.pausedSeconds);
}

// ---------------------------------------------------------------------------
// Prefill from the last completed session
// ---------------------------------------------------------------------------

export interface HistorySet {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  completed: boolean;
}

export interface PrefillSet {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  /** Values copied from history (shown as "previous"). */
  previous: { weightKg: number | null; reps: number | null; durationSeconds: number | null } | null;
}

/**
 * Builds the initial sets for an exercise added to a workout.
 * - With history: one set per completed set of the last completed session (same order, type and values).
 *   If a template asks for more sets, additional sets copy the last historic set.
 * - Without history: `targetSets` empty sets (reps prefilled from the template's lower rep bound if any).
 */
export function buildPrefillSets(
  history: HistorySet[] | null,
  opts: { targetSets?: number | null; repMin?: number | null } = {},
): PrefillSet[] {
  const done = (history ?? []).filter((s) => s.completed);
  if (done.length > 0) {
    const sets: PrefillSet[] = done.map((s) => ({
      setType: s.setType,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      previous: { weightKg: s.weightKg, reps: s.reps, durationSeconds: s.durationSeconds },
    }));
    const target = opts.targetSets ?? 0;
    const workingCount = sets.filter((s) => s.setType !== "warmup").length;
    const last = sets[sets.length - 1];
    for (let i = workingCount; i < target; i++) {
      sets.push({ ...last, setType: last.setType === "warmup" ? "working" : last.setType, previous: null });
    }
    return sets;
  }
  const count = Math.max(1, opts.targetSets ?? 3);
  return Array.from({ length: count }, () => ({
    setType: "working" as const,
    weightKg: null,
    reps: opts.repMin ?? null,
    durationSeconds: null,
    previous: null,
  }));
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

export type PrKind = "max_load" | "max_reps_at_load" | "max_set_volume" | "e1rm" | "max_reps";

export const PR_LABELS: Record<PrKind, string> = {
  max_load: "Höchstes Gewicht",
  max_reps_at_load: "Wiederholungsrekord",
  max_set_volume: "Höchstes Satzvolumen",
  e1rm: "Geschätztes 1RM",
  max_reps: "Meiste Wiederholungen",
};

export interface PrSet {
  loadKg: number | null;
  reps: number | null;
}

export interface PrAchievement {
  kind: PrKind;
  value: number;
  previous: number | null;
  loadKg: number | null;
  reps: number | null;
}

/**
 * Detects personal records of `current` working sets compared to `prior` working sets
 * of the same exercise. If there is no prior history, no PRs are reported (a first session is a
 * baseline, not a record). Each kind is reported at most once (the best set).
 */
export function detectPRs(
  prior: PrSet[],
  current: PrSet[],
  opts: { tracking: Tracking; loadMode: LoadMode },
): PrAchievement[] {
  const valid = (s: PrSet) => s.reps != null && s.reps > 0;
  const priorValid = prior.filter(valid);
  const currentValid = current.filter(valid);
  if (opts.tracking !== "reps" || priorValid.length === 0 || currentValid.length === 0) return [];

  const out: PrAchievement[] = [];
  const hasLoad = (s: PrSet) => s.loadKg != null && s.loadKg > 0;

  if (opts.loadMode === "bodyweight" || opts.loadMode === "none") {
    // Load is absent or mostly reflects bodyweight changes; only rep records are meaningful.
    const prevMax = Math.max(...priorValid.map((s) => s.reps!));
    const best = currentValid.reduce((a, b) => (b.reps! > a.reps! ? b : a));
    if (best.reps! > prevMax) {
      out.push({ kind: "max_reps", value: best.reps!, previous: prevMax, loadKg: best.loadKg, reps: best.reps });
    }
    return out;
  }

  const priorLoaded = priorValid.filter(hasLoad);
  const currentLoaded = currentValid.filter(hasLoad);
  if (currentLoaded.length === 0) return out;

  // Heaviest load
  const prevMaxLoad = priorLoaded.length ? Math.max(...priorLoaded.map((s) => s.loadKg!)) : null;
  const heaviest = currentLoaded.reduce((a, b) => (b.loadKg! > a.loadKg! || (b.loadKg === a.loadKg && b.reps! > a.reps!) ? b : a));
  if (prevMaxLoad == null || heaviest.loadKg! > prevMaxLoad) {
    if (prevMaxLoad != null) {
      out.push({ kind: "max_load", value: heaviest.loadKg!, previous: prevMaxLoad, loadKg: heaviest.loadKg, reps: heaviest.reps });
    }
  }

  // Reps at load: more reps than ever achieved at this load or heavier.
  let bestRepPr: PrAchievement | null = null;
  for (const s of currentLoaded) {
    const atOrAbove = priorLoaded.filter((p) => p.loadKg! >= s.loadKg!);
    if (atOrAbove.length === 0) continue; // new load range: covered by max_load
    const prevReps = Math.max(...atOrAbove.map((p) => p.reps!));
    if (s.reps! > prevReps) {
      if (!bestRepPr || s.loadKg! > bestRepPr.loadKg! || (s.loadKg === bestRepPr.loadKg && s.reps! > bestRepPr.reps!)) {
        bestRepPr = { kind: "max_reps_at_load", value: s.reps!, previous: prevReps, loadKg: s.loadKg, reps: s.reps };
      }
    }
  }
  if (bestRepPr) out.push(bestRepPr);

  // Set volume
  const vol = (s: PrSet) => s.loadKg! * s.reps!;
  if (priorLoaded.length) {
    const prevMaxVol = Math.max(...priorLoaded.map(vol));
    const bestVol = currentLoaded.reduce((a, b) => (vol(b) > vol(a) ? b : a));
    if (vol(bestVol) > prevMaxVol + 1e-9) {
      out.push({ kind: "max_set_volume", value: round(vol(bestVol), 1), previous: round(prevMaxVol, 1), loadKg: bestVol.loadKg, reps: bestVol.reps });
    }
  }

  // Estimated 1RM
  if (supportsE1RM(opts.tracking, opts.loadMode)) {
    const e = (s: PrSet) => estimate1RM(s.loadKg, s.reps) ?? 0;
    const prevE = Math.max(0, ...priorLoaded.map(e));
    const bestE = currentLoaded.reduce((a, b) => (e(b) > e(a) ? b : a));
    if (prevE > 0 && e(bestE) > prevE + 1e-9) {
      out.push({ kind: "e1rm", value: e(bestE), previous: prevE, loadKg: bestE.loadKg, reps: bestE.reps });
    }
  }
  return out;
}

/** Best rep count per load (descending load), e.g. for an exercise's record table. */
export function repRecordsByLoad(sets: PrSet[]): { loadKg: number; reps: number }[] {
  const map = new Map<number, number>();
  for (const s of sets) {
    if (s.loadKg == null || s.loadKg <= 0 || s.reps == null || s.reps <= 0) continue;
    map.set(s.loadKg, Math.max(map.get(s.loadKg) ?? 0, s.reps));
  }
  const rows = [...map.entries()].map(([loadKg, reps]) => ({ loadKg, reps })).sort((a, b) => b.loadKg - a.loadKg);
  // Only keep "dominant" rows: a lighter load is only a record if it beat every heavier load's reps.
  const out: { loadKg: number; reps: number }[] = [];
  let maxRepsSoFar = 0;
  for (const r of rows) {
    if (r.reps > maxRepsSoFar) {
      out.push(r);
      maxRepsSoFar = r.reps;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Muscle attribution
// ---------------------------------------------------------------------------

export interface MuscleContribution {
  directSets: number;
  indirectSets: number;
  directVolume: number;
  indirectVolume: number;
}

/**
 * Attribution rule: every working set counts as 1 set (and its full volume) for the primary muscle,
 * and as `secondaryWeight` (0..1, default 0.5) of a set/volume for each secondary muscle.
 * Direct and indirect contributions are kept separate, so totals are never silently double counted.
 */
export function attributeToMuscles(
  entries: { primaryMuscleId: string; secondaryMuscleIds: string[]; workingSets: number; volumeKg: number }[],
): Map<string, MuscleContribution> {
  const map = new Map<string, MuscleContribution>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) {
      c = { directSets: 0, indirectSets: 0, directVolume: 0, indirectVolume: 0 };
      map.set(id, c);
    }
    return c;
  };
  for (const e of entries) {
    if (e.workingSets <= 0) continue;
    const p = get(e.primaryMuscleId);
    p.directSets += e.workingSets;
    p.directVolume += e.volumeKg;
    for (const m of e.secondaryMuscleIds) {
      if (m === e.primaryMuscleId) continue;
      const c = get(m);
      c.indirectSets += e.workingSets;
      c.indirectVolume += e.volumeKg;
    }
  }
  return map;
}

export function weightedSets(c: MuscleContribution, secondaryWeight: number): number {
  return c.directSets + c.indirectSets * secondaryWeight;
}

export function weightedVolume(c: MuscleContribution, secondaryWeight: number): number {
  return c.directVolume + c.indirectVolume * secondaryWeight;
}
