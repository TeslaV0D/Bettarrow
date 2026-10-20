"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { settingsSchema, type SettingsInput } from "@/lib/settings-schema";
import { LOAD_MODE_LABELS } from "@/lib/training";
import { updateSettingsAction } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    start(async () => {
      const res = await updateSettingsAction(parsed.data);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Einstellungen gespeichert");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Einheiten & Kalender</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gewichtseinheit" htmlFor="s-wu">
            <Select id="s-wu" value={v.weightUnit} onChange={(e) => set("weightUnit", e.target.value as "kg" | "lb")}>
              <option value="kg">Kilogramm (kg)</option>
              <option value="lb">Pfund (lb)</option>
            </Select>
          </Field>
          <Field label="Körpergröße" htmlFor="s-hu">
            <Select id="s-hu" value={v.heightUnit} onChange={(e) => set("heightUnit", e.target.value as "cm" | "in")}>
              <option value="cm">Zentimeter</option>
              <option value="in">Zoll</option>
            </Select>
          </Field>
          <Field label="Wochenbeginn" htmlFor="s-ws">
            <Select id="s-ws" value={v.weekStart} onChange={(e) => set("weekStart", Number(e.target.value))}>
              <option value={1}>Montag</option>
              <option value={7}>Sonntag</option>
              <option value={6}>Samstag</option>
            </Select>
          </Field>
          <Field label="Zeitzone" htmlFor="s-tz" hint="Bestimmt, welchem Kalendertag ein Training zugeordnet wird.">
            <Select id="s-tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-subtle">Alle Gewichte werden intern in Kilogramm gespeichert; die Einheit ändert nur die Anzeige und Eingabe.</p>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Training</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standard-Ruhezeit (Sekunden)" htmlFor="s-rest">
            <Input id="s-rest" inputMode="numeric" value={v.defaultRestSeconds} onChange={(e) => set("defaultRestSeconds", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Anstrengung erfassen" htmlFor="s-effort">
            <Select id="s-effort" value={v.effortMetric} onChange={(e) => set("effortMetric", e.target.value as Values["effortMetric"])}>
              <option value="rir">RIR (Wiederholungen in Reserve)</option>
              <option value="rpe">RPE (1–10)</option>
              <option value="none">Ausblenden</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 divide-y divide-border rounded-md border border-border">
          <Toggle label="Pausentimer nach jedem Satz automatisch starten" checked={v.autoStartRestTimer} onChange={(b) => set("autoStartRestTimer", b)} />
          <Toggle label="Signalton am Ende der Pause" checked={v.restTimerSound} onChange={(b) => set("restTimerSound", b)} />
          <Toggle label="Bildschirm während des Trainings anlassen" checked={v.keepScreenAwake} onChange={(b) => set("keepScreenAwake", b)} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Berechnungen</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standard für neue Körpergewichtsübungen" htmlFor="s-bwm">
            <Select id="s-bwm" value={v.defaultBodyweightMode} onChange={(e) => set("defaultBodyweightMode", e.target.value as Values["defaultBodyweightMode"])}>
              {(["bodyweight_plus", "bodyweight", "bodyweight_minus", "none"] as const).map((m) => (
                <option key={m} value={m}>
                  {LOAD_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gewichtung sekundärer Muskeln" htmlFor="s-sec" hint="0 = nur primärer Muskel, 1 = gleichwertig. Standard 0,5.">
            <Input id="s-sec" inputMode="decimal" value={v.secondaryMuscleWeight} onChange={(e) => set("secondaryMuscleWeight", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 rounded-md border border-border">
          <Toggle label="Körpergewichtsübungen im Volumen berücksichtigen" checked={v.bodyweightInVolume} onChange={(b) => set("bodyweightInVolume", b)} />
        </div>
      </Card>

      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          Einstellungen speichern
        </Button>
      </div>
    </form>
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
