import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, diffDays, endOfMonth, endOfWeek, instantToYmd, isYmd, isoWeekday, monthGrid, periodRange, startOfWeek, todayIn,
} from "@/lib/dates";

describe("date arithmetic", () => {
  it("validates YMD strings", () => {
    expect(isYmd("2026-02-28")).toBe(true);
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2028-02-29")).toBe(true);
    expect(isYmd("2026-13-01")).toBe(false);
    expect(isYmd("26-01-01")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("is not affected by DST transitions", () => {
    // Europe DST changes on 2026-03-29 and 2026-10-25.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(diffDays("2026-10-26", "2026-10-24")).toBe(2);
  });

  it("adds months with day clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("computes ISO weekdays and week starts", () => {
    expect(isoWeekday("2026-10-19")).toBe(1); // Monday
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(startOfWeek("2026-10-25", 1)).toBe("2026-10-19");
    expect(endOfWeek("2026-10-19", 1)).toBe("2026-10-25");
    expect(startOfWeek("2026-10-25", 7)).toBe("2026-10-25"); // weeks starting Sunday
    expect(startOfWeek("2026-10-24", 7)).toBe("2026-10-18");
  });

  it("handles weeks spanning a year change", () => {
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28");
    expect(endOfWeek("2026-12-30", 1)).toBe("2027-01-03");
  });

  it("builds month grids with full weeks", () => {
    const grid = monthGrid("2026-02-10", 1);
    expect(grid[0][0]).toBe("2026-01-26");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid.at(-1)!.at(-1)).toBe("2026-03-01");
    expect(endOfMonth("2028-02-03")).toBe("2028-02-29");
  });
});

describe("time zone conversion", () => {
  it("maps instants around midnight to the right calendar day", () => {
    // 2026-10-19 22:30 UTC is already 00:30 on 2026-10-20 in Berlin (CEST, UTC+2).
    const instant = new Date("2026-10-19T22:30:00Z");
    expect(instantToYmd(instant, "Europe/Berlin")).toBe("2026-10-20");
    expect(instantToYmd(instant, "UTC")).toBe("2026-10-19");
    expect(instantToYmd(instant, "America/New_York")).toBe("2026-10-19");
  });

  it("maps new year's eve correctly", () => {
    const instant = new Date("2026-12-31T23:30:00Z");
    expect(todayIn("Europe/Berlin", instant)).toBe("2027-01-01");
    expect(todayIn("UTC", instant)).toBe("2026-12-31");
  });

  it("respects the DST switch (winter time)", () => {
    // After 2026-10-25 Berlin is UTC+1.
    expect(instantToYmd(new Date("2026-10-26T23:30:00Z"), "Europe/Berlin")).toBe("2026-10-27");
    expect(instantToYmd(new Date("2026-10-26T22:59:00Z"), "Europe/Berlin")).toBe("2026-10-26");
  });
});

describe("period ranges", () => {
  const today = "2026-10-20"; // Tuesday
  it("computes week and month ranges", () => {
    expect(periodRange("this_week", today)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodRange("last_week", today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodRange("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("last_month", "2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("last_month", "2027-01-05")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(periodRange("last_90", today)).toEqual({ from: "2026-07-23", to: today });
    expect(periodRange("all", today)).toEqual({ from: null, to: null });
  });
  it("normalizes custom ranges", () => {
    expect(periodRange("custom", today, 1, { from: "2026-05-10", to: "2026-05-01" })).toEqual({ from: "2026-05-01", to: "2026-05-10" });
    expect(periodRange("custom", today, 1, { from: "nope" })).toEqual({ from: null, to: null });
  });
});
