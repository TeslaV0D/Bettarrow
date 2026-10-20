import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { getCalendarRange, listRules } from "@/server/services/calendar";
import { getSettings } from "@/server/queries/settings";
import { addDays, endOfWeek, isYmd, monthGrid, startOfWeek, todayIn } from "@/lib/dates";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Kalender" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; day?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const view = sp.view === "week" ? "week" : "month";
  const anchor = sp.date && isYmd(sp.date) ? sp.date : today;
  const weeks =
    view === "month"
      ? monthGrid(anchor, settings.weekStart)
      : [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, settings.weekStart), i))];
  const from = weeks[0][0];
  const to = weeks.at(-1)!.at(-1)!;
  const [range, templates, rules] = await Promise.all([
    getCalendarRange(db, from, to),
    db.select({ id: s.templates.id, name: s.templates.name }).from(s.templates).orderBy(asc(s.templates.name)),
    listRules(db),
  ]);
  const selected = sp.day && isYmd(sp.day) && sp.day >= from && sp.day <= to ? sp.day : today >= from && today <= to ? today : view === "month" ? anchor.slice(0, 8) + "01" : from;
  return (
    <CalendarView
      key={`${view}-${from}`}
      view={view}
      anchor={anchor}
      today={today}
      weekStart={settings.weekStart}
      weeks={weeks}
      initialSelected={selected}
      entries={range.entries}
      workouts={range.workouts.map((w) => ({ id: w.id, name: w.name, localDate: w.localDate, status: w.status, plannedEntryId: w.plannedEntryId }))}
      templates={templates}
      rules={rules.map((r) => ({ id: r.id, kind: r.kind as "workout" | "rest", title: r.title, templateId: r.templateId, weekdays: r.weekdays, startDate: r.startDate, endDate: r.endDate }))}
      weekEnd={endOfWeek(anchor, settings.weekStart)}
    />
  );
}
