"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight, LogOut, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/logo";
import { Elapsed } from "@/components/elapsed";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { LIBRARY_NAV, MAIN_NAV, isActive } from "./nav-items";
import { StartWorkoutDialog } from "./start-workout-dialog";

export interface ActiveWorkoutInfo {
  id: string;
  name: string;
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
}

export function AppShell({ active, children }: { active: ActiveWorkoutInfo | null; children: ReactNode }) {
  const pathname = usePathname();
  const [startOpen, setStartOpen] = useState(false);
  const onWorkout = pathname === "/workout";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-bg px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <div className="mb-5 px-1">
          {active ? (
            <Link
              href="/workout"
              className="group flex items-center gap-3 rounded-md border border-accent/30 bg-accent-soft px-3 py-2.5 transition-colors hover:bg-accent/20"
            >
              <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text">{active.name}</span>
                <Elapsed className="tabular block text-xs text-accent" {...active} />
              </span>
              <ChevronRight className="size-4 text-accent" aria-hidden />
            </Link>
          ) : (
            <Button variant="primary" className="w-full" onClick={() => setStartOpen(true)}>
              <Play className="size-4 fill-current" aria-hidden />
              Training starten
            </Button>
          )}
        </div>
        <nav aria-label="Hauptnavigation" className="space-y-0.5">
          {MAIN_NAV.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <p className="mb-1 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-subtle">Bibliothek</p>
        <nav aria-label="Bibliothek" className="space-y-0.5">
          {LIBRARY_NAV.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <form action={logoutAction} className="mt-auto">
          <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-text">
            <LogOut className="size-4" aria-hidden />
            Abmelden
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        <main
          className={cn(
            "mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12",
            onWorkout ? "pb-40" : active ? "pb-44" : "pb-28",
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile: active workout bar + bottom navigation */}
      {!onWorkout ? (
        <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
          {active ? (
            <Link
              href="/workout"
              className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-accent/30 bg-surface-2/95 px-3 py-2.5 shadow-lg backdrop-blur"
            >
              <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{active.name}</span>
                <span className="text-xs text-muted">
                  Training läuft · <Elapsed className="tabular text-accent" {...active} />
                </span>
              </span>
              <span className="text-sm font-medium text-accent">Fortsetzen</span>
            </Link>
          ) : null}
          <nav
            aria-label="Hauptnavigation"
            className="safe-bottom grid grid-cols-5 border-t border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85"
          >
            {MAIN_NAV.slice(0, 2).map((item) => (
              <BottomLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
            <div className="grid place-items-center">
              {active ? (
                <Link
                  href="/workout"
                  aria-label="Laufendes Training öffnen"
                  className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-accent/10"
                >
                  <Play className="size-5 fill-current" aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setStartOpen(true)}
                  aria-label="Training starten"
                  className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-accent/10 active:scale-95"
                >
                  <Play className="size-5 fill-current" aria-hidden />
                </button>
              )}
            </div>
            {MAIN_NAV.slice(2).map((item) => (
              <BottomLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </nav>
        </div>
      ) : null}

      <StartWorkoutDialog open={startOpen} onOpenChange={setStartOpen} />
    </div>
  );
}

function SideLink({ item, active }: { item: (typeof MAIN_NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
      )}
    >
      <Icon className={cn("size-[18px]", active && "text-accent")} aria-hidden />
      {item.label}
    </Link>
  );
}

function BottomLink({ item, active }: { item: (typeof MAIN_NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-text" : "text-subtle")}
    >
      <Icon className={cn("size-[22px]", active && "text-accent")} aria-hidden />
      {item.label}
    </Link>
  );
}
