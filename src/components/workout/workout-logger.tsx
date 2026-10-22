"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Cloud,
  CloudOff,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { CatalogExercise } from "@/lib/exercise-search";
import { buildPrefillSets, computeLoad, workoutTotals, type LoadMode, type SetType } from "@/lib/training";
import { formatClock, formatVolume, unitToKg, type WeightUnit } from "@/lib/format";
import { loggerReducer, parseDecimal, type LoggerState, type LSet } from "@/lib/workout-reducer";
import { discardWorkoutAction, finishWorkoutAction, getPrefillAction, restoreWorkoutAction } from "@/server/actions/workouts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Elapsed } from "@/components/elapsed";
import { ExercisePicker } from "@/components/exercises/exercise-picker";
import { exerciseSubtitle, useReferenceMaps, type Reference } from "@/components/exercises/use-exercise-search";
import { ExerciseCard } from "./exercise-card";
import { RestTimerBar } from "./rest-timer-bar";
import { restTimer } from "./rest-timer-store";
import { clearDraft, readDraft, useWorkoutSync, type SyncStatus } from "./use-workout-sync";
import { uuid } from "@/lib/uuid";
import { fmt, plural } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

export interface LoggerSettings {
  unit: WeightUnit;
  effortMetric: "none" | "rir" | "rpe";
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  restTimerSound: boolean;
  keepScreenAwake: boolean;
  bodyweightInVolume: boolean;
}

export function WorkoutLogger({
  initial,
  catalog,
  reference,
  recentIds,
  settings,
}: {
  initial: LoggerState;
  catalog: CatalogExercise[];
  reference: Reference;
  recentIds: string[];
  settings: LoggerSettings;
}) {
  const router = useRouter();
  const t = useT();
  const [state, dispatch] = useReducer(loggerReducer, initial);
  const editMode = state.status === "completed";
  const maps = useReferenceMaps(reference);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const onSynced = useCallback((rev: number) => dispatch({ type: "synced", serverRevision: rev }), []);
  const sync = useWorkoutSync(state, onSynced);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<{ exId: string; setId: string } | null>(null);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [removeExId, setRemoveExId] = useState<string | null>(null);

  // Restore unsynced local changes (e.g. browser closed while offline).
  useEffect(() => {
    const draft = readDraft(initial.workoutId);
    if (draft && draft.workoutId === initial.workoutId && draft.revision > initial.baseRevision && draft.status === initial.status) {
      dispatch({ type: "replaceState", state: { ...draft, baseRevision: initial.baseRevision } });
      toast(t.workout.draftRestored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen on during training (if supported and enabled).
  useEffect(() => {
    if (editMode || !settings.keepScreenAwake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        /* denied or unsupported */
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [editMode, settings.keepScreenAwake]);

  // Stable callbacks for memoized children.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const onUpdateSet = useCallback((exId: string, setId: string, patch: Partial<LSet>) => dispatch({ type: "updateSet", exId, setId, patch }), []);
  const onToggleSet = useCallback(
    (exId: string, setId: string) => {
      const ex = stateRef.current.exercises.find((e) => e.id === exId);
      const set = ex?.sets.find((s) => s.id === setId);
      dispatch({ type: "toggleSet", exId, setId, at: new Date().toISOString() });
      if (!editMode && ex && set && !set.completed && settings.autoStartRestTimer) {
        const meta = byId.get(ex.exerciseId);
        restTimer.start(ex.restSeconds ?? meta?.restSeconds ?? settings.defaultRestSeconds, meta?.name ?? null);
      }
    },
    [byId, editMode, settings.autoStartRestTimer, settings.defaultRestSeconds],
  );
  const onRemoveSet = useCallback((exId: string, setId: string) => dispatch({ type: "removeSet", exId, setId }), []);
  const onAddSet = useCallback((exId: string) => dispatch({ type: "addSet", exId, id: uuid() }), []);
  const onMove = useCallback((exId: string, dir: -1 | 1) => dispatch({ type: "moveExercise", exId, dir }), []);
  const onNotes = useCallback((exId: string, notes: string) => dispatch({ type: "setExerciseNotes", exId, notes }), []);
  const onSetDetails = useCallback((exId: string, setId: string) => setDetailsFor({ exId, setId }), []);
  const onRemoveEx = useCallback((exId: string) => setRemoveExId(exId), []);
  const onReplace = useCallback((exId: string) => setReplaceId(exId), []);
  const onRest = useCallback((exId: string) => setRestFor(exId), []);

  async function buildExercises(exerciseIds: string[]) {
    const res = await getPrefillAction(exerciseIds, state.workoutId).catch(() => null);
    const prefill = res && res.ok ? res.data : {};
    if (!res || !res.ok) toast(t.workout.offlineNoPrefill);
    return exerciseIds.map((exerciseId) => {
      const meta = byId.get(exerciseId);
      const src = prefill[exerciseId];
      const sets = buildPrefillSets(src?.sets ?? null, { targetSets: src ? null : 3, repMin: meta?.tracking === "reps" ? meta?.repMin : null });
      return {
        id: uuid(),
        exerciseId,
        meta: {
          tracking: meta?.tracking ?? "reps",
          loadMode: (meta?.loadMode ?? "external") as LoadMode,
          bodyweightFactor: meta?.bodyweightFactor ?? 1,
          restSeconds: meta?.restSeconds ?? null,
        },
        previous: src ? { date: src.date, sets: src.sets.map((s) => ({ setType: s.setType, weightKg: s.weightKg, reps: s.reps, durationSeconds: s.durationSeconds })) } : null,
        sets: sets.map(
          (s): LSet => ({
            id: uuid(),
            setType: s.setType as SetType,
            weightKg: s.weightKg,
            reps: s.reps,
            durationSeconds: s.durationSeconds,
            rir: null,
            rpe: null,
            note: null,
            completed: false,
            completedAt: null,
          }),
        ),
      };
    });
  }

  async function addExercises(ids: string[]) {
    const items = await buildExercises(ids);
    dispatch({ type: "addExercises", items });
    setTimeout(() => document.getElementById(`ex-${items[0]?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }

  async function replaceExercise(exId: string, exerciseId: string) {
    const [item] = await buildExercises([exerciseId]);
    dispatch({ type: "replaceExercise", exId, exerciseId, meta: item.meta, previous: item.previous, sets: item.sets });
  }

  const totals = useMemo(
    () =>
      workoutTotals(
        state.exercises.map((e) => ({
          tracking: e.tracking,
          loadMode: e.loadMode,
          bodyweightInVolume: settings.bodyweightInVolume,
          sets: e.sets.map((s) => ({
            ...s,
            loadKg: computeLoad({ loadMode: e.loadMode, bodyweightFactor: e.bodyweightFactor, bodyweightKg: state.bodyweightKg, weightKg: s.weightKg }),
          })),
        })),
      ),
    [state.exercises, state.bodyweightKg, settings.bodyweightInVolume],
  );
  const progress = totals.totalSets ? totals.completedSets / totals.totalSets : 0;
  const needsBodyweight = state.bodyweightKg == null && state.exercises.some((e) => e.loadMode.startsWith("bodyweight"));

  async function finish(notes: string, incomplete: "discard" | "complete") {
    await sync.flush();
    if (sync.isDirty()) {
      toast.error(t.workout.notAllSaved);
      return false;
    }
    const res = await finishWorkoutAction(state.workoutId, { notes: notes || null, incomplete });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    clearDraft(state.workoutId);
    restTimer.stop();
    router.replace(`/history/${state.workoutId}?finished=1`);
    router.refresh();
    return true;
  }

  async function doneEditing() {
    await sync.flush();
    if (sync.isDirty()) {
      toast.error(t.workout.editNotSaved);
      return;
    }
    clearDraft(state.workoutId);
    router.push(`/history/${state.workoutId}`);
    router.refresh();
  }

  async function discard() {
    const res = await discardWorkoutAction(state.workoutId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    clearDraft(state.workoutId);
    restTimer.stop();
    const id = state.workoutId;
    toast(t.workout.discarded, {
      duration: 8000,
      action: {
        label: t.common.undoAction,
        onClick: async () => {
          const r = await restoreWorkoutAction(id);
          if (r.ok) {
            router.push("/workout");
            router.refresh();
          } else toast.error(r.error);
        },
      },
    });
    router.replace("/");
    router.refresh();
  }

  const detailsEx = detailsFor ? state.exercises.find((e) => e.id === detailsFor.exId) : null;
  const detailsSet = detailsEx?.sets.find((s) => s.id === detailsFor?.setId) ?? null;
  const restEx = restFor ? state.exercises.find((e) => e.id === restFor) : null;
  const removeEx = removeExId ? state.exercises.find((e) => e.id === removeExId) : null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Sticky header */}
      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 mb-4 border-b border-border bg-bg/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:pt-4">
        <div className="flex items-center gap-2">
          <Link href={editMode ? `/history/${state.workoutId}` : "/"} className="-ml-2 grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text" aria-label={t.common.back}>
            <ChevronLeft className="size-5" />
          </Link>
          <button type="button" onClick={() => setRenameOpen(true)} className="min-w-0 flex-1 text-left" aria-label={t.workout.rename}>
            <span className="block truncate text-[17px] font-semibold tracking-tight">{state.name}</span>
            <span className="flex items-center gap-2 text-sm text-muted">
              {editMode ? (
                <span>{t.workout.editing}</span>
              ) : (
                <Elapsed className={cn("tabular", state.pausedAt ? "text-warning" : "text-accent")} startedAt={state.startedAt} pausedAt={state.pausedAt} pausedSeconds={state.pausedSeconds} />
              )}
              {state.pausedAt ? <span className="text-warning">{t.workout.paused}</span> : null}
              <SyncBadge status={sync.status} />
            </span>
          </button>
          {!editMode ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={state.pausedAt ? t.workout.resume : t.workout.pause}
              onClick={() => dispatch(state.pausedAt ? { type: "resume", at: new Date().toISOString() } : { type: "pause", at: new Date().toISOString() })}
            >
              {state.pausedAt ? <Play className="size-5" /> : <Pause className="size-5" />}
            </Button>
          ) : null}
          {editMode ? (
            <Button variant="primary" onClick={doneEditing}>
              {t.common.done}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setFinishOpen(true)}>
              {t.workout.finish}
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t.common.progress}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="tabular whitespace-nowrap">
            {fmt(t.workout.setsProgress, { done: totals.completedSets, total: totals.totalSets })} · {formatVolume(totals.volumeKg, settings.unit)}
          </span>
        </div>
      </div>

      {sync.status === "conflict" ? (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="size-4" /> {t.workout.conflictTitle}
          </p>
          <p className="mt-1 text-muted">{t.workout.conflictText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { clearDraft(state.workoutId); window.location.reload(); }}>
              <RefreshCw className="size-4" /> {t.workout.loadServer}
            </Button>
            <Button size="sm" variant="outline" onClick={() => sync.resolveConflictKeepMine()}>
              {t.workout.keepMine}
            </Button>
          </div>
        </div>
      ) : null}

      {needsBodyweight ? <BodyweightPrompt unit={settings.unit} onSave={(kg) => dispatch({ type: "setBodyweight", kg })} /> : null}

      <div className="space-y-3">
        {state.exercises.map((ex, i) => {
          const meta = byId.get(ex.exerciseId);
          return (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              index={i}
              count={state.exercises.length}
              meta={meta}
              subtitle={meta ? exerciseSubtitle(meta, maps) : ""}
              unit={settings.unit}
              effortMetric={settings.effortMetric}
              bodyweightKg={state.bodyweightKg}
              defaultRest={settings.defaultRestSeconds}
              onUpdateSet={onUpdateSet}
              onToggleSet={onToggleSet}
              onRemoveSet={onRemoveSet}
              onSetDetails={onSetDetails}
              onAddSet={onAddSet}
              onMove={onMove}
              onRemove={onRemoveEx}
              onReplace={onReplace}
              onNotes={onNotes}
              onRest={onRest}
            />
          );
        })}
      </div>

      {state.exercises.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="font-medium">{t.workout.noExercises}</p>
          <p className="mt-1 text-sm text-muted">{t.workout.noExercisesHint}</p>
        </div>
      ) : null}

      <Button variant="soft" size="lg" className="mt-4 w-full" onClick={() => setPickerOpen(true)}>
        <Plus className="size-5" aria-hidden />
        {t.workout.addExercise}
      </Button>

      <div className="mt-6 space-y-1.5">
        <label htmlFor="workout-notes" className="text-sm font-medium text-muted">
          {t.workout.notes}
        </label>
        <Textarea
          id="workout-notes"
          defaultValue={state.notes ?? ""}
          key={`notes-${state.workoutId}-${state.notes === null}`}
          onBlur={(e) => e.target.value !== (state.notes ?? "") && dispatch({ type: "setNotes", notes: e.target.value })}
          placeholder={t.workout.notesPlaceholder}
          rows={3}
        />
      </div>

      {!editMode ? (
        <div className="mt-8 flex justify-center">
          <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setDiscardOpen(true)}>
            <Trash2 className="size-4" aria-hidden />
            {t.workout.discard}
          </Button>
        </div>
      ) : null}

      {!editMode ? <RestTimerBar sound={settings.restTimerSound} defaultSeconds={settings.defaultRestSeconds} /> : null}

      <ExercisePicker open={pickerOpen} onOpenChange={setPickerOpen} catalog={catalog} reference={reference} recentIds={recentIds} onConfirm={addExercises} />
      <ExercisePicker
        open={replaceId !== null}
        onOpenChange={(o) => !o && setReplaceId(null)}
        catalog={catalog}
        reference={reference}
        recentIds={recentIds}
        multiple={false}
        title={t.workout.replaceExercise}
        onConfirm={([id]) => replaceId && void replaceExercise(replaceId, id)}
      />

      <SetDetailsDialog
        key={detailsFor ? detailsFor.setId : "none"}
        open={!!detailsSet}
        set={detailsSet}
        effortMetric={settings.effortMetric}
        onClose={() => setDetailsFor(null)}
        onSave={(patch) => detailsFor && onUpdateSet(detailsFor.exId, detailsFor.setId, patch)}
      />

      <RestDialog
        open={!!restEx}
        current={restEx ? (restEx.restSeconds ?? byId.get(restEx.exerciseId)?.restSeconds ?? settings.defaultRestSeconds) : settings.defaultRestSeconds}
        onClose={() => setRestFor(null)}
        onSave={(sec) => restFor && dispatch({ type: "setExerciseRest", exId: restFor, seconds: sec })}
      />

      <RenameDialog key={renameOpen ? "rename-open" : "rename-closed"} open={renameOpen} name={state.name} onClose={() => setRenameOpen(false)} onSave={(name) => dispatch({ type: "setName", name })} />

      <FinishDialog
        key={finishOpen ? "finish-open" : "finish-closed"}
        open={finishOpen}
        onOpenChange={setFinishOpen}
        totals={totals}
        unit={settings.unit}
        notes={state.notes ?? ""}
        onFinish={finish}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        destructive
        title={t.workout.discardTitle}
        description={t.workout.discardText}
        confirmLabel={t.workout.discardConfirm}
        onConfirm={discard}
      />

      <ConfirmDialog
        open={!!removeEx}
        onOpenChange={(o) => !o && setRemoveExId(null)}
        destructive
        title={t.workout.removeExerciseTitle}
        description={removeEx ? plural(t.workout.removeExerciseText, removeEx.sets.length, { name: byId.get(removeEx.exerciseId)?.name ?? t.common.exercise }) : undefined}
        confirmLabel={t.common.remove}
        onConfirm={() => {
          if (removeExId) dispatch({ type: "removeExercise", exId: removeExId });
        }}
      />
    </div>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const t = useT();
  const map: Record<SyncStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    saved: { icon: <Check className="size-3.5" />, label: t.workout.syncSaved, cls: "text-subtle" },
    pending: { icon: <Cloud className="size-3.5" />, label: t.workout.syncPending, cls: "text-subtle" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, label: t.workout.syncSaving, cls: "text-subtle" },
    offline: { icon: <CloudOff className="size-3.5" />, label: t.workout.syncOffline, cls: "text-warning" },
    conflict: { icon: <AlertTriangle className="size-3.5" />, label: t.workout.syncConflict, cls: "text-warning" },
    error: { icon: <AlertTriangle className="size-3.5" />, label: t.workout.syncError, cls: "text-danger" },
  };
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", m.cls)} role="status" aria-live="polite">
      {m.icon}
      <span className={status === "saved" || status === "pending" || status === "saving" ? "sr-only sm:not-sr-only" : ""}>{m.label}</span>
    </span>
  );
}

function BodyweightPrompt({ unit, onSave }: { unit: WeightUnit; onSave: (kg: number) => void }) {
  const [value, setValue] = useState("");
  const t = useT();
  const parsed = parseDecimal(value);
  return (
    <div className="mb-4 rounded-lg border border-info/30 bg-info-soft p-3">
      <p className="text-sm font-medium text-info">{t.workout.bodyweightMissing}</p>
      <p className="mt-0.5 text-sm text-muted">{t.workout.bodyweightMissingText}</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typeof parsed === "number" && parsed > 0) onSave(unitToKg(parsed, unit));
        }}
      >
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={fmt(t.workout.weightIn, { unit })} aria-label={t.workout.bodyweight} className="max-w-40" />
        <Button type="submit" disabled={typeof parsed !== "number" || parsed <= 0}>
          {t.common.apply}
        </Button>
      </form>
    </div>
  );
}

function SetDetailsDialog({
  open,
  set,
  effortMetric,
  onClose,
  onSave,
}: {
  open: boolean;
  set: LSet | null;
  effortMetric: "none" | "rir" | "rpe";
  onClose: () => void;
  onSave: (patch: Partial<LSet>) => void;
}) {
  const [rir, setRir] = useState(set?.rir?.toString().replace(".", ",") ?? "");
  const [rpe, setRpe] = useState(set?.rpe?.toString().replace(".", ",") ?? "");
  const [note, setNote] = useState(set?.note ?? "");
  const t = useT();
  const rirV = parseDecimal(rir);
  const rpeV = parseDecimal(rpe);
  const valid = rirV !== undefined && rpeV !== undefined && (rirV == null || rirV <= 10) && (rpeV == null || (rpeV >= 1 && rpeV <= 10));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.workout.setDetails}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              disabled={!valid}
              onClick={() => {
                onSave({ rir: rirV ?? null, rpe: rpeV ?? null, note: note.trim() || null });
                onClose();
              }}
            >
              {t.common.apply}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="RIR" htmlFor="d-rir" hint={t.workout.rirHint}>
              <Input id="d-rir" inputMode="decimal" value={rir} onChange={(e) => setRir(e.target.value)} aria-invalid={rirV === undefined || (rirV != null && rirV > 10)} />
            </Field>
            <Field label="RPE" htmlFor="d-rpe" hint={t.workout.rpeHint}>
              <Input id="d-rpe" inputMode="decimal" value={rpe} onChange={(e) => setRpe(e.target.value)} aria-invalid={rpeV === undefined || (rpeV != null && (rpeV < 1 || rpeV > 10))} />
            </Field>
          </div>
          {effortMetric === "none" ? <p className="text-xs text-subtle">{t.workout.effortHidden}</p> : null}
          <Field label={t.common.note} htmlFor="d-note">
            <Textarea id="d-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RestDialog({ open, current, onClose, onSave }: { open: boolean; current: number; onClose: () => void; onSave: (s: number | null) => void }) {
  const options = [30, 45, 60, 90, 120, 150, 180, 240, 300];
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.workout.restForExercise} size="sm">
        <div className="grid grid-cols-3 gap-2">
          {options.map((o) => (
            <Button
              key={o}
              variant={o === current ? "soft" : "secondary"}
              className="tabular"
              onClick={() => {
                onSave(o);
                onClose();
              }}
            >
              {formatClock(o)}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => {
            onSave(null);
            onClose();
          }}
        >
          {t.common.useDefault}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ open, name, onClose, onSave }: { open: boolean; name: string; onClose: () => void; onSave: (n: string) => void }) {
  const [value, setValue] = useState(name);
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.workout.rename}
        size="sm"
        footer={
          <Button
            variant="primary"
            disabled={!value.trim()}
            onClick={() => {
              onSave(value.trim().slice(0, 120));
              onClose();
            }}
          >
            {t.common.save}
          </Button>
        }
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label={t.common.name} maxLength={120} autoFocus />
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({
  open,
  onOpenChange,
  totals,
  unit,
  notes,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totals: ReturnType<typeof workoutTotals>;
  unit: WeightUnit;
  notes: string;
  onFinish: (notes: string, incomplete: "discard" | "complete") => Promise<boolean>;
}) {
  const [text, setText] = useState(notes);
  const [policy, setPolicy] = useState<"discard" | "complete">("discard");
  const [busy, setBusy] = useState(false);
  const t = useT();
  const open_ = totals.totalSets - totals.completedSets;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={t.workout.finishTitle}
        description={t.workout.finishText}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              {t.workout.keepTraining}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={totals.completedSets === 0 && policy === "discard"}
              onClick={async () => {
                setBusy(true);
                const ok = await onFinish(text, policy);
                setBusy(false);
                if (ok) onOpenChange(false);
              }}
            >
              {t.workout.finishConfirm}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t.nav.exercises} value={String(totals.exercises)} />
          <Stat label={t.dashboard.workingSets} value={String(totals.workingSets)} />
          <Stat label={t.dashboard.volume} value={formatVolume(totals.volumeKg, unit)} />
        </div>
        {open_ > 0 ? (
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {plural(t.workout.openSets, open_)}
            </legend>
            <Radio name="incomplete" checked={policy === "discard"} onChange={() => setPolicy("discard")} label={t.workout.discardOpen} />
            <Radio name="incomplete" checked={policy === "complete"} onChange={() => setPolicy("complete")} label={t.workout.completeOpen} />
          </fieldset>
        ) : null}
        {totals.completedSets === 0 && policy === "discard" ? (
          <p className="mt-3 text-sm text-warning">{t.workout.noneCompleted}</p>
        ) : null}
        <div className="mt-4">
          <Field label={t.workout.notesOptional} htmlFor="finish-notes">
            <Textarea id="finish-notes" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={5000} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-3">
      <p className="tabular text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Radio({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm", checked ? "border-accent/50 bg-accent-softer" : "border-border")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

