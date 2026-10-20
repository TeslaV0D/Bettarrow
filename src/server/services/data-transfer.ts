/**
 * Full data export / import (documented, versioned JSON format "bettarrow-export").
 * See docs/EXPORT_FORMAT.md. An import replaces all personal data in a single transaction.
 */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/types";
import * as s from "@/server/db/schema";
import { seedReferenceData } from "@/server/seed";

export const EXPORT_FORMAT = "bettarrow-export";
export const EXPORT_VERSION = 1;

const ts = z.iso.datetime({ offset: true });
const ymd = z.iso.date();
const nullableNum = z.number().nullable();

const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1).max(EXPORT_VERSION),
  exportedAt: ts,
  settings: z.object({
    weightUnit: z.enum(["kg", "lb"]),
    heightUnit: z.enum(["cm", "in"]),
    weekStart: z.number().int().min(1).max(7),
    timezone: z.string().min(1),
    defaultRestSeconds: z.number().int().min(0).max(3600),
    autoStartRestTimer: z.boolean(),
    restTimerSound: z.boolean(),
    keepScreenAwake: z.boolean(),
    effortMetric: z.enum(["none", "rir", "rpe"]),
    defaultBodyweightMode: z.string(),
    bodyweightInVolume: z.boolean(),
    secondaryMuscleWeight: z.number().min(0).max(1),
  }),
  profile: z.object({
    name: z.string().nullable(),
    birthDate: ymd.nullable(),
    sex: z.string().nullable(),
    heightCm: nullableNum,
    targetWeightKg: nullableNum,
    trainingLevel: z.string().nullable(),
    goals: z.string().nullable(),
  }),
  muscleGroups: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), parentId: z.string().nullable(), region: z.enum(["upper", "core", "lower"]), sortOrder: z.number().int(), isBuiltin: z.boolean() })),
  equipment: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), category: z.string(), sortOrder: z.number().int(), isBuiltin: z.boolean() })),
  movementPatterns: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), sortOrder: z.number().int(), isBuiltin: z.boolean() })),
  exercises: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      aliases: z.array(z.string()),
      description: z.string().nullable(),
      instructions: z.string().nullable(),
      primaryMuscleId: z.string(),
      secondaryMuscleIds: z.array(z.string()),
      equipmentId: z.string(),
      movementPatternId: z.string().nullable(),
      mechanic: z.enum(["compound", "isolation"]),
      tracking: z.enum(["reps", "duration"]),
      loadMode: z.enum(["external", "bodyweight", "bodyweight_plus", "bodyweight_minus", "none"]),
      bodyweightFactor: z.number(),
      repMin: nullableNum,
      repMax: nullableNum,
      restSeconds: nullableNum,
      notes: z.string().nullable(),
      imagePath: z.string().nullable(),
      isCustom: z.boolean(),
      isModified: z.boolean(),
      isFavorite: z.boolean(),
      archivedAt: ts.nullable(),
      createdAt: ts,
      updatedAt: ts,
    }),
  ),
  templates: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      description: z.string().nullable(),
      notes: z.string().nullable(),
      createdAt: ts,
      updatedAt: ts,
      items: z.array(
        z.object({
          id: z.uuid(),
          exerciseId: z.string(),
          position: z.number().int(),
          targetSets: z.number().int().min(1),
          repMin: nullableNum,
          repMax: nullableNum,
          restSeconds: nullableNum,
          notes: z.string().nullable(),
        }),
      ),
    }),
  ),
  planRules: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(["workout", "rest"]),
      templateId: z.uuid().nullable(),
      title: z.string(),
      weekdays: z.array(z.number().int().min(1).max(7)),
      startDate: ymd,
      endDate: ymd.nullable(),
      createdAt: ts,
      updatedAt: ts,
    }),
  ),
  plannedEntries: z.array(
    z.object({
      id: z.uuid(),
      date: ymd,
      kind: z.enum(["workout", "rest"]),
      templateId: z.uuid().nullable(),
      title: z.string(),
      notes: z.string().nullable(),
      status: z.enum(["planned", "completed", "skipped", "cancelled"]),
      movedFrom: ymd.nullable(),
      ruleId: z.uuid().nullable(),
      occurrenceDate: ymd.nullable(),
      createdAt: ts,
      updatedAt: ts,
    }),
  ),
  workouts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      templateId: z.uuid().nullable(),
      plannedEntryId: z.uuid().nullable(),
      status: z.enum(["active", "completed", "discarded"]),
      startedAt: ts,
      endedAt: ts.nullable(),
      pausedAt: ts.nullable(),
      pausedSeconds: z.number().int().min(0),
      localDate: ymd,
      bodyweightKg: nullableNum,
      notes: z.string().nullable(),
      createdAt: ts,
      updatedAt: ts,
      exercises: z.array(
        z.object({
          id: z.uuid(),
          exerciseId: z.string(),
          position: z.number().int(),
          notes: z.string().nullable(),
          restSeconds: nullableNum,
          tracking: z.enum(["reps", "duration"]),
          loadMode: z.enum(["external", "bodyweight", "bodyweight_plus", "bodyweight_minus", "none"]),
          bodyweightFactor: z.number(),
          sets: z.array(
            z.object({
              id: z.uuid(),
              position: z.number().int(),
              setType: z.enum(["warmup", "working", "dropset", "failure"]),
              weightKg: nullableNum,
              reps: nullableNum,
              durationSeconds: nullableNum,
              rir: nullableNum,
              rpe: nullableNum,
              note: z.string().nullable(),
              completed: z.boolean(),
              completedAt: ts.nullable(),
              bodyweightKg: nullableNum,
              loadKg: nullableNum,
            }),
          ),
        }),
      ),
    }),
  ),
  bodyWeight: z.array(z.object({ id: z.uuid(), date: ymd, weightKg: z.number().positive(), note: z.string().nullable(), createdAt: ts, updatedAt: ts })),
});

export type ExportData = z.infer<typeof exportSchema>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function exportData(db: Db, now = new Date()): Promise<ExportData> {
  const [settings] = await db.select().from(s.settings).where(eq(s.settings.id, 1));
  const [profile] = await db.select().from(s.profile).where(eq(s.profile.id, 1));
  const [muscles, equipment, patterns, exercises, secondary, templates, templateItems, rules, entries, workouts, wex, sets, bw] = await Promise.all([
    db.select().from(s.muscleGroups).orderBy(asc(s.muscleGroups.sortOrder)),
    db.select().from(s.equipment).orderBy(asc(s.equipment.sortOrder)),
    db.select().from(s.movementPatterns).orderBy(asc(s.movementPatterns.sortOrder)),
    db.select().from(s.exercises).orderBy(asc(s.exercises.id)),
    db.select().from(s.exerciseSecondaryMuscles),
    db.select().from(s.templates).orderBy(asc(s.templates.createdAt)),
    db.select().from(s.templateExercises).orderBy(asc(s.templateExercises.position)),
    db.select().from(s.planRules).orderBy(asc(s.planRules.createdAt)),
    db.select().from(s.plannedEntries).orderBy(asc(s.plannedEntries.date)),
    db.select().from(s.workouts).orderBy(asc(s.workouts.startedAt)),
    db.select().from(s.workoutExercises).orderBy(asc(s.workoutExercises.position)),
    db.select().from(s.workoutSets).orderBy(asc(s.workoutSets.position)),
    db.select().from(s.bodyWeightEntries).orderBy(asc(s.bodyWeightEntries.date)),
  ]);
  const group = <T, K extends keyof T>(rows: T[], key: K) => {
    const m = new Map<T[K], T[]>();
    for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
    return m;
  };
  const secBy = group(secondary, "exerciseId");
  const itemsBy = group(templateItems, "templateId");
  const wexBy = group(wex, "workoutId");
  const setsBy = group(sets, "workoutExerciseId");

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    settings: {
      weightUnit: settings.weightUnit as "kg" | "lb",
      heightUnit: settings.heightUnit as "cm" | "in",
      weekStart: settings.weekStart,
      timezone: settings.timezone,
      defaultRestSeconds: settings.defaultRestSeconds,
      autoStartRestTimer: settings.autoStartRestTimer,
      restTimerSound: settings.restTimerSound,
      keepScreenAwake: settings.keepScreenAwake,
      effortMetric: settings.effortMetric as "none" | "rir" | "rpe",
      defaultBodyweightMode: settings.defaultBodyweightMode,
      bodyweightInVolume: settings.bodyweightInVolume,
      secondaryMuscleWeight: settings.secondaryMuscleWeight,
    },
    profile: {
      name: profile.name,
      birthDate: profile.birthDate,
      sex: profile.sex,
      heightCm: profile.heightCm,
      targetWeightKg: profile.targetWeightKg,
      trainingLevel: profile.trainingLevel,
      goals: profile.goals,
    },
    muscleGroups: muscles.map((m) => ({ ...m, region: m.region as "upper" | "core" | "lower" })),
    equipment,
    movementPatterns: patterns,
    exercises: exercises.map((e) => ({
      ...e,
      mechanic: e.mechanic as "compound" | "isolation",
      tracking: e.tracking as "reps" | "duration",
      loadMode: e.loadMode as ExportData["exercises"][number]["loadMode"],
      secondaryMuscleIds: (secBy.get(e.id) ?? []).map((x) => x.muscleId),
      archivedAt: iso(e.archivedAt),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    templates: templates.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      items: (itemsBy.get(t.id) ?? []).map(({ templateId: _t, ...i }) => i),
    })),
    planRules: rules.map((r) => ({ ...r, kind: r.kind as "workout" | "rest", createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
    plannedEntries: entries.map((e) => ({
      ...e,
      kind: e.kind as "workout" | "rest",
      status: e.status as ExportData["plannedEntries"][number]["status"],
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    workouts: workouts.map((w) => ({
      id: w.id,
      name: w.name,
      templateId: w.templateId,
      plannedEntryId: w.plannedEntryId,
      status: w.status as "active" | "completed" | "discarded",
      startedAt: w.startedAt.toISOString(),
      endedAt: iso(w.endedAt),
      pausedAt: iso(w.pausedAt),
      pausedSeconds: w.pausedSeconds,
      localDate: w.localDate,
      bodyweightKg: w.bodyweightKg,
      notes: w.notes,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      exercises: (wexBy.get(w.id) ?? []).map(({ workoutId: _w, ...e }) => ({
        ...e,
        tracking: e.tracking as "reps" | "duration",
        loadMode: e.loadMode as ExportData["exercises"][number]["loadMode"],
        sets: (setsBy.get(e.id) ?? []).map(({ workoutExerciseId: _we, ...st }) => ({
          ...st,
          setType: st.setType as "warmup" | "working" | "dropset" | "failure",
          completedAt: iso(st.completedAt),
        })),
      })),
    })),
    bodyWeight: bw.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() })),
  };
}

export interface ImportSummary {
  exercises: number;
  customExercises: number;
  templates: number;
  workouts: number;
  sets: number;
  plannedEntries: number;
  bodyWeight: number;
}

export type ValidationResult = { ok: true; data: ExportData; summary: ImportSummary } | { ok: false; errors: string[] };

/** Validates structure, version and internal references of an export file. */
export function validateExport(raw: unknown): ValidationResult {
  if (typeof raw === "object" && raw && (raw as { format?: unknown }).format !== EXPORT_FORMAT) {
    return { ok: false, errors: ["Keine Bettarrow-Exportdatei (Feld „format“ fehlt oder ist falsch)."] };
  }
  const v = (raw as { version?: unknown })?.version;
  if (typeof v === "number" && v > EXPORT_VERSION) {
    return { ok: false, errors: [`Exportversion ${v} ist neuer als diese App (unterstützt bis ${EXPORT_VERSION}). Bitte App aktualisieren.`] };
  }
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`),
    };
  }
  const d = parsed.data;
  const errors: string[] = [];
  const muscleIds = new Set(d.muscleGroups.map((m) => m.id));
  const equipmentIds = new Set(d.equipment.map((m) => m.id));
  const patternIds = new Set(d.movementPatterns.map((m) => m.id));
  const exerciseIds = new Set(d.exercises.map((e) => e.id));
  const templateIds = new Set(d.templates.map((t) => t.id));
  const entryIds = new Set(d.plannedEntries.map((e) => e.id));
  const ruleIds = new Set(d.planRules.map((r) => r.id));
  for (const m of d.muscleGroups) if (m.parentId && !muscleIds.has(m.parentId)) errors.push(`Muskelgruppe ${m.id}: unbekannte Obergruppe`);
  for (const e of d.exercises) {
    if (!muscleIds.has(e.primaryMuscleId)) errors.push(`Übung ${e.id}: unbekannte Muskelgruppe ${e.primaryMuscleId}`);
    for (const m of e.secondaryMuscleIds) if (!muscleIds.has(m)) errors.push(`Übung ${e.id}: unbekannte Muskelgruppe ${m}`);
    if (!equipmentIds.has(e.equipmentId)) errors.push(`Übung ${e.id}: unbekanntes Equipment ${e.equipmentId}`);
    if (e.movementPatternId && !patternIds.has(e.movementPatternId)) errors.push(`Übung ${e.id}: unbekanntes Bewegungsmuster`);
  }
  for (const t of d.templates) for (const i of t.items) if (!exerciseIds.has(i.exerciseId)) errors.push(`Vorlage ${t.name}: unbekannte Übung ${i.exerciseId}`);
  for (const r of d.planRules) if (r.templateId && !templateIds.has(r.templateId)) errors.push(`Wiederholung ${r.id}: unbekannte Vorlage`);
  for (const e of d.plannedEntries) {
    if (e.templateId && !templateIds.has(e.templateId)) errors.push(`Kalendereintrag ${e.id}: unbekannte Vorlage`);
    if (e.ruleId && !ruleIds.has(e.ruleId)) errors.push(`Kalendereintrag ${e.id}: unbekannte Wiederholung`);
  }
  let activeCount = 0;
  for (const w of d.workouts) {
    if (w.status === "active") activeCount++;
    if (w.templateId && !templateIds.has(w.templateId)) errors.push(`Training ${w.id}: unbekannte Vorlage`);
    if (w.plannedEntryId && !entryIds.has(w.plannedEntryId)) errors.push(`Training ${w.id}: unbekannter Kalendereintrag`);
    for (const e of w.exercises) if (!exerciseIds.has(e.exerciseId)) errors.push(`Training ${w.id}: unbekannte Übung ${e.exerciseId}`);
  }
  if (activeCount > 1) errors.push("Mehr als ein laufendes Training in der Datei.");
  if (new Set(d.bodyWeight.map((b) => b.date)).size !== d.bodyWeight.length) errors.push("Doppelte Körpergewichtseinträge am selben Tag.");
  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return {
    ok: true,
    data: d,
    summary: {
      exercises: d.exercises.length,
      customExercises: d.exercises.filter((e) => e.isCustom).length,
      templates: d.templates.length,
      workouts: d.workouts.length,
      sets: d.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0),
      plannedEntries: d.plannedEntries.length,
      bodyWeight: d.bodyWeight.length,
    },
  };
}

const chunk = <T,>(rows: T[], size = 500): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};
const date = (v: string | null) => (v ? new Date(v) : null);

/**
 * Replaces ALL personal data with the content of a validated export (single transaction:
 * either everything is imported or nothing changes). Built-in reference data is re-applied
 * afterwards so the app stays consistent with its current version.
 */
export async function importData(db: Db, d: ExportData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table workout_sets, workout_exercises, workouts, planned_entries, plan_rules,
      template_exercises, templates, body_weight_entries, exercise_secondary_muscles restart identity cascade`);
    await tx.delete(s.exercises);
    await tx.execute(sql`update muscle_groups set parent_id = null where is_builtin = false`);
    await tx.delete(s.muscleGroups).where(eq(s.muscleGroups.isBuiltin, false));
    await tx.delete(s.equipment).where(eq(s.equipment.isBuiltin, false));
    await tx.delete(s.movementPatterns).where(eq(s.movementPatterns.isBuiltin, false));

    // Reference data (parents first).
    const muscles = [...d.muscleGroups].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    for (const m of muscles) {
      await tx.insert(s.muscleGroups).values(m).onConflictDoUpdate({ target: s.muscleGroups.id, set: { name: m.name, parentId: m.parentId, region: m.region, sortOrder: m.sortOrder } });
    }
    for (const e of d.equipment) await tx.insert(s.equipment).values(e).onConflictDoUpdate({ target: s.equipment.id, set: { name: e.name, category: e.category, sortOrder: e.sortOrder } });
    for (const p of d.movementPatterns) await tx.insert(s.movementPatterns).values(p).onConflictDoUpdate({ target: s.movementPatterns.id, set: { name: p.name, sortOrder: p.sortOrder } });

    for (const part of chunk(d.exercises)) {
      await tx.insert(s.exercises).values(
        part.map(({ secondaryMuscleIds: _s, ...e }) => ({ ...e, archivedAt: date(e.archivedAt), createdAt: new Date(e.createdAt), updatedAt: new Date(e.updatedAt) })),
      );
    }
    const sec = d.exercises.flatMap((e) => [...new Set(e.secondaryMuscleIds)].map((muscleId) => ({ exerciseId: e.id, muscleId })));
    for (const part of chunk(sec)) await tx.insert(s.exerciseSecondaryMuscles).values(part);

    for (const t of d.templates) {
      await tx.insert(s.templates).values({ id: t.id, name: t.name, description: t.description, notes: t.notes, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) });
      if (t.items.length) await tx.insert(s.templateExercises).values(t.items.map((i) => ({ ...i, templateId: t.id })));
    }
    for (const part of chunk(d.planRules)) await tx.insert(s.planRules).values(part.map((r) => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })));
    for (const part of chunk(d.plannedEntries)) await tx.insert(s.plannedEntries).values(part.map((e) => ({ ...e, createdAt: new Date(e.createdAt), updatedAt: new Date(e.updatedAt) })));

    for (const part of chunk(d.workouts, 200)) {
      await tx.insert(s.workouts).values(
        part.map(({ exercises: _e, ...w }) => ({
          ...w,
          startedAt: new Date(w.startedAt),
          endedAt: date(w.endedAt),
          pausedAt: date(w.pausedAt),
          createdAt: new Date(w.createdAt),
          updatedAt: new Date(w.updatedAt),
          revision: 0,
        })),
      );
    }
    const wex = d.workouts.flatMap((w) => w.exercises.map(({ sets: _s, ...e }) => ({ ...e, workoutId: w.id })));
    for (const part of chunk(wex)) await tx.insert(s.workoutExercises).values(part);
    const sets = d.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets.map((st) => ({ ...st, workoutExerciseId: e.id, completedAt: date(st.completedAt) }))));
    for (const part of chunk(sets, 1000)) await tx.insert(s.workoutSets).values(part);
    for (const part of chunk(d.bodyWeight)) await tx.insert(s.bodyWeightEntries).values(part.map((b) => ({ ...b, createdAt: new Date(b.createdAt), updatedAt: new Date(b.updatedAt) })));

    await tx
      .insert(s.settings)
      .values({ id: 1, ...d.settings })
      .onConflictDoUpdate({ target: s.settings.id, set: { ...d.settings, updatedAt: new Date() } });
    await tx
      .insert(s.profile)
      .values({ id: 1, ...d.profile })
      .onConflictDoUpdate({ target: s.profile.id, set: { ...d.profile, updatedAt: new Date() } });
  });
  // Restore any built-in exercises/categories that are missing in older exports.
  await seedReferenceData(db);
}
