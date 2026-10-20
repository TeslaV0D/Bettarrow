import { addDays, eachDay, isoWeekday, type YMD } from "./dates";

export type PlanKind = "workout" | "rest";
export type PlanStatus = "planned" | "completed" | "skipped" | "cancelled";

export interface PlanRuleLike {
  id: string;
  kind: PlanKind;
  templateId: string | null;
  title: string;
  weekdays: number[];
  startDate: YMD;
  endDate: YMD | null;
}

export interface CalendarEntry {
  /** Real entry id, or `rule:<ruleId>:<date>` for a not yet materialized rule occurrence. */
  id: string;
  date: YMD;
  kind: PlanKind;
  templateId: string | null;
  title: string;
  notes: string | null;
  status: PlanStatus;
  movedFrom: YMD | null;
  ruleId: string | null;
  occurrenceDate: YMD | null;
  virtual: boolean;
}

export function virtualEntryId(ruleId: string, date: YMD) {
  return `rule:${ruleId}:${date}`;
}

export function parseVirtualEntryId(id: string): { ruleId: string; date: YMD } | null {
  const m = /^rule:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m ? { ruleId: m[1], date: m[2] } : null;
}

/**
 * Expands recurring rules into virtual entries for [from, to]. Occurrences that were already
 * materialized (moved, skipped, removed, started) are identified by (ruleId, occurrenceDate)
 * and are not generated again.
 */
export function expandRules(
  rules: PlanRuleLike[],
  materialized: { ruleId: string | null; occurrenceDate: YMD | null }[],
  from: YMD,
  to: YMD,
): CalendarEntry[] {
  const taken = new Set(
    materialized.filter((m) => m.ruleId && m.occurrenceDate).map((m) => `${m.ruleId}:${m.occurrenceDate}`),
  );
  const out: CalendarEntry[] = [];
  for (const rule of rules) {
    const start = rule.startDate > from ? rule.startDate : from;
    const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
    if (start > end) continue;
    const weekdays = new Set(rule.weekdays);
    for (const day of eachDay(start, end)) {
      if (!weekdays.has(isoWeekday(day))) continue;
      if (taken.has(`${rule.id}:${day}`)) continue;
      out.push({
        id: virtualEntryId(rule.id, day),
        date: day,
        kind: rule.kind,
        templateId: rule.templateId,
        title: rule.title,
        notes: null,
        status: "planned",
        movedFrom: null,
        ruleId: rule.id,
        occurrenceDate: day,
        virtual: true,
      });
    }
  }
  return out;
}

export type DisplayStatus = "planned" | "completed" | "missed" | "skipped" | "moved" | "rest";

/**
 * Visual state of a planned entry:
 * - rest days are always "rest"
 * - completed / skipped as stored
 * - a planned workout in the past is "missed" (not explicitly skipped, just not done)
 * - a planned workout that was moved shows "moved" until it is done
 */
export function displayStatus(entry: Pick<CalendarEntry, "kind" | "status" | "date" | "movedFrom">, today: YMD): DisplayStatus {
  if (entry.kind === "rest") return "rest";
  if (entry.status === "completed") return "completed";
  if (entry.status === "skipped") return "skipped";
  if (entry.date < today) return "missed";
  if (entry.movedFrom) return "moved";
  return "planned";
}

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  planned: "Geplant",
  completed: "Abgeschlossen",
  missed: "Nicht absolviert",
  skipped: "Ausgefallen",
  moved: "Verschoben",
  rest: "Geplanter Ruhetag",
};

/**
 * Summary state of a single day for compact displays (week strip, month grid).
 * An empty day is "empty" — it is never interpreted as a rest day.
 */
export type DayState = "trained" | "planned" | "missed" | "rest" | "empty";

export function dayState(
  day: YMD,
  today: YMD,
  entries: Pick<CalendarEntry, "kind" | "status" | "date" | "movedFrom">[],
  completedWorkouts: number,
): DayState {
  if (completedWorkouts > 0) return "trained";
  const visible = entries.filter((e) => e.status !== "cancelled");
  const workouts = visible.filter((e) => e.kind === "workout" && e.status !== "skipped");
  if (workouts.some((e) => e.status === "planned")) return day < today ? "missed" : "planned";
  if (visible.some((e) => e.kind === "rest")) return "rest";
  return "empty";
}

export function weekdaysLabel(weekdays: number[]): string {
  const names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return [...weekdays].sort((a, b) => a - b).map((d) => names[d - 1]).join(", ");
}

/** Next `count` dates of a rule starting at `from` (used for previews). */
export function nextOccurrences(rule: Pick<PlanRuleLike, "weekdays" | "startDate" | "endDate">, from: YMD, count: number): YMD[] {
  const out: YMD[] = [];
  let d = rule.startDate > from ? rule.startDate : from;
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (rule.endDate && d > rule.endDate) break;
    if (rule.weekdays.includes(isoWeekday(d))) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
