import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/*
 * Conventions
 * - All timestamps are stored as `timestamptz` (UTC instants).
 * - Calendar days are stored as `date` (no time zone) and always refer to the
 *   user's configured time zone (settings.timezone).
 * - Weights are always stored in kilograms. Display units are a presentation concern.
 * - Workout history stores snapshots of all values needed to recompute derived numbers
 *   (load mode, bodyweight factor, bodyweight, effective load), so later edits of
 *   exercises, templates or the profile never change historical results.
 */

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

const kg = (precision = 7) => numeric({ precision, scale: 3, mode: "number" });

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export const muscleGroups = pgTable(
  "muscle_groups",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    parentId: text().references((): AnyPgColumn => muscleGroups.id, { onDelete: "restrict" }),
    region: text().notNull(), // upper | core | lower
    sortOrder: integer().notNull().default(0),
    isBuiltin: boolean().notNull().default(true),
  },
  (t) => [check("muscle_groups_region_chk", sql`${t.region} in ('upper','core','lower')`)],
);

export const equipment = pgTable("equipment", {
  id: text().primaryKey(),
  name: text().notNull(),
  category: text().notNull(), // display grouping, e.g. "Freie Gewichte"
  sortOrder: integer().notNull().default(0),
  isBuiltin: boolean().notNull().default(true),
});

export const movementPatterns = pgTable("movement_patterns", {
  id: text().primaryKey(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
  isBuiltin: boolean().notNull().default(true),
});

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  "exercises",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    aliases: text().array().notNull().default(sql`'{}'::text[]`),
    description: text(),
    instructions: text(),
    primaryMuscleId: text()
      .notNull()
      .references(() => muscleGroups.id, { onDelete: "restrict" }),
    equipmentId: text()
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    movementPatternId: text().references(() => movementPatterns.id, { onDelete: "set null" }),
    mechanic: text().notNull().default("compound"), // compound | isolation
    tracking: text().notNull().default("reps"), // reps | duration
    loadMode: text().notNull().default("external"), // external | bodyweight | bodyweight_plus | bodyweight_minus | none
    bodyweightFactor: numeric({ precision: 4, scale: 3, mode: "number" }).notNull().default(1),
    repMin: smallint(),
    repMax: smallint(),
    restSeconds: integer(),
    notes: text(),
    imagePath: text(),
    isCustom: boolean().notNull().default(false),
    isModified: boolean().notNull().default(false),
    isFavorite: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("exercises_mechanic_chk", sql`${t.mechanic} in ('compound','isolation')`),
    check("exercises_tracking_chk", sql`${t.tracking} in ('reps','duration')`),
    check(
      "exercises_load_mode_chk",
      sql`${t.loadMode} in ('external','bodyweight','bodyweight_plus','bodyweight_minus','none')`,
    ),
    check("exercises_bw_factor_chk", sql`${t.bodyweightFactor} > 0 and ${t.bodyweightFactor} <= 2`),
    index("exercises_primary_muscle_idx").on(t.primaryMuscleId),
    index("exercises_equipment_idx").on(t.equipmentId),
  ],
);

export const exerciseSecondaryMuscles = pgTable(
  "exercise_secondary_muscles",
  {
    exerciseId: text()
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleId: text()
      .notNull()
      .references(() => muscleGroups.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.muscleId] }),
    index("exercise_secondary_muscles_muscle_idx").on(t.muscleId),
  ],
);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const templates = pgTable("templates", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  notes: text(),
  ...timestamps,
});

export const templateExercises = pgTable(
  "template_exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    templateId: uuid()
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    exerciseId: text()
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer().notNull(),
    targetSets: smallint().notNull().default(3),
    repMin: smallint(),
    repMax: smallint(),
    restSeconds: integer(),
    notes: text(),
  },
  (t) => [
    index("template_exercises_template_idx").on(t.templateId, t.position),
    index("template_exercises_exercise_idx").on(t.exerciseId),
  ],
);

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** Recurring plan, e.g. "Push every Monday and Thursday". Occurrences are expanded on read. */
export const planRules = pgTable(
  "plan_rules",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(), // workout | rest
    templateId: uuid().references(() => templates.id, { onDelete: "set null" }),
    title: text().notNull(),
    weekdays: smallint().array().notNull(), // ISO weekdays 1 (Mon) .. 7 (Sun)
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [check("plan_rules_kind_chk", sql`${t.kind} in ('workout','rest')`)],
);

/**
 * A concrete calendar entry. Either created directly, or materialized from a rule
 * occurrence once the user interacts with it (move, skip, remove, start).
 */
export const plannedEntries = pgTable(
  "planned_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    date: date({ mode: "string" }).notNull(),
    kind: text().notNull(), // workout | rest
    templateId: uuid().references(() => templates.id, { onDelete: "set null" }),
    title: text().notNull(),
    notes: text(),
    status: text().notNull().default("planned"), // planned | completed | skipped | cancelled
    movedFrom: date({ mode: "string" }),
    ruleId: uuid().references(() => planRules.id, { onDelete: "set null" }),
    occurrenceDate: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    check("planned_entries_kind_chk", sql`${t.kind} in ('workout','rest')`),
    check(
      "planned_entries_status_chk",
      sql`${t.status} in ('planned','completed','skipped','cancelled')`,
    ),
    index("planned_entries_date_idx").on(t.date),
    uniqueIndex("planned_entries_rule_occurrence_uq").on(t.ruleId, t.occurrenceDate),
  ],
);

// ---------------------------------------------------------------------------
// Workouts (actual training sessions)
// ---------------------------------------------------------------------------

export const workouts = pgTable(
  "workouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    templateId: uuid().references(() => templates.id, { onDelete: "set null" }),
    plannedEntryId: uuid().references(() => plannedEntries.id, { onDelete: "set null" }),
    status: text().notNull().default("active"), // active | completed | discarded
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    pausedAt: timestamp({ withTimezone: true }),
    pausedSeconds: integer().notNull().default(0),
    /** Calendar day (user time zone) the session counts toward; fixed at start. */
    localDate: date({ mode: "string" }).notNull(),
    /** Bodyweight snapshot at start, used as default for bodyweight exercises. */
    bodyweightKg: kg(6),
    notes: text(),
    /** Client timestamp (ms) of the last applied snapshot; used for idempotent, ordered syncs. */
    revision: bigint({ mode: "number" }).notNull().default(0),
    /** Device that wrote the last snapshot, used to detect edits from two devices. */
    syncDeviceId: text(),
    ...timestamps,
  },
  (t) => [
    check("workouts_status_chk", sql`${t.status} in ('active','completed','discarded')`),
    // At most one active workout at any time: prevents duplicate sessions on resume.
    uniqueIndex("workouts_single_active_uq")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    index("workouts_status_date_idx").on(t.status, t.localDate),
    index("workouts_started_idx").on(t.startedAt),
    index("workouts_planned_entry_idx").on(t.plannedEntryId),
  ],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: uuid().primaryKey(),
    workoutId: uuid()
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: text()
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer().notNull(),
    notes: text(),
    restSeconds: integer(),
    // Snapshots of the calculation basis at the time of training.
    tracking: text().notNull().default("reps"),
    loadMode: text().notNull().default("external"),
    bodyweightFactor: numeric({ precision: 4, scale: 3, mode: "number" }).notNull().default(1),
  },
  (t) => [
    index("workout_exercises_workout_idx").on(t.workoutId, t.position),
    index("workout_exercises_exercise_idx").on(t.exerciseId),
  ],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid().primaryKey(),
    workoutExerciseId: uuid()
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    setType: text().notNull().default("working"), // warmup | working | dropset | failure
    /** Entered weight: external load, added weight or assistance depending on load mode. */
    weightKg: kg(),
    reps: smallint(),
    durationSeconds: integer(),
    rir: numeric({ precision: 3, scale: 1, mode: "number" }),
    rpe: numeric({ precision: 3, scale: 1, mode: "number" }),
    note: text(),
    completed: boolean().notNull().default(false),
    completedAt: timestamp({ withTimezone: true }),
    /** Bodyweight used for the calculation (bodyweight modes only). */
    bodyweightKg: kg(6),
    /** Effective load (kg) computed when saved; null when not computable. */
    loadKg: kg(),
  },
  (t) => [
    check("workout_sets_type_chk", sql`${t.setType} in ('warmup','working','dropset','failure')`),
    check("workout_sets_reps_chk", sql`${t.reps} is null or ${t.reps} >= 0`),
    index("workout_sets_we_idx").on(t.workoutExerciseId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Profile, bodyweight, settings
// ---------------------------------------------------------------------------

export const bodyWeightEntries = pgTable("body_weight_entries", {
  id: uuid().primaryKey().defaultRandom(),
  date: date({ mode: "string" }).notNull().unique("body_weight_entries_date_uq"),
  weightKg: kg(6).notNull(),
  note: text(),
  ...timestamps,
});

export const profile = pgTable(
  "profile",
  {
    id: smallint().primaryKey().default(1),
    name: text(),
    birthDate: date({ mode: "string" }),
    sex: text(), // female | male | diverse | null
    heightCm: numeric({ precision: 5, scale: 1, mode: "number" }),
    targetWeightKg: kg(6),
    trainingLevel: text(), // beginner | intermediate | advanced
    goals: text(),
    ...timestamps,
  },
  (t) => [check("profile_singleton_chk", sql`${t.id} = 1`)],
);

export const settings = pgTable(
  "settings",
  {
    id: smallint().primaryKey().default(1),
    weightUnit: text().notNull().default("kg"), // kg | lb
    heightUnit: text().notNull().default("cm"), // cm | in
    weekStart: smallint().notNull().default(1), // ISO weekday the week starts on
    timezone: text().notNull().default("Europe/Berlin"),
    defaultRestSeconds: integer().notNull().default(90),
    autoStartRestTimer: boolean().notNull().default(true),
    restTimerSound: boolean().notNull().default(true),
    keepScreenAwake: boolean().notNull().default(true),
    effortMetric: text().notNull().default("rir"), // none | rir | rpe
    /** Default load mode used when creating a bodyweight exercise. */
    defaultBodyweightMode: text().notNull().default("bodyweight_plus"),
    /** Whether bodyweight-based loads are included in volume totals. */
    bodyweightInVolume: boolean().notNull().default(true),
    /** Weight (0..1) of a set for each secondary muscle in muscle-group analytics. */
    secondaryMuscleWeight: numeric({ precision: 3, scale: 2, mode: "number" }).notNull().default(0.5),
    ...timestamps,
  },
  (t) => [
    check("settings_singleton_chk", sql`${t.id} = 1`),
    check("settings_week_start_chk", sql`${t.weekStart} between 1 and 7`),
    check(
      "settings_secondary_weight_chk",
      sql`${t.secondaryMuscleWeight} >= 0 and ${t.secondaryMuscleWeight} <= 1`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** SHA-256 hash of the session token; the raw token only lives in the cookie. */
    id: text().primaryKey(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
  },
  (t) => [index("auth_sessions_expires_idx").on(t.expiresAt)],
);
