"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

const KEYS: PeriodKey[] = ["this_week", "last_week", "this_month", "last_month", "last_90", "this_year", "all", "custom"];

export function PeriodPicker({ value, from, to }: { value: PeriodKey; from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        aria-label="Zeitraum"
        value={value}
        onChange={(e) => {
          const k = e.target.value as PeriodKey;
          router.push(k === "custom" ? `/stats?period=custom&from=${f}&to=${t}` : `/stats?period=${k}`);
        }}
        className="min-w-44"
      >
        {KEYS.map((k) => (
          <option key={k} value={k}>
            {PERIOD_LABELS[k]}
          </option>
        ))}
      </Select>
      {value === "custom" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/stats?period=custom&from=${f}&to=${t}`);
          }}
        >
          <Input type="date" aria-label="Von" value={f} onChange={(e) => setF(e.target.value)} className="w-40" />
          <span className="text-muted">–</span>
          <Input type="date" aria-label="Bis" value={t} onChange={(e) => setT(e.target.value)} className="w-40" />
          <Button type="submit">Anwenden</Button>
        </form>
      ) : null}
    </div>
  );
}
