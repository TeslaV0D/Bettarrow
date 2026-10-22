import { ymdToDate, type YMD } from "./dates";
import { activeIntlLocale, activeLocale, type Locale } from "./i18n/locales";

export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "in";

export const KG_PER_LB = 0.45359237;

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

/** Converts a value entered in the display unit to kg (rounded to grams). */
export function unitToKg(value: number, unit: WeightUnit): number {
  const kg = unit === "kg" ? value : value * KG_PER_LB;
  return Math.round(kg * 1000) / 1000;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(maxDigits: number, minDigits = 0) {
  const locale = activeIntlLocale();
  const key = `${locale}:${minDigits}:${maxDigits}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits });
    numberFormats.set(key, f);
  }
  return f;
}

export function formatNumber(n: number, maxDigits = 1, minDigits = 0): string {
  return nf(maxDigits, minDigits).format(n);
}

/** Weight value in the display unit, without unit suffix. */
export function formatWeightValue(kg: number | null | undefined, unit: WeightUnit = "kg"): string {
  if (kg == null) return "–";
  return formatNumber(kgToUnit(kg, unit), unit === "kg" ? 2 : 1);
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit = "kg"): string {
  if (kg == null) return "–";
  return `${formatWeightValue(kg, unit)} ${unit}`;
}

/** Short unit words per language (hours, minutes, metric tonnes). */
const UNIT_WORDS: Record<Locale, { h: string; min: string; t: string }> = {
  de: { h: "h", min: "min", t: "t" },
  en: { h: "h", min: "min", t: "t" },
  ru: { h: "ч", min: "мин", t: "т" },
  uk: { h: "год", min: "хв", t: "т" },
};

/** Large volumes are shown compact: 12.345 kg → "12,3 t". */
export function formatVolume(kg: number | null | undefined, unit: WeightUnit = "kg"): string {
  if (kg == null) return "–";
  const v = kgToUnit(kg, unit);
  if (unit === "kg" && v >= 10_000) return `${formatNumber(v / 1000, 1)} ${UNIT_WORDS[activeLocale()].t}`;
  return `${formatNumber(v, 0)} ${unit}`;
}

export function formatDuration(totalSeconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (withSeconds) {
    const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  const w = UNIT_WORDS[activeLocale()];
  if (h > 0) return `${h} ${w.h} ${m} ${w.min}`;
  return `${m} ${w.min}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();
function df(style: string, opts: Intl.DateTimeFormatOptions) {
  const locale = activeIntlLocale();
  const key = `${locale}:${style}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts });
    dateFormats.set(key, f);
  }
  return f;
}

/** Formats a calendar day (no time zone conversion involved). */
export function formatDay(ymd: YMD, style: "short" | "medium" | "long" | "weekday" | "month" | "dayMonth" = "medium"): string {
  const d = ymdToDate(ymd);
  switch (style) {
    case "short":
      return df("short", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
    case "long":
      // Composed instead of one weekday+date pattern: ICU versions disagree on that pattern (en-GB comma),
      // which would make server- and browser-rendered text differ.
      return capitalize(`${df("weekdayLong", { weekday: "long" }).format(d)}, ${df("long", { day: "numeric", month: "long", year: "numeric" }).format(d)}`);
    case "weekday":
      return capitalize(df("weekday", { weekday: "short" }).format(d).replace(".", ""));
    case "month":
      return capitalize(df("month", { month: "long", year: "numeric" }).format(d).replace(/\s*[гр]\.$/, ""));
    case "dayMonth":
      return df("dayMonth", { day: "numeric", month: "short" }).format(d);
    case "medium":
    default:
      return df("medium", { day: "numeric", month: "short", year: "numeric" }).format(d);
  }
}

/** Formats an instant as time of day in the given time zone. */
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(activeIntlLocale(), { timeZone, hour: "2-digit", minute: "2-digit" }).format(instant);
}

/** "Heute", "Gestern", "vor 3 Tagen" … in the active language; older days as a date. */
export function relativeDay(ymd: YMD, today: YMD): string {
  const diff = Math.round((ymdToDate(today).getTime() - ymdToDate(ymd).getTime()) / 86_400_000);
  if (diff >= -1 && diff < 7) {
    return capitalize(new Intl.RelativeTimeFormat(activeIntlLocale(), { numeric: "auto" }).format(-diff, "day"));
  }
  return formatDay(ymd, "medium");
}

/** Short weekday names (index 0 = Monday … 6 = Sunday) in the active language. */
export function weekdayNames(style: "short" | "narrow" | "long" = "short"): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    return capitalize(new Intl.DateTimeFormat(activeIntlLocale(), { timeZone: "UTC", weekday: style }).format(d).replace(".", ""));
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(activeIntlLocale()) + s.slice(1);
}
