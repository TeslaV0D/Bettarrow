import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { logoutAction } from "@/server/actions/auth";
import { getBackups, getBodyweightEntries } from "@/server/queries/profile";
import { getProfile, getSettings } from "@/server/queries/settings";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates";
import type { HeightUnit, WeightUnit } from "@/lib/format";
import { ProfileForm } from "@/components/profile/profile-form";
import { BodyweightSection } from "@/components/profile/bodyweight-section";
import { SettingsForm } from "@/components/profile/settings-form";
import { DataSection } from "@/components/profile/data-section";
import { CategoriesSection } from "@/components/profile/categories-section";
import pkg from "../../../../package.json";

export const metadata: Metadata = { title: "Profil" };

const TABS = [
  { id: "profil", label: "Profil" },
  { id: "gewicht", label: "Körpergewicht" },
  { id: "einstellungen", label: "Einstellungen" },
  { id: "daten", label: "Daten" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : "profil";
  const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
  const unit = settings.weightUnit as WeightUnit;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{profile.name || "Profil"}</h1>
          <p className="mt-1 text-sm text-muted">Persönliche Angaben, Körpergewicht, Einstellungen und Daten</p>
        </div>
        <form action={logoutAction} className="lg:hidden">
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-text">
            <LogOut className="size-4" /> Abmelden
          </button>
        </form>
      </header>
      <nav className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0" aria-label="Profilbereiche">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/profile?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "profil" ? <ProfileForm initial={profile} weightUnit={unit} heightUnit={settings.heightUnit as HeightUnit} /> : null}
      {tab === "gewicht" ? <WeightTab unit={unit} targetKg={profile.targetWeightKg} timezone={settings.timezone} weekStart={settings.weekStart} /> : null}
      {tab === "einstellungen" ? (
        <SettingsForm
          initial={{
            weightUnit: unit,
            heightUnit: settings.heightUnit as "cm" | "in",
            weekStart: settings.weekStart,
            timezone: settings.timezone,
            defaultRestSeconds: settings.defaultRestSeconds,
            autoStartRestTimer: settings.autoStartRestTimer,
            restTimerSound: settings.restTimerSound,
            keepScreenAwake: settings.keepScreenAwake,
            effortMetric: settings.effortMetric as "none" | "rir" | "rpe",
            defaultBodyweightMode: settings.defaultBodyweightMode as "bodyweight" | "bodyweight_plus" | "bodyweight_minus" | "none",
            bodyweightInVolume: settings.bodyweightInVolume,
            secondaryMuscleWeight: settings.secondaryMuscleWeight,
          }}
        />
      ) : null}
      {tab === "daten" ? <DataTab /> : null}
      <p className="mt-10 text-center text-xs text-subtle">Bettarrow {pkg.version} · selbst gehostet · keine externen Dienste</p>
    </div>
  );
}

async function WeightTab({ unit, targetKg, timezone, weekStart }: { unit: WeightUnit; targetKg: number | null; timezone: string; weekStart: number }) {
  const entries = await getBodyweightEntries();
  return (
    <BodyweightSection
      entries={entries.map((e) => ({ id: e.id, date: e.date, weightKg: e.weightKg, note: e.note }))}
      unit={unit}
      today={todayIn(timezone)}
      targetKg={targetKg}
      weekStart={weekStart}
    />
  );
}

async function DataTab() {
  const [backups, equipment, patterns, muscles] = await Promise.all([
    getBackups(),
    db.select().from(s.equipment).orderBy(asc(s.equipment.sortOrder)),
    db.select().from(s.movementPatterns).orderBy(asc(s.movementPatterns.sortOrder)),
    db.select().from(s.muscleGroups).orderBy(asc(s.muscleGroups.sortOrder)),
  ]);
  return (
    <div className="space-y-4">
      <DataSection backups={{ ...backups, files: backups.files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })) }} />
      <CategoriesSection equipment={equipment} patterns={patterns} muscles={muscles} />
    </div>
  );
}
