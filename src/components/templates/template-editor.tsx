"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Ellipsis, Minus, Plus, Replace, StickyNote, Trash2 } from "lucide-react";
import type { CatalogExercise } from "@/lib/exercise-search";
import { templateInputSchema } from "@/lib/template-schema";
import { saveTemplateAction } from "@/server/actions/templates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ExercisePicker } from "@/components/exercises/exercise-picker";
import { exerciseSubtitle, useReferenceMaps, type Reference } from "@/components/exercises/use-exercise-search";
import { uuid } from "@/lib/uuid";
import { translateMessage } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

export interface EditorItem {
  key: string;
  exerciseId: string;
  targetSets: number;
  repMin: string;
  repMax: string;
  restSeconds: string;
  notes: string;
}

export interface EditorValues {
  name: string;
  description: string;
  notes: string;
  items: EditorItem[];
}

export function TemplateEditor({
  templateId,
  initial,
  catalog,
  reference,
  recentIds,
}: {
  templateId: string | null;
  initial: EditorValues;
  catalog: CatalogExercise[];
  reference: Reference;
  recentIds: string[];
}) {
  const router = useRouter();
  const t = useT();
  const maps = useReferenceMaps(reference);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const [v, setV] = useState<EditorValues>(initial);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceKey, setReplaceKey] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = (fn: (p: EditorValues) => EditorValues) => {
    setV(fn);
    setDirty(true);
  };
  const updateItem = (key: string, patch: Partial<EditorItem>) =>
    update((p) => ({ ...p, items: p.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));
  const move = (key: string, dir: -1 | 1) =>
    update((p) => {
      const i = p.items.findIndex((it) => it.key === key);
      const j = i + dir;
      if (j < 0 || j >= p.items.length) return p;
      const items = [...p.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...p, items };
    });

  function addExercises(ids: string[]) {
    update((p) => ({
      ...p,
      items: [
        ...p.items,
        ...ids.map((exerciseId) => {
          const ex = byId.get(exerciseId);
          return {
            key: uuid(),
            exerciseId,
            targetSets: 3,
            repMin: ex?.repMin?.toString() ?? "",
            repMax: ex?.repMax?.toString() ?? "",
            restSeconds: ex?.restSeconds?.toString() ?? "",
            notes: "",
          };
        }),
      ],
    }));
  }

  function save() {
    const input = {
      name: v.name,
      description: v.description || null,
      notes: v.notes || null,
      items: v.items.map((it) => ({
        exerciseId: it.exerciseId,
        targetSets: it.targetSets,
        repMin: it.repMin,
        repMax: it.repMax,
        restSeconds: it.restSeconds,
        notes: it.notes || null,
      })),
    };
    const parsed = templateInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const idx = typeof issue.path[1] === "number" ? issue.path[1] : null;
      const text = translateMessage(t, issue.message);
      const msg = idx != null ? `${byId.get(v.items[idx].exerciseId)?.name ?? t.common.exercise}: ${text}` : text;
      setErrors(msg);
      toast.error(msg);
      return;
    }
    setErrors(null);
    startTransition(async () => {
      const res = await saveTemplateAction(templateId, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDirty(false);
      toast.success(t.templates.saved);
      router.push("/templates");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4 sm:p-5">
        <Field label={t.common.name} htmlFor="tpl-name">
          <Input id="tpl-name" value={v.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} placeholder={t.templates.namePlaceholder} maxLength={80} />
        </Field>
        <Field label={t.templates.descriptionOptional} htmlFor="tpl-desc">
          <Input id="tpl-desc" value={v.description} onChange={(e) => update((p) => ({ ...p, description: e.target.value }))} maxLength={500} />
        </Field>
        <Field label={t.templates.notesOptional} htmlFor="tpl-notes">
          <Textarea id="tpl-notes" value={v.notes} onChange={(e) => update((p) => ({ ...p, notes: e.target.value }))} rows={2} />
        </Field>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {t.nav.exercises} <span className="text-muted">({v.items.length})</span>
          </h2>
          <Button size="sm" variant="soft" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t.templates.add}
          </Button>
        </div>
        {v.items.length === 0 ? (
          <Card>
            <EmptyState title={t.workout.noExercises} description={t.templates.emptyExercisesText} action={<Button variant="primary" onClick={() => setPickerOpen(true)}><Plus className="size-4" />{t.workout.addExercise}</Button>} />
          </Card>
        ) : null}
        {v.items.map((it, i) => {
          const ex = byId.get(it.exerciseId);
          return (
            <Card key={it.key} className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{ex?.name ?? it.exerciseId}</p>
                  {ex ? <p className="truncate text-sm text-muted">{exerciseSubtitle(ex, maps)}</p> : null}
                </div>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t.templates.actions}>
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem icon={ArrowUp} disabled={i === 0} onSelect={() => move(it.key, -1)}>
                      {t.exerciseCard.moveUp}
                    </DropdownItem>
                    <DropdownItem icon={ArrowDown} disabled={i === v.items.length - 1} onSelect={() => move(it.key, 1)}>
                      {t.exerciseCard.moveDown}
                    </DropdownItem>
                    <DropdownItem icon={Replace} onSelect={() => setReplaceKey(it.key)}>
                      {t.workout.replaceExercise}
                    </DropdownItem>
                    <DropdownItem icon={StickyNote} onSelect={() => setShowNotes((s) => ({ ...s, [it.key]: true }))}>
                      {t.templates.hint}
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem icon={Trash2} destructive onSelect={() => update((p) => ({ ...p, items: p.items.filter((x) => x.key !== it.key) }))}>
                      {t.common.remove}
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </div>
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-[auto_1fr_1fr]">
                <div>
                  <span className="mb-1 block text-xs text-subtle">{t.templates.sets}</span>
                  <div className="flex items-center rounded-md border border-border bg-surface-2">
                    <button type="button" className="grid size-10 place-items-center text-muted hover:text-text disabled:opacity-40" onClick={() => updateItem(it.key, { targetSets: Math.max(1, it.targetSets - 1) })} disabled={it.targetSets <= 1} aria-label={t.templates.setLess}>
                      <Minus className="size-4" />
                    </button>
                    <span className="tabular w-7 text-center font-semibold" aria-live="polite">
                      {it.targetSets}
                    </span>
                    <button type="button" className="grid size-10 place-items-center text-muted hover:text-text disabled:opacity-40" onClick={() => updateItem(it.key, { targetSets: Math.min(20, it.targetSets + 1) })} disabled={it.targetSets >= 20} aria-label={t.templates.setMore}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-subtle">{ex?.tracking === "duration" ? t.templates.targetOptionalReps : t.templates.reps}</span>
                  <div className="flex items-center gap-1.5">
                    <Input aria-label={t.templates.repsMin} inputMode="numeric" className="h-10 text-center" value={it.repMin} onChange={(e) => updateItem(it.key, { repMin: e.target.value.replace(/\D/g, "") })} placeholder="min" />
                    <span className="text-subtle">–</span>
                    <Input aria-label={t.templates.repsMax} inputMode="numeric" className="h-10 text-center" value={it.repMax} onChange={(e) => updateItem(it.key, { repMax: e.target.value.replace(/\D/g, "") })} placeholder="max" />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="mb-1 block text-xs text-subtle">{t.templates.restSec}</span>
                  <Input aria-label={t.templates.restSecLabel} inputMode="numeric" className="h-10" value={it.restSeconds} onChange={(e) => updateItem(it.key, { restSeconds: e.target.value.replace(/\D/g, "") })} placeholder={t.templates.default} />
                </div>
              </div>
              {showNotes[it.key] || it.notes ? (
                <Input aria-label={t.templates.exerciseHint} className="mt-3 h-10" value={it.notes} onChange={(e) => updateItem(it.key, { notes: e.target.value })} placeholder={t.templates.exerciseHintPlaceholder} maxLength={1000} />
              ) : null}
            </Card>
          );
        })}
      </section>

      {errors ? <p className="text-sm text-danger" role="alert">{errors}</p> : null}

      <div className="sticky bottom-24 z-30 flex justify-end gap-2 rounded-lg border border-border bg-surface/95 p-2 backdrop-blur lg:bottom-4">
        <Button variant="ghost" onClick={() => router.back()}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" onClick={save} loading={pending} disabled={!v.name.trim()}>
          {t.templates.save}
        </Button>
      </div>

      <ExercisePicker open={pickerOpen} onOpenChange={setPickerOpen} catalog={catalog} reference={reference} recentIds={recentIds} onConfirm={addExercises} />
      <ExercisePicker
        open={replaceKey !== null}
        onOpenChange={(o) => !o && setReplaceKey(null)}
        catalog={catalog}
        reference={reference}
        recentIds={recentIds}
        multiple={false}
        title={t.workout.replaceExercise}
        onConfirm={([id]) => replaceKey && updateItem(replaceKey, { exerciseId: id })}
      />
    </div>
  );
}
