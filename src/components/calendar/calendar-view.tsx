"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { dayState, displayStatus, weekdaysLabel, type CalendarEntry, type DisplayStatus } from "@/lib/calendar";
import { addDays, addMonths, isoWeekday, type YMD } from "@/lib/dates";
import { formatDay, weekdayNames } from "@/lib/format";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useStartWorkout } from "@/components/shell/use-start-workout";
import {
  createRuleAction,
  endRuleAction,
  moveEntryAction,
  planEntryAction,
  restoreEntryStatusAction,
  setEntryStatusAction,
  updateEntryAction,
} from "@/server/actions/calendar";
import { fmt, plural, type Dict } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

export interface CalWorkout {
  id: string;
  name: string;
  localDate: YMD;
  status: "active" | "completed";
  plannedEntryId: string | null;
}

export interface CalRule {
  id: string;
  kind: "workout" | "rest";
  title: string;
  templateId: string | null;
  weekdays: number[];
  startDate: YMD;
  endDate: YMD | null;
}

const STATUS_STYLE: Record<DisplayStatus, string> = {
  completed: "bg-accent text-accent-ink",
  planned: "border border-accent/60 text-accent",
  moved: "border border-info/60 text-info",
  missed: "border border-warning/60 text-warning",
  skipped: "bg-surface-3 text-subtle line-through",
  rest: "bg-surface-3 text-muted",
};

export function CalendarView(props: {
  view: "month" | "week";
  anchor: YMD;
  today: YMD;
  weekStart: number;
  weeks: YMD[][];
  initialSelected: YMD;
  entries: CalendarEntry[];
  workouts: CalWorkout[];
  templates: { id: string; name: string }[];
  rules: CalRule[];
  weekEnd: YMD;
}) {
  const { view, anchor, today, weeks, entries, workouts, templates, rules } = props;
  const router = useRouter();
  const t = useT();
  const [selected, setSelected] = useState(props.initialSelected);
  const [planOpen, setPlanOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<YMD, { entries: CalendarEntry[]; workouts: CalWorkout[] }>();
    for (const e of entries) {
      const d = map.get(e.date) ?? { entries: [], workouts: [] };
      d.entries.push(e);
      map.set(e.date, d);
    }
    for (const w of workouts) {
      const d = map.get(w.localDate) ?? { entries: [], workouts: [] };
      d.workouts.push(w);
      map.set(w.localDate, d);
    }
    return map;
  }, [entries, workouts]);

  const prev = view === "month" ? addMonths(anchor.slice(0, 8) + "01", -1) : addDays(anchor, -7);
  const next = view === "month" ? addMonths(anchor.slice(0, 8) + "01", 1) : addDays(anchor, 7);
  const href = (date: YMD, v = view) => `/calendar?view=${v}&date=${date}`;
  const title = view === "month" ? formatDay(anchor, "month") : `${formatDay(weeks[0][0], "dayMonth")} – ${formatDay(weeks[0][6], "dayMonth")}`;
  const names = weekdayNames();
  const weekdayHeader = Array.from({ length: 7 }, (_, i) => names[(props.weekStart - 1 + i) % 7]);
  const day = byDay.get(selected) ?? { entries: [], workouts: [] };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold capitalize tracking-tight sm:text-[28px]">{title}</h1>
        <Segmented
          aria-label={t.muscleMap.view}
          value={view}
          onChange={(v) => router.push(href(anchor, v))}
          options={[
            { value: "month", label: t.calendar.month },
            { value: "week", label: t.calendar.week },
          ]}
        />
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Link href={href(prev)} className={buttonClasses("secondary", "icon")} aria-label={view === "month" ? t.calendar.prevMonth : t.calendar.prevWeek}>
          <ChevronLeft className="size-4" />
        </Link>
        <Link href={`${href(today)}&day=${today}`} className={buttonClasses("secondary", "md")}>
          {t.common.today}
        </Link>
        <Link href={href(next)} className={buttonClasses("secondary", "icon")} aria-label={view === "month" ? t.calendar.nextMonth : t.calendar.nextWeek}>
          <ChevronRight className="size-4" />
        </Link>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setRulesOpen(true)} aria-label={t.calendar.manageRules}>
            <Repeat className="size-4" />
            <span className="hidden sm:inline">{t.calendar.rules}</span>
          </Button>
          <Button variant="primary" onClick={() => setPlanOpen(true)}>
            <CalendarPlus className="size-4" />
            <span className="hidden sm:inline">{t.calendar.plan}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden p-2 sm:p-3">
          <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-subtle">
            {weekdayHeader.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid gap-1">
            {weeks.map((week) => (
              <div key={week[0]} className="grid grid-cols-7 gap-1">
                {week.map((d) => {
                  const info = byDay.get(d) ?? { entries: [], workouts: [] };
                  const completed = info.workouts.filter((w) => w.status === "completed").length;
                  const state = dayState(d, today, info.entries, completed);
                  const outside = view === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
                  const isSel = d === selected;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelected(d)}
                      aria-pressed={isSel}
                      aria-label={`${formatDay(d, "long")}: ${stateLabel(t)[state]}`}
                      className={cn(
                        "flex flex-col items-stretch rounded-md border p-1 text-left transition-colors",
                        view === "month" ? "min-h-14 sm:min-h-24" : "min-h-28 sm:min-h-40",
                        isSel ? "border-accent/60 bg-accent-softer" : "border-transparent hover:bg-surface-2",
                        outside && "opacity-40",
                      )}
                    >
                      <span
                        className={cn(
                          "tabular mx-auto grid size-7 place-items-center rounded-full text-sm sm:mx-0",
                          d === today ? "bg-text font-semibold text-bg" : "text-muted",
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                      {/* Mobile: compact markers */}
                      <span className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden>
                        <DayDot state={state} />
                      </span>
                      {/* Larger screens: chips */}
                      <span className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
                        {info.workouts.map((w) => (
                          <span key={w.id} className={cn("truncate rounded-sm px-1.5 py-0.5 text-[11px] font-medium", STATUS_STYLE.completed)}>
                            {w.name}
                          </span>
                        ))}
                        {info.entries
                          .filter((e) => e.status !== "completed" || !info.workouts.some((w) => w.plannedEntryId === e.id))
                          .map((e) => {
                            const st = displayStatus(e, today);
                            return (
                              <span key={e.id} className={cn("truncate rounded-sm px-1.5 py-0.5 text-[11px] font-medium", STATUS_STYLE[st])}>
                                {e.kind === "rest" ? t.calendar.restDay : e.title}
                              </span>
                            );
                          })}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <Legend />
        </Card>

        <DayPanel
          date={selected}
          today={today}
          entries={day.entries}
          workouts={day.workouts}
          templates={templates}
          onPlan={() => setPlanOpen(true)}
        />
      </div>

      <PlanDialog open={planOpen} onOpenChange={setPlanOpen} date={selected} templates={templates} />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={rules} templates={templates} />
    </div>
  );
}

const stateLabel = (t: Dict): Record<ReturnType<typeof dayState>, string> => ({
  trained: t.calendar.stateTrained,
  planned: t.calendar.statePlanned,
  missed: t.calendar.stateMissed,
  rest: t.calendar.stateRest,
  empty: t.calendar.stateEmpty,
});

function DayDot({ state }: { state: ReturnType<typeof dayState> }) {
  if (state === "empty") return <span className="size-1.5" />;
  const cls = {
    trained: "bg-accent",
    planned: "border border-accent",
    missed: "border border-warning",
    rest: "bg-muted/50",
  }[state];
  return <span className={cn("size-1.5 rounded-full", cls)} />;
}

function Legend() {
  const t = useT();
  const items: [string, string][] = [
    ["bg-accent", t.calendar.legendDone],
    ["border border-accent", t.calendar.legendPlanned],
    ["border border-info", t.calendar.legendMoved],
    ["border border-warning", t.calendar.legendMissed],
    ["bg-surface-3", t.calendar.legendRest],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function DayPanel({
  date,
  today,
  entries,
  workouts,
  templates,
  onPlan,
}: {
  date: YMD;
  today: YMD;
  entries: CalendarEntry[];
  workouts: CalWorkout[];
  templates: { id: string; name: string }[];
  onPlan: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const { start, pending } = useStartWorkout();
  const [moveId, setMoveId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<CalendarEntry | null>(null);
  const hasRest = entries.some((e) => e.kind === "rest");
  const linkedEntries = new Set(workouts.map((w) => w.plannedEntryId).filter(Boolean));
  const visibleEntries = entries.filter((e) => !(e.status === "completed" && linkedEntries.has(e.id)));

  async function setStatus(e: CalendarEntry, status: "planned" | "skipped" | "cancelled", message: string) {
    const res = await setEntryStatusAction(e.id, status);
    if (!res.ok) return void toast.error(res.error);
    const { id, previous } = res.data;
    toast(message, {
      action:
        previous !== "cancelled"
          ? {
              label: t.common.undoAction,
              onClick: async () => {
                const r = await restoreEntryStatusAction(id, previous as "planned" | "skipped" | "completed");
                if (r.ok) router.refresh();
                else toast.error(r.error);
              },
            }
          : undefined,
    });
    router.refresh();
  }

  async function markRest() {
    const res = await planEntryAction({ date, kind: "rest" });
    if (!res.ok) return void toast.error(res.error);
    toast.success(t.calendar.restAdded);
    router.refresh();
  }

  return (
    <Card className="h-fit p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{formatDay(date, "long")}</h2>
        {date === today ? <Badge tone="accent">{t.common.today}</Badge> : null}
      </div>
      <div className="space-y-2">
        {workouts.map((w) => (
          <Link
            key={w.id}
            href={w.status === "active" ? "/workout" : `/history/${w.id}`}
            className="flex items-center gap-3 rounded-md border border-accent/30 bg-accent-softer px-3 py-2.5 hover:bg-accent-soft"
          >
            <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
              {w.status === "active" ? <Play className="size-4 fill-current" /> : <Check className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{w.name}</span>
              <span className="text-xs text-muted">{w.status === "active" ? t.calendar.running : t.calendar.doneViewResults}</span>
            </span>
            <ChevronRight className="size-4 text-subtle" />
          </Link>
        ))}
        {visibleEntries.map((e) => {
          const st = displayStatus(e, today);
          return (
            <div key={e.id} className="rounded-md border border-border bg-surface-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", e.kind === "rest" ? "bg-surface-3 text-muted" : "bg-accent-soft text-accent")}>
                  {e.kind === "rest" ? <BedDouble className="size-4" /> : <CalendarClock className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", st === "skipped" && "text-muted line-through")}>{e.kind === "rest" ? t.calendar.restDay : e.title}</p>
                  <p className="text-xs text-muted">
                    {t.calendarStatus[st]}
                    {e.movedFrom ? fmt(t.calendar.originally, { date: formatDay(e.movedFrom, "dayMonth") }) : ""}
                    {e.ruleId ? t.calendar.recurring : ""}
                  </p>
                </div>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t.calendar.actions}>
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    {e.kind === "workout" ? (
                      <>
                        <DropdownItem icon={Pencil} onSelect={() => setEditEntry(e)}>
                          {t.common.edit}
                        </DropdownItem>
                        <DropdownItem icon={CalendarClock} onSelect={() => setMoveId(e.id)}>
                          {t.calendar.move}
                        </DropdownItem>
                        {e.status === "skipped" ? (
                          <DropdownItem icon={RotateCcw} onSelect={() => setStatus(e, "planned", t.calendar.replanned)}>
                            {t.calendar.replan}
                          </DropdownItem>
                        ) : (
                          <DropdownItem icon={X} onSelect={() => setStatus(e, "skipped", t.calendar.markedSkipped)}>
                            {t.calendar.markSkipped}
                          </DropdownItem>
                        )}
                        <DropdownSeparator />
                      </>
                    ) : null}
                    <DropdownItem icon={Trash2} destructive onSelect={() => setStatus(e, "cancelled", e.kind === "rest" ? t.calendar.restRemoved : t.calendar.planRemoved)}>
                      {t.common.remove}
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </div>
              {e.notes ? <p className="mt-2 text-sm text-muted">{e.notes}</p> : null}
              {e.kind === "workout" && e.status === "planned" ? (
                <Button variant="primary" size="sm" className="mt-2.5 w-full" loading={pending === e.id} onClick={() => start({ plannedEntryId: e.id }, e.id)}>
                  {pending !== e.id ? <Play className="size-3.5 fill-current" /> : null}
                  {t.shell.startWorkout}
                </Button>
              ) : null}
            </div>
          );
        })}
        {workouts.length === 0 && visibleEntries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted">{t.calendar.nothingPlanned}</p>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onPlan}>
          <CalendarPlus className="size-4" /> {t.calendar.planWorkout}
        </Button>
        <Button size="sm" onClick={markRest} disabled={hasRest}>
          <BedDouble className="size-4" /> {t.calendar.restDay}
        </Button>
      </div>
      <MoveDialog id={moveId} onClose={() => setMoveId(null)} initialDate={date} />
      <EditEntryDialog entry={editEntry} onClose={() => setEditEntry(null)} templates={templates} />
    </Card>
  );
}

function MoveDialog({ id, onClose, initialDate }: { id: string | null; onClose: () => void; initialDate: YMD }) {
  const router = useRouter();
  const t = useT();
  const [date, setDate] = useState(initialDate);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.calendar.moveTitle}
        size="sm"
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!id) return;
              setBusy(true);
              const res = await moveEntryAction(id, date);
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              toast.success(fmt(t.calendar.movedTo, { date: formatDay(date, "medium") }));
              onClose();
              router.refresh();
            }}
          >
            {t.calendar.move}
          </Button>
        }
      >
        <Field label={t.calendar.newDate} htmlFor="move-date">
          <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 7].map((n) => (
            <Button key={n} size="sm" variant="ghost" onClick={() => setDate(addDays(initialDate, n))}>
              {plural(t.calendar.plusDays, n)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryDialog({ entry, onClose, templates }: { entry: CalendarEntry | null; onClose: () => void; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useT();
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setTemplateId(entry.templateId ?? "");
    setTitle(entry.title);
    setNotes(entry.notes ?? "");
  }
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.calendar.editPlanned}
        size="sm"
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              if (!entry) return;
              const res = await updateEntryAction(entry.id, { templateId: templateId || null, title, notes: notes || null });
              if (!res.ok) return void toast.error(res.error);
              onClose();
              router.refresh();
            }}
          >
            {t.common.save}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label={t.calendar.template} htmlFor="ee-tpl">
            <Select
              id="ee-tpl"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const tpl = templates.find((x) => x.id === e.target.value);
                if (tpl) setTitle(tpl.name);
              }}
            >
              <option value="">{t.calendar.noTemplate}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.calendar.entryTitle} htmlFor="ee-title">
            <Input id="ee-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <Field label={t.common.note} htmlFor="ee-notes">
            <Textarea id="ee-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ open, onOpenChange, date, templates }: { open: boolean; onOpenChange: (v: boolean) => void; date: YMD; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useT();
  const [kind, setKind] = useState<"workout" | "rest">("workout");
  const [d, setD] = useState(date);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setD(date);
      setWeekdays([isoWeekday(date)]);
      setRepeat(false);
      setEndDate("");
      setNotes("");
      setTitle("");
    }
  }

  async function submit() {
    setBusy(true);
    const tpl = templates.find((x) => x.id === templateId);
    const res = repeat
      ? await createRuleAction({ kind, templateId: kind === "workout" ? templateId || null : null, title: title || tpl?.name || null, weekdays, startDate: d, endDate: endDate || null })
      : await planEntryAction({ date: d, kind, templateId: kind === "workout" ? templateId || null : null, title: title || tpl?.name || null, notes: notes || null });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(repeat ? t.calendar.ruleCreated : kind === "rest" ? t.calendar.restAdded : t.calendar.planned);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t.calendar.plan}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" loading={busy} onClick={submit} disabled={(kind === "workout" && !templateId && !title.trim()) || (repeat && weekdays.length === 0)}>
              {repeat ? t.calendar.createRule : t.calendar.add}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            aria-label={t.calendar.kind}
            className="flex w-full"
            value={kind}
            onChange={setKind}
            options={[
              { value: "workout", label: t.calendar.workout },
              { value: "rest", label: t.calendar.restDay },
            ]}
          />
          <Field label={repeat ? t.calendar.from : t.calendar.date} htmlFor="plan-date">
            <Input id="plan-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </Field>
          {kind === "workout" ? (
            <>
              <Field label={t.calendar.template} htmlFor="plan-tpl" hint={templates.length === 0 ? t.calendar.noTemplatesHint : undefined}>
                <Select id="plan-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">{t.calendar.noTemplate}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.calendar.titleOptional} htmlFor="plan-title">
                <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={templates.find((x) => x.id === templateId)?.name ?? t.calendar.titlePlaceholder} maxLength={120} />
              </Field>
            </>
          ) : null}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            {t.calendar.repeatWeekly}
          </label>
          {repeat ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.calendar.weekdays}>
                {weekdayNames().map((w, i) => {
                  const n = i + 1;
                  const on = weekdays.includes(n);
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== n) : [...weekdays, n])}
                      className={cn("size-10 rounded-full border text-sm font-medium", on ? "border-accent bg-accent text-accent-ink" : "border-border text-muted")}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
              <Field label={t.calendar.endsOptional} htmlFor="plan-end">
                <Input id="plan-end" type="date" value={endDate} min={d} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
          ) : kind === "workout" ? (
            <Field label={t.calendar.noteOptional} htmlFor="plan-notes">
              <Textarea id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RulesDialog({ open, onOpenChange, rules, templates }: { open: boolean; onOpenChange: (v: boolean) => void; rules: CalRule[]; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useT();
  void templates;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.calendar.rulesTitle} description={t.calendar.rulesText} size="md">
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t.calendar.noRules}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", r.kind === "rest" ? "bg-surface-3 text-muted" : "bg-accent-soft text-accent")}>
                  {r.kind === "rest" ? <BedDouble className="size-4" /> : <Repeat className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted">
                    {fmt(t.calendar.ruleRange, { days: weekdaysLabel(r.weekdays), from: formatDay(r.startDate, "short") })}
                    {r.endDate ? fmt(t.calendar.ruleUntil, { date: formatDay(r.endDate, "short") }) : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    const res = await endRuleAction(r.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success(t.calendar.ruleEnded);
                    router.refresh();
                  }}
                >
                  {t.calendar.endRule}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
