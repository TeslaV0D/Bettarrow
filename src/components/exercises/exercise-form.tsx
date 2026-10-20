"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { exerciseInputSchema, type ExerciseInput } from "@/lib/exercise-schema";
import { LOAD_MODE_HINTS, LOAD_MODE_LABELS, LOAD_MODES, isBodyweightMode, type LoadMode } from "@/lib/training";
import { createExerciseAction, updateExerciseAction } from "@/server/actions/exercises";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { MuscleSelect, groupBy } from "./exercise-filters";
import type { Reference } from "./use-exercise-search";

export interface ExerciseFormValues {
  name: string;
  aliases: string[];
  description: string;
  instructions: string;
  primaryMuscleId: string;
  secondaryMuscleIds: string[];
  equipmentId: string;
  movementPatternId: string;
  mechanic: "compound" | "isolation";
  tracking: "reps" | "duration";
  loadMode: LoadMode;
  bodyweightFactor: string;
  repMin: string;
  repMax: string;
  restSeconds: string;
  notes: string;
}

export function ExerciseForm({
  reference,
  initial,
  exerciseId,
  defaultBodyweightMode,
}: {
  reference: Reference;
  initial?: Partial<ExerciseFormValues>;
  exerciseId?: string;
  defaultBodyweightMode: LoadMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState<ExerciseFormValues>({
    name: "",
    aliases: [],
    description: "",
    instructions: "",
    primaryMuscleId: "",
    secondaryMuscleIds: [],
    equipmentId: "",
    movementPatternId: "",
    mechanic: "compound",
    tracking: "reps",
    loadMode: "external",
    bodyweightFactor: "1",
    repMin: "",
    repMax: "",
    restSeconds: "",
    notes: "",
    ...initial,
  });
  const [aliasDraft, setAliasDraft] = useState("");
  const set = <K extends keyof ExerciseFormValues>(k: K, val: ExerciseFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const muscleName = (id: string) => reference.muscles.find((m) => m.id === id)?.name ?? id;
  const leafMuscles = reference.muscles.filter((m) => !reference.muscles.some((c) => c.parentId === m.id));

  function onEquipmentChange(id: string) {
    set("equipmentId", id);
    if (id === "bodyweight" && v.loadMode === "external" && !exerciseId) set("loadMode", defaultBodyweightMode);
  }

  function addAlias() {
    const a = aliasDraft.trim();
    if (a && !v.aliases.includes(a)) set("aliases", [...v.aliases, a]);
    setAliasDraft("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: ExerciseInput = {
      ...v,
      aliases: aliasDraft.trim() ? [...v.aliases, aliasDraft.trim()] : v.aliases,
      description: v.description || null,
      instructions: v.instructions || null,
      notes: v.notes || null,
      movementPatternId: v.movementPatternId || null,
    };
    const parsed = exerciseInputSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      toast.error("Bitte prüfe die markierten Felder.");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = exerciseId ? await updateExerciseAction(exerciseId, input) : await createExerciseAction(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(exerciseId ? "Übung gespeichert" : "Übung angelegt");
      router.push(`/exercises/${res.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card className="space-y-4 p-4 sm:p-5">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Alternative Bezeichnungen" htmlFor="alias" hint="Werden bei der Suche berücksichtigt. Enter zum Hinzufügen.">
          <div className="flex gap-2">
            <Input
              id="alias"
              value={aliasDraft}
              onChange={(e) => setAliasDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAlias();
                }
              }}
              placeholder="z. B. Bench Press"
            />
            <Button onClick={addAlias} disabled={!aliasDraft.trim()}>
              Hinzufügen
            </Button>
          </div>
          {v.aliases.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {v.aliases.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm">
                  {a}
                  <button type="button" onClick={() => set("aliases", v.aliases.filter((x) => x !== a))} className="grid size-6 place-items-center rounded-full hover:bg-surface-2" aria-label={`${a} entfernen`}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label="Beschreibung" htmlFor="description">
          <Textarea id="description" value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </Field>
        <Field label="Ausführungshinweise" htmlFor="instructions" hint="Ein Hinweis pro Zeile.">
          <Textarea id="instructions" value={v.instructions} onChange={(e) => set("instructions", e.target.value)} rows={4} />
        </Field>
      </Card>

      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Primäre Muskelgruppe" htmlFor="primary" error={errors.primaryMuscleId}>
          <MuscleSelect id="primary" value={v.primaryMuscleId || null} onChange={(id) => set("primaryMuscleId", id ?? "")} reference={reference} leavesOnly placeholder="Bitte wählen" />
        </Field>
        <Field label="Equipment" htmlFor="equipment" error={errors.equipmentId}>
          <Select id="equipment" value={v.equipmentId} onChange={(e) => onEquipmentChange(e.target.value)}>
            <option value="">Bitte wählen</option>
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
        <Field label="Sekundäre Muskelgruppen" htmlFor="secondary" className="sm:col-span-2" hint="Werden in der Muskelanalyse anteilig gewichtet.">
          <div className="flex flex-wrap gap-1.5" id="secondary">
            {leafMuscles
              .filter((m) => m.id !== v.primaryMuscleId)
              .map((m) => {
                const on = v.secondaryMuscleIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("secondaryMuscleIds", on ? v.secondaryMuscleIds.filter((x) => x !== m.id) : [...v.secondaryMuscleIds, m.id])}
                    className={
                      on
                        ? "h-8 rounded-full border border-accent/40 bg-accent-soft px-3 text-sm text-accent"
                        : "h-8 rounded-full border border-border px-3 text-sm text-muted hover:text-text"
                    }
                  >
                    {muscleName(m.id)}
                  </button>
                );
              })}
          </div>
        </Field>
        <Field label="Bewegungsmuster" htmlFor="pattern">
          <Select id="pattern" value={v.movementPatternId} onChange={(e) => set("movementPatternId", e.target.value)}>
            <option value="">Keines</option>
            {reference.patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Übungstyp" htmlFor="mechanic">
          <Segmented
            aria-label="Übungstyp"
            className="flex w-full"
            value={v.mechanic}
            onChange={(m) => set("mechanic", m)}
            options={[
              { value: "compound", label: "Mehrgelenkig" },
              { value: "isolation", label: "Isolation" },
            ]}
          />
        </Field>
      </Card>

      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Erfassung" htmlFor="tracking">
          <Segmented
            aria-label="Erfassung"
            className="flex w-full"
            value={v.tracking}
            onChange={(t) => set("tracking", t)}
            options={[
              { value: "reps", label: "Wiederholungen" },
              { value: "duration", label: "Zeit" },
            ]}
          />
        </Field>
        <Field label="Lastberechnung" htmlFor="loadMode" hint={LOAD_MODE_HINTS[v.loadMode]}>
          <Select id="loadMode" value={v.loadMode} onChange={(e) => set("loadMode", e.target.value as LoadMode)}>
            {LOAD_MODES.map((m) => (
              <option key={m} value={m}>
                {LOAD_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {isBodyweightMode(v.loadMode) ? (
          <Field
            label="Körpergewichtsfaktor"
            htmlFor="factor"
            error={errors.bodyweightFactor}
            hint="Anteil des Körpergewichts, der bewegt wird (1 = 100 %). Näherungswert, z. B. Liegestütz ≈ 0,65."
          >
            <Input id="factor" inputMode="decimal" value={v.bodyweightFactor} onChange={(e) => set("bodyweightFactor", e.target.value.replace(",", "."))} />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wdh. min" htmlFor="repMin" error={errors.repMin}>
            <Input id="repMin" inputMode="numeric" value={v.repMin} onChange={(e) => set("repMin", e.target.value)} />
          </Field>
          <Field label="Wdh. max" htmlFor="repMax" error={errors.repMax}>
            <Input id="repMax" inputMode="numeric" value={v.repMax} onChange={(e) => set("repMax", e.target.value)} />
          </Field>
        </div>
        <Field label="Standard-Ruhezeit (Sek.)" htmlFor="rest" error={errors.restSeconds}>
          <Input id="rest" inputMode="numeric" value={v.restSeconds} onChange={(e) => set("restSeconds", e.target.value)} placeholder="aus Einstellungen" />
        </Field>
        <Field label="Eigene Notizen" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="z. B. Sitzhöhe 4, Griffbreite …" />
        </Field>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => router.back()}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {exerciseId ? "Speichern" : "Übung anlegen"}
        </Button>
      </div>
    </form>
  );
}
