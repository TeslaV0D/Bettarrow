"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { profileSchema } from "@/lib/settings-schema";
import { formatNumber, kgToUnit, unitToKg, type HeightUnit, type WeightUnit } from "@/lib/format";
import { updateProfileAction } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

const CM_PER_IN = 2.54;

export function ProfileForm({
  initial,
  weightUnit,
  heightUnit,
}: {
  initial: { name: string | null; birthDate: string | null; sex: string | null; heightCm: number | null; targetWeightKg: number | null; trainingLevel: string | null; goals: string | null };
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    name: initial.name ?? "",
    birthDate: initial.birthDate ?? "",
    sex: initial.sex ?? "",
    height: initial.heightCm == null ? "" : formatNumber(heightUnit === "cm" ? initial.heightCm : initial.heightCm / CM_PER_IN, 1),
    target: initial.targetWeightKg == null ? "" : formatNumber(kgToUnit(initial.targetWeightKg, weightUnit), 1),
    trainingLevel: initial.trainingLevel ?? "",
    goals: initial.goals ?? "",
  });
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
    const h = num(v.height);
    const t = num(v.target);
    const input = {
      name: v.name.trim() || null,
      birthDate: v.birthDate || null,
      sex: (v.sex || null) as "female" | "male" | "diverse" | null,
      heightCm: h == null || Number.isNaN(h) ? (v.height.trim() ? "x" : null) : heightUnit === "cm" ? h : Math.round(h * CM_PER_IN * 10) / 10,
      targetWeightKg: t == null || Number.isNaN(t) ? (v.target.trim() ? "x" : null) : unitToKg(t, weightUnit),
      trainingLevel: (v.trainingLevel || null) as "beginner" | "intermediate" | "advanced" | null,
      goals: v.goals.trim() || null,
    };
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await updateProfileAction(parsed.data);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Profil gespeichert");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Name" htmlFor="p-name">
          <Input id="p-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={60} autoComplete="given-name" />
        </Field>
        <Field label="Geburtsdatum (optional)" htmlFor="p-birth" error={errors.birthDate}>
          <Input id="p-birth" type="date" value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
        </Field>
        <Field label="Geschlecht (optional)" htmlFor="p-sex">
          <Select id="p-sex" value={v.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="">Keine Angabe</option>
            <option value="female">Weiblich</option>
            <option value="male">Männlich</option>
            <option value="diverse">Divers</option>
          </Select>
        </Field>
        <Field label={`Körpergröße (${heightUnit === "cm" ? "cm" : "Zoll"})`} htmlFor="p-height" error={errors.heightCm}>
          <Input id="p-height" inputMode="decimal" value={v.height} onChange={(e) => set("height", e.target.value)} />
        </Field>
        <Field label={`Zielgewicht (${weightUnit}, optional)`} htmlFor="p-target" error={errors.targetWeightKg}>
          <Input id="p-target" inputMode="decimal" value={v.target} onChange={(e) => set("target", e.target.value)} />
        </Field>
        <Field label="Trainingsniveau (optional)" htmlFor="p-level">
          <Select id="p-level" value={v.trainingLevel} onChange={(e) => set("trainingLevel", e.target.value)}>
            <option value="">Keine Angabe</option>
            <option value="beginner">Einsteiger</option>
            <option value="intermediate">Fortgeschritten</option>
            <option value="advanced">Erfahren</option>
          </Select>
        </Field>
        <Field label="Trainingsziele (optional)" htmlFor="p-goals" className="sm:col-span-2">
          <Textarea id="p-goals" value={v.goals} onChange={(e) => set("goals", e.target.value)} rows={3} maxLength={1000} placeholder="z. B. 100 kg Bankdrücken, 3× pro Woche trainieren" />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="primary" loading={pending}>
            Speichern
          </Button>
        </div>
      </Card>
      <p className="mt-2 px-1 text-xs text-subtle">Alle Angaben sind optional. Das aktuelle Körpergewicht wird im Tab „Körpergewicht“ gepflegt.</p>
    </form>
  );
}
