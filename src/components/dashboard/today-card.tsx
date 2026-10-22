"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BedDouble, CalendarCheck, Check, ChevronRight, Play, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StartWorkoutButton } from "@/components/shell/start-workout-button";
import { useStartWorkout } from "@/components/shell/use-start-workout";
import { planEntryAction, setEntryStatusAction } from "@/server/actions/calendar";
import type { YMD } from "@/lib/dates";
import { useT } from "@/components/i18n-provider";

export interface TodayInfo {
  date: YMD;
  planned: { id: string; title: string }[];
  rest: { id: string } | null;
  done: { id: string; name: string }[];
  active: { id: string; name: string } | null;
}

export function TodayCard({ info }: { info: TodayInfo }) {
  const router = useRouter();
  const { start, pending } = useStartWorkout();
  const t = useT();

  async function markRest() {
    const res = await planEntryAction({ date: info.date, kind: "rest" });
    if (!res.ok) return void toast.error(res.error);
    toast.success(t.dashboard.restToast);
    router.refresh();
  }
  async function undoRest() {
    if (!info.rest) return;
    const res = await setEntryStatusAction(info.rest.id, "cancelled");
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-subtle">{t.common.today}</p>
      {info.active ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold tracking-tight">{info.active.name}</p>
            <p className="text-sm text-accent">{t.shell.workoutRunning}</p>
          </div>
          <Link href="/workout" className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">
            <Play className="size-4 fill-current" /> {t.shell.resume}
          </Link>
        </div>
      ) : info.planned.length ? (
        <div className="mt-2 space-y-3">
          {info.planned.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
                <CalendarCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-semibold tracking-tight">{p.title}</p>
                <p className="text-sm text-muted">{t.dashboard.plannedWorkout}</p>
              </div>
              <Button variant="primary" loading={pending === p.id} onClick={() => start({ plannedEntryId: p.id }, p.id)}>
                {pending !== p.id ? <Play className="size-4 fill-current" /> : null}
                {t.shell.startWorkout}
              </Button>
            </div>
          ))}
        </div>
      ) : info.rest ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-surface-3 text-muted">
            <BedDouble className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold tracking-tight">{t.dashboard.restDay}</p>
            <p className="text-sm text-muted">{t.dashboard.restHint}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={undoRest}>
            <Undo2 className="size-4" /> {t.dashboard.undo}
          </Button>
        </div>
      ) : info.done.length ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold tracking-tight">{info.done.map((d) => d.name).join(", ")}</p>
            <p className="text-sm text-muted">{t.dashboard.doneToday}</p>
          </div>
          <Link href={`/history/${info.done[0].id}`} className="grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label={t.dashboard.viewWorkout}>
            <ChevronRight className="size-5" />
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xl font-semibold tracking-tight">{t.dashboard.nothingPlanned}</p>
          <p className="text-sm text-muted">{t.dashboard.nothingPlannedHint}</p>
        </div>
      )}
      {!info.active ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <StartWorkoutButton label={info.planned.length ? t.dashboard.otherWorkout : t.shell.startWorkout} variant={info.planned.length ? "secondary" : "primary"} />
          {!info.rest && !info.planned.length && !info.done.length ? (
            <Button variant="secondary" onClick={markRest}>
              <BedDouble className="size-4" /> {t.dashboard.markRest}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
