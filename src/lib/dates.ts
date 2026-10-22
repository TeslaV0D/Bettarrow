/**
 * Calendar-day helpers.
 *
 * Calendar days are represented as ISO strings `YYYY-MM-DD` ("YMD") without any time zone.
 * All arithmetic happens on UTC-midnight Date objects, which is immune to DST shifts.
 * Converting an instant (timestamp) to a calendar day always requires the user's time zone.
 */

export type YMD = string;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(value: unknown): value is YMD {
  if (typeof value !== "string") return false;
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function ymdToDate(ymd: YMD): Date {
  const m = YMD_RE.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function dateToYmd(date: Date): YMD {
  return date.toISOString().slice(0, 10);
}

export function makeYmd(year: number, month1: number, day: number): YMD {
  return dateToYmd(new Date(Date.UTC(year, month1 - 1, day)));
}

export function addDays(ymd: YMD, days: number): YMD {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToYmd(d);
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(ymd: YMD, months: number): YMD {
  const d = ymdToDate(ymd);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return dateToYmd(target);
}

export function diffDays(a: YMD, b: YMD): number {
  return Math.round((ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(ymd: YMD): number {
  const wd = ymdToDate(ymd).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** First day of the week containing `ymd`. `weekStart` is an ISO weekday (1 = Monday). */
export function startOfWeek(ymd: YMD, weekStart = 1): YMD {
  const offset = (isoWeekday(ymd) - weekStart + 7) % 7;
  return addDays(ymd, -offset);
}

export function endOfWeek(ymd: YMD, weekStart = 1): YMD {
  return addDays(startOfWeek(ymd, weekStart), 6);
}

export function startOfMonth(ymd: YMD): YMD {
  return ymd.slice(0, 8) + "01";
}

export function endOfMonth(ymd: YMD): YMD {
  const d = ymdToDate(ymd);
  return dateToYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function startOfYear(ymd: YMD): YMD {
  return ymd.slice(0, 4) + "-01-01";
}

export function eachDay(from: YMD, to: YMD): YMD[] {
  const out: YMD[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Weeks (arrays of 7 days) covering the whole month of `ymd`. */
export function monthGrid(ymd: YMD, weekStart = 1): YMD[][] {
  const first = startOfWeek(startOfMonth(ymd), weekStart);
  const last = endOfWeek(endOfMonth(ymd), weekStart);
  const days = eachDay(first, last);
  const weeks: YMD[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const tzFormatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar day of an instant in the given IANA time zone. */
export function instantToYmd(instant: Date, timeZone: string): YMD {
  let fmt = tzFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    tzFormatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayIn(timeZone: string, now: Date = new Date()): YMD {
  return instantToYmd(now, timeZone);
}

/** Hour of day (0-23) of an instant in the given time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number.parseInt(h, 10);
}

export type PeriodKey =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_90"
  | "this_year"
  | "all"
  | "custom";

export const PERIOD_KEYS: PeriodKey[] = ["this_week", "last_week", "this_month", "last_month", "last_90", "this_year", "all", "custom"];

/** Inclusive date range for a period. `null` bounds mean "unbounded". */
export function periodRange(
  key: PeriodKey,
  today: YMD,
  weekStart = 1,
  custom?: { from?: YMD; to?: YMD },
): { from: YMD | null; to: YMD | null } {
  switch (key) {
    case "this_week":
      return { from: startOfWeek(today, weekStart), to: endOfWeek(today, weekStart) };
    case "last_week": {
      const start = addDays(startOfWeek(today, weekStart), -7);
      return { from: start, to: addDays(start, 6) };
    }
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "last_90":
      return { from: addDays(today, -89), to: today };
    case "this_year":
      return { from: startOfYear(today), to: today.slice(0, 4) + "-12-31" };
    case "custom": {
      const from = custom?.from && isYmd(custom.from) ? custom.from : null;
      const to = custom?.to && isYmd(custom.to) ? custom.to : null;
      if (from && to && from > to) return { from: to, to: from };
      return { from, to };
    }
    case "all":
    default:
      return { from: null, to: null };
  }
}
