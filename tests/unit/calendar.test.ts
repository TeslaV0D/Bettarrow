import { describe, expect, it } from "vitest";
import { dayState, displayStatus, expandRules, nextOccurrences, parseVirtualEntryId, virtualEntryId } from "@/lib/calendar";

const rule = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "workout" as const,
  templateId: null,
  title: "Push",
  weekdays: [1, 3, 5],
  startDate: "2026-10-01",
  endDate: null,
};

describe("recurring rules", () => {
  it("expands occurrences on the configured weekdays", () => {
    const e = expandRules([rule], [], "2026-10-19", "2026-10-25");
    expect(e.map((x) => x.date)).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
    expect(e.every((x) => x.virtual)).toBe(true);
  });
  it("respects start and end dates", () => {
    const e = expandRules([{ ...rule, startDate: "2026-10-21", endDate: "2026-10-22" }], [], "2026-10-19", "2026-10-25");
    expect(e.map((x) => x.date)).toEqual(["2026-10-21"]);
  });
  it("skips materialized occurrences (moved, skipped, removed)", () => {
    const e = expandRules([rule], [{ ruleId: rule.id, occurrenceDate: "2026-10-21" }], "2026-10-19", "2026-10-25");
    expect(e.map((x) => x.date)).toEqual(["2026-10-19", "2026-10-23"]);
  });
  it("round-trips virtual ids", () => {
    expect(parseVirtualEntryId(virtualEntryId(rule.id, "2026-10-21"))).toEqual({ ruleId: rule.id, date: "2026-10-21" });
    expect(parseVirtualEntryId("not-virtual")).toBeNull();
  });
  it("lists next occurrences", () => {
    expect(nextOccurrences(rule, "2026-10-20", 3)).toEqual(["2026-10-21", "2026-10-23", "2026-10-26"]);
  });
});

describe("day states", () => {
  const today = "2026-10-20";
  it("never treats an empty day as a rest day", () => {
    expect(dayState("2026-10-18", today, [], 0)).toBe("empty");
  });
  it("distinguishes trained, planned, missed and rest", () => {
    const planned = { kind: "workout" as const, status: "planned" as const, date: "2026-10-21", movedFrom: null };
    expect(dayState("2026-10-21", today, [planned], 0)).toBe("planned");
    expect(dayState("2026-10-19", today, [{ ...planned, date: "2026-10-19" }], 0)).toBe("missed");
    expect(dayState("2026-10-19", today, [{ ...planned, date: "2026-10-19" }], 1)).toBe("trained");
    expect(dayState("2026-10-19", today, [{ kind: "rest", status: "planned", date: "2026-10-19", movedFrom: null }], 0)).toBe("rest");
  });
  it("derives display states", () => {
    const base = { kind: "workout" as const, status: "planned" as const, date: "2026-10-22", movedFrom: null };
    expect(displayStatus(base, today)).toBe("planned");
    expect(displayStatus({ ...base, movedFrom: "2026-10-21" }, today)).toBe("moved");
    expect(displayStatus({ ...base, date: "2026-10-19" }, today)).toBe("missed");
    expect(displayStatus({ ...base, status: "skipped" }, today)).toBe("skipped");
    expect(displayStatus({ ...base, status: "completed" }, today)).toBe("completed");
  });
});
