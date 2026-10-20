import { addDays, diffDays, startOfWeek, type YMD } from "./dates";

export interface WeightEntry {
  date: YMD;
  weightKg: number;
}

/** Trailing average over the last `days` calendar days (inclusive) for each entry. */
export function rollingAverage(entries: WeightEntry[], days = 7): { date: YMD; avg: number }[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((e) => {
    const from = addDays(e.date, -(days - 1));
    const window = sorted.filter((x) => x.date >= from && x.date <= e.date);
    return { date: e.date, avg: Math.round((window.reduce((a, x) => a + x.weightKg, 0) / window.length) * 100) / 100 };
  });
}

/** Average weight per week (keyed by week start) or month (keyed by first day). */
export function periodAverages(entries: WeightEntry[], unit: "week" | "month", weekStart = 1): { key: YMD; avg: number; count: number }[] {
  const map = new Map<YMD, number[]>();
  for (const e of entries) {
    const key = unit === "week" ? startOfWeek(e.date, weekStart) : e.date.slice(0, 8) + "01";
    map.set(key, [...(map.get(key) ?? []), e.weightKg]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100, count: values.length }));
}

/** Change between the latest entry and the latest entry at least `days` days earlier. */
export function changeOver(entries: WeightEntry[], days: number): number | null {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last) return null;
  const ref = [...sorted].reverse().find((e) => diffDays(last.date, e.date) >= days);
  return ref ? Math.round((last.weightKg - ref.weightKg) * 100) / 100 : null;
}
