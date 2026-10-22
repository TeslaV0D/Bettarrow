"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { settingsSchema, type SettingsInput } from "@/lib/settings-schema";
import { setLocaleAction, updateSettingsAction } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LOCALES, LOCALE_NAMES, translateMessage, type Locale } from "@/lib/i18n";
import { weekdayNames } from "@/lib/format";
import { useLocale, useT } from "@/components/i18n-provider";
import { Segmented } from "@/components/ui/segmented";

type Values = {
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "in";
  weekStart: number;
  timezone: string;
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  restTimerSound: boolean;
  keepScreenAwake: boolean;
  effortMetric: "none" | "rir" | "rpe";
  defaultBodyweightMode: "bodyweight" | "bodyweight_plus" | "bodyweight_minus" | "none";
  bodyweightInVolume: boolean;
  secondaryMuscleWeight: number;
};

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ ...initial, defaultRestSeconds: String(initial.defaultRestSeconds), secondaryMuscleWeight: String(initial.secondaryMuscleWeight).replace(".", ",") });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [initial.timezone];
    }
  }, [initial.timezone]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: SettingsInput = { ...v, secondaryMuscleWeight: v.secondaryMuscleWeight.replace(",", "."), defaultRestSeconds: v.defaultRestSeconds };
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      setError(translateMessage(t, parsed.error.issues[0].message));
      return;
    }
    setError(null);
    start(async () => {
      const res = await updateSettingsAction(parsed.data);
      if (!res.ok) return void toast.error(res.error);
      toast.success(t.settings.saved);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <LanguageCard />

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t.settings.unitsCalendar}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.weightUnit} htmlFor="s-wu">
            <Select id="s-wu" value={v.weightUnit} onChange={(e) => set("weightUnit", e.target.value as "kg" | "lb")}>
              <option value="kg">{t.settings.kilograms}</option>
              <option value="lb">{t.settings.pounds}</option>
            </Select>
          </Field>
          <Field label={t.settings.heightUnit} htmlFor="s-hu">
            <Select id="s-hu" value={v.heightUnit} onChange={(e) => set("heightUnit", e.target.value as "cm" | "in")}>
              <option value="cm">{t.settings.centimeters}</option>
              <option value="in">{t.settings.inches}</option>
            </Select>
          </Field>
          <Field label={t.settings.weekStart} htmlFor="s-ws">
            <Select id="s-ws" value={v.weekStart} onChange={(e) => set("weekStart", Number(e.target.value))}>
              {[1, 7, 6].map((d) => (
                <option key={d} value={d}>
                  {weekdayNames("long")[d - 1]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.timezone} htmlFor="s-tz" hint={t.settings.timezoneHint}>
            <Select id="s-tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-subtle">{t.settings.unitsNote}</p>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t.settings.training}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.defaultRest} htmlFor="s-rest">
            <Input id="s-rest" inputMode="numeric" value={v.defaultRestSeconds} onChange={(e) => set("defaultRestSeconds", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t.settings.effort} htmlFor="s-effort">
            <Select id="s-effort" value={v.effortMetric} onChange={(e) => set("effortMetric", e.target.value as Values["effortMetric"])}>
              <option value="rir">{t.settings.rir}</option>
              <option value="rpe">{t.settings.rpe}</option>
              <option value="none">{t.settings.hide}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 divide-y divide-border rounded-md border border-border">
          <Toggle label={t.settings.autoRest} checked={v.autoStartRestTimer} onChange={(b) => set("autoStartRestTimer", b)} />
          <Toggle label={t.settings.restSound} checked={v.restTimerSound} onChange={(b) => set("restTimerSound", b)} />
          <Toggle label={t.settings.keepAwake} checked={v.keepScreenAwake} onChange={(b) => set("keepScreenAwake", b)} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t.settings.calculations}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.defaultBwMode} htmlFor="s-bwm">
            <Select id="s-bwm" value={v.defaultBodyweightMode} onChange={(e) => set("defaultBodyweightMode", e.target.value as Values["defaultBodyweightMode"])}>
              {(["bodyweight_plus", "bodyweight", "bodyweight_minus", "none"] as const).map((m) => (
                <option key={m} value={m}>
                  {t.loadModes[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.secondaryWeight} htmlFor="s-sec" hint={t.settings.secondaryWeightHint}>
            <Input id="s-sec" inputMode="decimal" value={v.secondaryMuscleWeight} onChange={(e) => set("secondaryMuscleWeight", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 rounded-md border border-border">
          <Toggle label={t.settings.bwInVolume} checked={v.bodyweightInVolume} onChange={(b) => set("bodyweightInVolume", b)} />
        </div>
      </Card>

      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {t.settings.save}
        </Button>
      </div>
    </form>
  );
}

/** Applied immediately (independent of the "save settings" button) so the whole UI switches at once. */
function LanguageCard() {
  const router = useRouter();
  const t = useT();
  const current = useLocale();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Locale>(current);

  function change(locale: Locale) {
    setValue(locale);
    start(async () => {
      const res = await setLocaleAction(locale);
      if (!res.ok) {
        setValue(current);
        return void toast.error(res.error);
      }
      router.refresh();
    });
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold">{t.settings.language}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{t.settings.languageHint}</p>
      <Segmented
        aria-label={t.settings.language}
        className={pending ? "grid w-full grid-cols-2 opacity-70 sm:inline-flex sm:w-auto" : "grid w-full grid-cols-2 sm:inline-flex sm:w-auto"}
        value={value}
        onChange={change}
        options={LOCALES.map((l) => ({ value: l, label: <span lang={l}>{LOCALE_NAMES[l]}</span> }))}
      />
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
