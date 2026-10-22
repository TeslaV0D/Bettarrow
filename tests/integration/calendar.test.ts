import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { createRule, deleteRule, endRule, getCalendarRange, materializeEntry, moveEntry, planEntry, setEntryStatus } from "@/server/services/calendar";
import { finishWorkout, getWorkoutDetail, startWorkout } from "@/server/services/workouts";
import { saveTemplate } from "@/server/services/templates";
import { virtualEntryId } from "@/lib/calendar";
import { closeTestDb, resetUserData, testDb } from "../support/db";

const db = testDb();
afterAll(closeTestDb);
beforeEach(() => resetUserData(db));

describe("planning", () => {
  it("plans workouts and rest days and lists them in a range", async () => {
    await planEntry(db, { date: "2026-10-21", kind: "workout", title: "Pull" });
    await planEntry(db, { date: "2026-10-22", kind: "rest" });
    const r = await getCalendarRange(db, "2026-10-19", "2026-10-25");
    expect(r.entries.map((e) => [e.date, e.kind, e.title])).toEqual([
      ["2026-10-21", "workout", "Pull"],
      ["2026-10-22", "rest", "Ruhetag"],
    ]);
  });

  it("does not create duplicate rest days", async () => {
    const a = await planEntry(db, { date: "2026-10-22", kind: "rest" });
    const b = await planEntry(db, { date: "2026-10-22", kind: "rest" });
    expect(a).toBe(b);
  });

  it("an empty day has no entries (never an implicit rest day)", async () => {
    const r = await getCalendarRange(db, "2026-10-19", "2026-10-25");
    expect(r.entries).toEqual([]);
  });

  it("moves entries and remembers the original date", async () => {
    const id = await planEntry(db, { date: "2026-10-21", kind: "workout", title: "Pull" });
    await moveEntry(db, id, "2026-10-23");
    await moveEntry(db, id, "2026-10-24");
    const [e] = await db.select().from(s.plannedEntries).where(eq(s.plannedEntries.id, id));
    expect(e).toMatchObject({ date: "2026-10-24", movedFrom: "2026-10-21" });
    await moveEntry(db, id, "2026-10-21");
    const [back] = await db.select().from(s.plannedEntries).where(eq(s.plannedEntries.id, id));
    expect(back.movedFrom).toBeNull();
  });

  it("works across month and year boundaries", async () => {
    await planEntry(db, { date: "2026-12-31", kind: "workout", title: "Silvester" });
    await planEntry(db, { date: "2027-01-01", kind: "rest" });
    const dec = await getCalendarRange(db, "2026-12-28", "2027-01-03");
    expect(dec.entries.map((e) => e.date)).toEqual(["2026-12-31", "2027-01-01"]);
    const jan = await getCalendarRange(db, "2027-01-01", "2027-01-31");
    expect(jan.entries.map((e) => e.date)).toEqual(["2027-01-01"]);
  });
});

describe("recurring rules", () => {
  it("expands, materializes on interaction and never duplicates", async () => {
    const ruleId = await createRule(db, { kind: "workout", title: "Push", weekdays: [1, 3, 5], startDate: "2026-10-01" });
    let r = await getCalendarRange(db, "2026-10-19", "2026-10-25");
    expect(r.entries.map((e) => e.date)).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
    expect(r.entries.every((e) => e.virtual)).toBe(true);

    // Move Wednesday's occurrence to Thursday.
    const moved = await moveEntry(db, virtualEntryId(ruleId, "2026-10-21"), "2026-10-22");
    expect(await materializeEntry(db, virtualEntryId(ruleId, "2026-10-21"))).toBe(moved);
    r = await getCalendarRange(db, "2026-10-19", "2026-10-25");
    expect(r.entries.map((e) => [e.date, e.virtual, e.movedFrom])).toEqual([
      ["2026-10-19", true, null],
      ["2026-10-22", false, "2026-10-21"],
      ["2026-10-23", true, null],
    ]);

    // Remove Friday's occurrence.
    await setEntryStatus(db, virtualEntryId(ruleId, "2026-10-23"), "cancelled");
    r = await getCalendarRange(db, "2026-10-19", "2026-10-25");
    expect(r.entries.map((e) => e.date)).toEqual(["2026-10-19", "2026-10-22"]);
  });

  it("ending a rule keeps the past and removes the future", async () => {
    const ruleId = await createRule(db, { kind: "rest", weekdays: [7], startDate: "2026-09-01" });
    await endRule(db, ruleId, "2026-10-20", "2026-10-19");
    const r = await getCalendarRange(db, "2026-10-01", "2026-10-31");
    expect(r.entries.map((e) => e.date)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]);
  });

  it("deleting a rule removes it entirely", async () => {
    const ruleId = await createRule(db, { kind: "workout", title: "X", weekdays: [2], startDate: "2026-10-01" });
    await deleteRule(db, ruleId, "2026-10-01");
    expect((await getCalendarRange(db, "2026-10-01", "2026-10-31")).entries).toEqual([]);
  });
});

describe("calendar ↔ workouts", () => {
  it("starting a planned entry links it and finishing marks it completed", async () => {
    const id = await planEntry(db, { date: "2026-10-20", kind: "workout", title: "Legs" });
    const w = await startWorkout(db, { plannedEntryId: id }, { timezone: "UTC", now: new Date("2026-10-20T08:00:00Z") });
    expect((await getWorkoutDetail(db, w.id))!.name).toBe("Legs");
    await finishWorkout(db, w.id, { incomplete: "keep" });
    const [e] = await db.select().from(s.plannedEntries).where(eq(s.plannedEntries.id, id));
    expect(e.status).toBe("completed");
  });

  it("starting a template that is planned today links the plan automatically (also rule occurrences)", async () => {
    const tpl = await saveTemplate(db, null, { name: "Push", items: [{ exerciseId: "bench-press-barbell", targetSets: 2 }] });
    await createRule(db, { kind: "workout", templateId: tpl, weekdays: [2], startDate: "2026-10-01" });
    const w = await startWorkout(db, { templateId: tpl }, { timezone: "UTC", now: new Date("2026-10-20T08:00:00Z") });
    await finishWorkout(db, w.id, { incomplete: "complete" });
    const r = await getCalendarRange(db, "2026-10-20", "2026-10-20");
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ status: "completed", virtual: false });
    expect(r.workouts[0].plannedEntryId).toBe(r.entries[0].id);
  });

  it("a planned rest day cannot be started", async () => {
    const id = await planEntry(db, { date: "2026-10-20", kind: "rest" });
    await expect(startWorkout(db, { plannedEntryId: id }, { timezone: "UTC" })).rejects.toThrow(/workout\.restCannotStart/);
  });
});
