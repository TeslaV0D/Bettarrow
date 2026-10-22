"use client";

import Link from "next/link";
import { Dumbbell, Plus } from "lucide-react";
import type { CatalogExercise } from "@/lib/exercise-search";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDay } from "@/lib/format";
import { ExerciseSearchBar } from "./exercise-filters";
import { FavoriteButton } from "./favorite-button";
import { exerciseSubtitle, useExerciseSearch, type Reference } from "./use-exercise-search";
import { fmt, plural } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

export function ExerciseBrowser({ catalog, reference }: { catalog: CatalogExercise[]; reference: Reference }) {
  const { filter, update, reset, results, maps } = useExerciseSearch(catalog, reference);
  const t = useT();
  return (
    <div className="space-y-4">
      <ExerciseSearchBar filter={filter} update={update} reset={reset} reference={reference} />
      <p className="text-sm text-muted" aria-live="polite">
        {plural(t.units.exercises, results.length)}
      </p>
      {results.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={t.exercises.noneFound}
          description={t.exercises.noneFoundText}
          action={
            <Link href="/exercises/new" className={buttonClasses("primary", "md")}>
              <Plus className="size-4" aria-hidden />
              {t.exercises.createCustom}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {results.map((e) => (
            <li key={e.id} className="flex items-center gap-1 pr-1.5">
              <Link href={`/exercises/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    {e.isCustom ? <Badge tone="info">{t.exercises.custom}</Badge> : null}
                    {e.archived ? <Badge tone="outline">{t.exercises.archived}</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {exerciseSubtitle(e, maps)}
                    {e.lastUsed ? <span className="text-subtle"> · {fmt(t.start.lastUsed, { date: formatDay(e.lastUsed, "dayMonth") })}</span> : null}
                  </span>
                </span>
              </Link>
              <FavoriteButton id={e.id} favorite={e.isFavorite} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
