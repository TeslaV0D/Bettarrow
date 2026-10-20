"use client";

import { useState } from "react";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { activeFilterCount, type ExerciseFilter, type SortKey } from "@/lib/exercise-search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Reference } from "./use-exercise-search";

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Relevanz",
  name: "Name",
  muscle: "Muskelgruppe",
  recent: "Zuletzt verwendet",
  frequent: "Häufig verwendet",
};

export function ExerciseSearchBar({
  filter,
  update,
  reset,
  reference,
  autoFocus,
  showQuickChips = true,
}: {
  filter: ExerciseFilter;
  update: (p: Partial<ExerciseFilter>) => void;
  reset: () => void;
  reference: Reference;
  autoFocus?: boolean;
  showQuickChips?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filter);
  const topLevel = reference.muscles.filter((m) => !m.parentId);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            type="search"
            value={filter.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Übung oder Alias suchen"
            aria-label="Übungen durchsuchen"
            autoFocus={autoFocus}
            className="pl-9 pr-9"
            enterKeyHint="search"
          />
          {filter.query ? (
            <button
              type="button"
              onClick={() => update({ query: "" })}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-muted hover:text-text"
              aria-label="Suche leeren"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Button variant={count ? "soft" : "secondary"} size="md" onClick={() => setOpen(true)} aria-label="Filter">
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filter</span>
          {count ? <span className="tabular rounded-full bg-accent px-1.5 text-xs text-accent-ink">{count}</span> : null}
        </Button>
      </div>

      {showQuickChips ? (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Muskelgruppe">
          <Chip active={!filter.primary && !filter.favoritesOnly} onClick={() => update({ primary: null, favoritesOnly: false })}>
            Alle
          </Chip>
          <Chip active={filter.favoritesOnly} onClick={() => update({ favoritesOnly: !filter.favoritesOnly })}>
            Favoriten
          </Chip>
          {topLevel.map((m) => (
            <Chip key={m.id} active={filter.primary === m.id} onClick={() => update({ primary: filter.primary === m.id ? null : m.id })}>
              {m.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Filter & Sortierung"
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={reset} disabled={count === 0 && filter.sort === "relevance"}>
                <RotateCcw className="size-4" aria-hidden />
                Zurücksetzen
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Fertig
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primäre Muskelgruppe" htmlFor="f-primary">
              <MuscleSelect id="f-primary" value={filter.primary} onChange={(v) => update({ primary: v })} reference={reference} />
            </Field>
            <Field label="Sekundäre Muskelgruppe" htmlFor="f-secondary">
              <MuscleSelect id="f-secondary" value={filter.secondary} onChange={(v) => update({ secondary: v })} reference={reference} />
            </Field>
            <Field label="Equipment" htmlFor="f-equipment">
              <Select id="f-equipment" value={filter.equipment ?? ""} onChange={(e) => update({ equipment: e.target.value || null })}>
                <option value="">Alle</option>
                {groupBy(reference.equipment, (e) => e.category ?? "").map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Bewegungsmuster" htmlFor="f-pattern">
              <Select id="f-pattern" value={filter.pattern ?? ""} onChange={(e) => update({ pattern: e.target.value || null })}>
                <option value="">Alle</option>
                {reference.patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Übungstyp" htmlFor="f-mechanic">
              <Select id="f-mechanic" value={filter.mechanic ?? ""} onChange={(e) => update({ mechanic: (e.target.value || null) as ExerciseFilter["mechanic"] })}>
                <option value="">Alle</option>
                <option value="compound">Mehrgelenkig</option>
                <option value="isolation">Isolation</option>
              </Select>
            </Field>
            <Field label="Sortierung" htmlFor="f-sort">
              <Select id="f-sort" value={filter.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                {Object.entries(SORT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-5 divide-y divide-border rounded-md border border-border">
            <ToggleRow label="Nur Favoriten" checked={filter.favoritesOnly} onChange={(v) => update({ favoritesOnly: v })} />
            <ToggleRow label="Nur eigene Übungen" checked={filter.customOnly} onChange={(v) => update({ customOnly: v })} />
            <ToggleRow label="Archivierte anzeigen" checked={filter.showArchived} onChange={(v) => update({ showArchived: v })} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MuscleSelect({
  id,
  value,
  onChange,
  reference,
  leavesOnly,
  placeholder = "Alle",
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  reference: Reference;
  leavesOnly?: boolean;
  placeholder?: string;
}) {
  const parents = reference.muscles.filter((m) => !m.parentId);
  const children = (pid: string) => reference.muscles.filter((m) => m.parentId === pid);
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {parents.map((p) => {
        const kids = children(p.id);
        if (kids.length === 0) {
          return (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          );
        }
        return (
          <optgroup key={p.id} label={p.name}>
            {!leavesOnly ? <option value={p.id}>{p.name} (alle)</option> : null}
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 px-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()];
}
