import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/types";
import * as s from "@/server/db/schema";
import { expandRules, parseVirtualEntryId, type CalendarEntry, type PlanKind, type PlanStatus, type PlanRuleLike } from "@/lib/calendar";
import type { YMD } from "@/lib/dates";

/**
 * Converts a virtual rule occurrence id (`rule:<ruleId>:<date>`) into a real planned entry and
 * returns its id. Real ids are returned unchanged. Idempotent thanks to the unique index on
 * (rule_id, occurrence_date).
 */
export async function materializeEntry(tx: DbOrTx, id: string): Promise<string> {
  const virtual = parseVirtualEntryId(id);
  if (!virtual) return id;
  const [rule] = await tx.select().from(s.planRules).where(eq(s.planRules.id, virtual.ruleId)).limit(1);
  if (!rule) throw new Error("Wiederholung nicht gefunden");
  await tx
    .insert(s.plannedEntries)
    .values({
      date: virtual.date,
      kind: rule.kind,
      templateId: rule.templateId,
      title: rule.title,
      status: "planned",
      ruleId: rule.id,
      occurrenceDate: virtual.date,
    })
    .onConflictDoNothing();
  const [row] = await tx
    .select({ id: s.plannedEntries.id })
    .from(s.plannedEntries)
    .where(and(eq(s.plannedEntries.ruleId, rule.id), eq(s.plannedEntries.occurrenceDate, virtual.date)))
    .limit(1);
  return row.id;
}

export interface CalendarWorkout {
  id: string;
  name: string;
  localDate: YMD;
  status: "active" | "completed";
  plannedEntryId: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

export interface CalendarRange {
  entries: CalendarEntry[];
  workouts: CalendarWorkout[];
}

export async function getCalendarRange(db: DbOrTx, from: YMD, to: YMD): Promise<CalendarRange> {
  const [entries, rules, workouts] = await Promise.all([
    db
      .select()
      .from(s.plannedEntries)
      .where(and(gte(s.plannedEntries.date, from), lte(s.plannedEntries.date, to), ne(s.plannedEntries.status, "cancelled")))
      .orderBy(asc(s.plannedEntries.date), asc(s.plannedEntries.createdAt)),
    db
      .select()
      .from(s.planRules)
      .where(and(lte(s.planRules.startDate, to), sql`(${s.planRules.endDate} is null or ${s.planRules.endDate} >= ${from})`)),
    db
      .select({
        id: s.workouts.id,
        name: s.workouts.name,
        localDate: s.workouts.localDate,
        status: s.workouts.status,
        plannedEntryId: s.workouts.plannedEntryId,
        startedAt: s.workouts.startedAt,
        endedAt: s.workouts.endedAt,
      })
      .from(s.workouts)
      .where(and(gte(s.workouts.localDate, from), lte(s.workouts.localDate, to), inArray(s.workouts.status, ["active", "completed"])))
      .orderBy(asc(s.workouts.startedAt)),
  ]);

  // Materialized occurrences (any status, including cancelled) suppress the virtual ones.
  const materialized = rules.length
    ? await db
        .select({ ruleId: s.plannedEntries.ruleId, occurrenceDate: s.plannedEntries.occurrenceDate })
        .from(s.plannedEntries)
        .where(
          and(
            inArray(s.plannedEntries.ruleId, rules.map((r) => r.id)),
            gte(s.plannedEntries.occurrenceDate, from),
            lte(s.plannedEntries.occurrenceDate, to),
          ),
        )
    : [];

  const real: CalendarEntry[] = entries.map((e) => ({
    id: e.id,
    date: e.date,
    kind: e.kind as PlanKind,
    templateId: e.templateId,
    title: e.title,
    notes: e.notes,
    status: e.status as PlanStatus,
    movedFrom: e.movedFrom,
    ruleId: e.ruleId,
    occurrenceDate: e.occurrenceDate,
    virtual: false,
  }));
  const virtual = expandRules(
    rules.map((r) => ({ ...r, kind: r.kind as PlanKind, weekdays: r.weekdays })),
    materialized,
    from,
    to,
  );
  const all = [...real, ...virtual].sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) * -1 : a.date < b.date ? -1 : 1));
  return { entries: all, workouts: workouts.map((w) => ({ ...w, status: w.status as "active" | "completed" })) };
}

export async function planEntry(
  db: Db,
  input: { date: YMD; kind: PlanKind; templateId?: string | null; title?: string | null; notes?: string | null },
): Promise<string> {
  let title = input.title?.trim() || null;
  if (input.kind === "rest") {
    title = title ?? "Ruhetag";
    // Only one active rest day entry per date.
    const [existing] = await db
      .select({ id: s.plannedEntries.id })
      .from(s.plannedEntries)
      .where(and(eq(s.plannedEntries.date, input.date), eq(s.plannedEntries.kind, "rest"), ne(s.plannedEntries.status, "cancelled")))
      .limit(1);
    if (existing) return existing.id;
  } else if (input.templateId && !title) {
    const [tpl] = await db.select({ name: s.templates.name }).from(s.templates).where(eq(s.templates.id, input.templateId)).limit(1);
    title = tpl?.name ?? null;
  }
  const [row] = await db
    .insert(s.plannedEntries)
    .values({
      date: input.date,
      kind: input.kind,
      templateId: input.kind === "workout" ? (input.templateId ?? null) : null,
      title: title ?? "Training",
      notes: input.notes ?? null,
      status: "planned",
    })
    .returning({ id: s.plannedEntries.id });
  return row.id;
}

export async function updateEntry(
  db: Db,
  id: string,
  patch: { templateId?: string | null; title?: string; notes?: string | null },
): Promise<string> {
  return db.transaction(async (tx) => {
    const realId = await materializeEntry(tx, id);
    const set: Partial<typeof s.plannedEntries.$inferInsert> = { updatedAt: new Date() };
    if (patch.templateId !== undefined) set.templateId = patch.templateId;
    if (patch.title !== undefined) set.title = patch.title.trim() || "Training";
    if (patch.notes !== undefined) set.notes = patch.notes;
    await tx.update(s.plannedEntries).set(set).where(eq(s.plannedEntries.id, realId));
    return realId;
  });
}

/** Moves an entry to another day. The original day is remembered so the entry shows as "moved". */
export async function moveEntry(db: Db, id: string, date: YMD): Promise<string> {
  return db.transaction(async (tx) => {
    const realId = await materializeEntry(tx, id);
    const [e] = await tx.select().from(s.plannedEntries).where(eq(s.plannedEntries.id, realId)).limit(1);
    if (!e) throw new Error("Eintrag nicht gefunden");
    if (e.status === "completed") throw new Error("Abgeschlossene Einheiten können nicht verschoben werden");
    const original = e.movedFrom ?? e.date;
    await tx
      .update(s.plannedEntries)
      .set({ date, movedFrom: original === date ? null : original, status: "planned", updatedAt: new Date() })
      .where(eq(s.plannedEntries.id, realId));
    return realId;
  });
}

export async function setEntryStatus(db: Db, id: string, status: Extract<PlanStatus, "planned" | "skipped" | "cancelled">): Promise<{ id: string; previous: PlanStatus }> {
  return db.transaction(async (tx) => {
    const realId = await materializeEntry(tx, id);
    const [e] = await tx.select({ status: s.plannedEntries.status }).from(s.plannedEntries).where(eq(s.plannedEntries.id, realId)).limit(1);
    if (!e) throw new Error("Eintrag nicht gefunden");
    if (e.status === "completed" && status !== "planned") throw new Error("Abgeschlossene Einheiten können nicht geändert werden");
    await tx.update(s.plannedEntries).set({ status, updatedAt: new Date() }).where(eq(s.plannedEntries.id, realId));
    return { id: realId, previous: e.status as PlanStatus };
  });
}

/** Restores a status after an undo. */
export async function restoreEntryStatus(db: Db, id: string, status: PlanStatus) {
  await db.update(s.plannedEntries).set({ status, updatedAt: new Date() }).where(eq(s.plannedEntries.id, id));
}

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

export type PlanRule = typeof s.planRules.$inferSelect;

export async function listRules(db: DbOrTx): Promise<PlanRule[]> {
  return db.select().from(s.planRules).orderBy(asc(s.planRules.createdAt));
}

export async function createRule(
  db: Db,
  input: { kind: PlanKind; templateId?: string | null; title?: string | null; weekdays: number[]; startDate: YMD; endDate?: YMD | null },
): Promise<string> {
  let title = input.title?.trim() || null;
  if (!title && input.kind === "workout" && input.templateId) {
    const [tpl] = await db.select({ name: s.templates.name }).from(s.templates).where(eq(s.templates.id, input.templateId)).limit(1);
    title = tpl?.name ?? null;
  }
  const [row] = await db
    .insert(s.planRules)
    .values({
      kind: input.kind,
      templateId: input.kind === "workout" ? (input.templateId ?? null) : null,
      title: title ?? (input.kind === "rest" ? "Ruhetag" : "Training"),
      weekdays: [...new Set(input.weekdays)].sort(),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    })
    .returning({ id: s.planRules.id });
  return row.id;
}

/**
 * Deletes a rule. Future, still planned occurrences that were already materialized are removed;
 * past entries and completed workouts are kept (their rule reference is cleared).
 */
export async function deleteRule(db: Db, id: string, today: YMD): Promise<void> {
  await db.transaction((tx) => deleteRuleTx(tx, id, today));
}

async function deleteRuleTx(tx: DbOrTx, id: string, today: YMD): Promise<void> {
  {
    await tx
      .delete(s.plannedEntries)
      .where(
        and(
          eq(s.plannedEntries.ruleId, id),
          gte(s.plannedEntries.date, today),
          inArray(s.plannedEntries.status, ["planned", "cancelled", "skipped"]),
          sql`not exists (select 1 from ${s.workouts} w where w.planned_entry_id = "planned_entries"."id")`,
        ),
      );
    await tx.delete(s.planRules).where(eq(s.planRules.id, id));
  }
}

/** Ends a rule as of yesterday (keeps past occurrences visible, removes future ones). */
export async function endRule(db: Db, id: string, today: YMD, yesterday: YMD): Promise<void> {
  await db.transaction(async (tx) => {
    const [rule] = await tx.select().from(s.planRules).where(eq(s.planRules.id, id)).limit(1);
    if (!rule) return;
    if (rule.startDate >= today) {
      await deleteRuleTx(tx, id, today);
      return;
    }
    await tx.update(s.planRules).set({ endDate: yesterday, updatedAt: new Date() }).where(eq(s.planRules.id, id));
    await tx
      .delete(s.plannedEntries)
      .where(and(eq(s.plannedEntries.ruleId, id), gte(s.plannedEntries.date, today), eq(s.plannedEntries.status, "planned")));
  });
}

export type { PlanRuleLike };
