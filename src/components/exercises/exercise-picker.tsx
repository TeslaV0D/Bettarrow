"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Plus, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CatalogExercise } from "@/lib/exercise-search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExerciseSearchBar } from "./exercise-filters";
import { exerciseSubtitle, useExerciseSearch, type Reference } from "./use-exercise-search";
import { useT } from "@/components/i18n-provider";

/**
 * Exercise picker used in the live workout and the template editor.
 * Supports multi-select (`multiple`) and single replace mode.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  catalog,
  reference,
  recentIds = [],
  multiple = true,
  title,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  catalog: CatalogExercise[];
  reference: Reference;
  recentIds?: string[];
  multiple?: boolean;
  title?: string;
  confirmLabel?: string;
  onConfirm: (ids: string[]) => void;
}) {
  const { filter, update, reset, results, maps } = useExerciseSearch(catalog, reference);
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected([]);
      if (filter.query) update({ query: "" });
    }
  }

  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const showSuggestions = !filter.query && !filter.primary && !filter.favoritesOnly && !filter.equipment && !filter.secondary && !filter.pattern;
  const recent = showSuggestions ? recentIds.map((id) => byId.get(id)).filter((e): e is CatalogExercise => !!e && !e.archived).slice(0, 6) : [];

  function toggle(id: string) {
    if (!multiple) {
      onConfirm([id]);
      onOpenChange(false);
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const row = (e: CatalogExercise, icon?: React.ReactNode) => {
    const idx = selected.indexOf(e.id);
    const isSel = idx >= 0;
    return (
      <li key={e.id}>
        <button
          type="button"
          onClick={() => toggle(e.id)}
          aria-pressed={multiple ? isSel : undefined}
          className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors", isSel ? "bg-accent-soft" : "hover:bg-surface-2")}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium">
              {icon}
              <span className="truncate">{e.name}</span>
            </span>
            <span className="block truncate text-sm text-muted">{exerciseSubtitle(e, maps)}</span>
          </span>
          {multiple ? (
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular",
                isSel ? "border-accent bg-accent text-accent-ink" : "border-border-strong text-transparent",
              )}
              aria-hidden
            >
              {isSel ? idx + 1 : <Check className="size-3.5" />}
            </span>
          ) : (
            <Plus className="size-4 text-subtle" aria-hidden />
          )}
        </button>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title ?? t.picker.title}
        size="lg"
        className="sm:h-[min(760px,88dvh)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        footer={
          multiple ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="primary"
                disabled={selected.length === 0}
                onClick={() => {
                  onConfirm(selected);
                  onOpenChange(false);
                }}
              >
                {confirmLabel ?? t.picker.confirm}
                {selected.length ? ` (${selected.length})` : ""}
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="sticky -top-4 z-10 -mx-5 -mt-4 bg-surface px-5 pb-3 pt-4">
          <ExerciseSearchBar filter={filter} update={update} reset={reset} reference={reference} />
        </div>
        {recent.length ? (
          <section className="mb-3">
            <h3 className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-subtle">{t.picker.recent}</h3>
            <ul>{recent.map((e) => row(e, <Clock className="size-3.5 shrink-0 text-subtle" aria-hidden />))}</ul>
          </section>
        ) : null}
        <section>
          {recent.length ? <h3 className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-subtle">{t.picker.all}</h3> : null}
          {results.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{t.picker.none}</p> : null}
          <ul>{results.map((e) => row(e, e.isFavorite ? <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-hidden /> : undefined))}</ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
