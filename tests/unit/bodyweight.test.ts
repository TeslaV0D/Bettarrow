import { describe, expect, it } from "vitest";
import { changeOver, periodAverages, rollingAverage } from "@/lib/bodyweight";

const entries = [
  { date: "2026-10-01", weightKg: 80 },
  { date: "2026-10-03", weightKg: 81 },
  { date: "2026-10-09", weightKg: 79 },
  { date: "2026-11-02", weightKg: 78 },
];

describe("bodyweight", () => {
  it("computes trailing averages over calendar days", () => {
    expect(rollingAverage(entries, 7).map((x) => x.avg)).toEqual([80, 80.5, 80, 78]);
  });
  it("computes week and month averages", () => {
    expect(periodAverages(entries, "month")).toEqual([
      { key: "2026-10-01", avg: 80, count: 3 },
      { key: "2026-11-01", avg: 78, count: 1 },
    ]);
    expect(periodAverages(entries, "week").map((x) => x.key)).toEqual(["2026-09-28", "2026-10-05", "2026-11-02"]);
  });
  it("computes the change over a period", () => {
    expect(changeOver(entries, 30)).toBe(-3); // reference: latest entry ≥ 30 days earlier (Oct 3)
    expect(changeOver(entries.slice(0, 1), 7)).toBeNull();
  });
});
