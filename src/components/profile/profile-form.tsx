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
import { fmt, translateMessage } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

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
  const tr = useT();
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
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= translateMessage(tr, i.message);
      setErrors(errs);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await updateProfileAction(parsed.data);
      if (!res.ok) return void toast.error(res.error);
      toast.success(tr.profile.saved);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label={tr.common.name} htmlFor="p-name">
          <Input id="p-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={60} autoComplete="given-name" />
        </Field>
        <Field label={tr.profile.birthDate} htmlFor="p-birth" error={errors.birthDate}>
          <Input id="p-birth" type="date" value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
        </Field>
        <Field label={tr.profile.sex} htmlFor="p-sex">
          <Select id="p-sex" value={v.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="">{tr.profile.noAnswer}</option>
            <option value="female">{tr.profile.female}</option>
            <option value="male">{tr.profile.male}</option>
            <option value="diverse">{tr.profile.diverse}</option>
          </Select>
        </Field>
        <Field label={fmt(tr.profile.height, { unit: heightUnit === "cm" ? "cm" : tr.profile.inches })} htmlFor="p-height" error={errors.heightCm}>
          <Input id="p-height" inputMode="decimal" value={v.height} onChange={(e) => set("height", e.target.value)} />
        </Field>
        <Field label={fmt(tr.profile.targetWeight, { unit: weightUnit })} htmlFor="p-target" error={errors.targetWeightKg}>
          <Input id="p-target" inputMode="decimal" value={v.target} onChange={(e) => set("target", e.target.value)} />
        </Field>
        <Field label={tr.profile.level} htmlFor="p-level">
          <Select id="p-level" value={v.trainingLevel} onChange={(e) => set("trainingLevel", e.target.value)}>
            <option value="">{tr.profile.noAnswer}</option>
            <option value="beginner">{tr.profile.beginner}</option>
            <option value="intermediate">{tr.profile.intermediate}</option>
            <option value="advanced">{tr.profile.advanced}</option>
          </Select>
        </Field>
        <Field label={tr.profile.goals} htmlFor="p-goals" className="sm:col-span-2">
          <Textarea id="p-goals" value={v.goals} onChange={(e) => set("goals", e.target.value)} rows={3} maxLength={1000} placeholder={tr.profile.goalsPlaceholder} />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="primary" loading={pending}>
            {tr.common.save}
          </Button>
        </div>
      </Card>
      <p className="mt-2 px-1 text-xs text-subtle">{tr.profile.allOptional}</p>
    </form>
  );
}
