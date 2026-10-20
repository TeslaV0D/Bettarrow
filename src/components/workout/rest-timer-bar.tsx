"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, Pause, Play, RotateCcw, Timer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { playBeep, restTimer } from "./rest-timer-store";

const QUICK = [60, 90, 120, 180];

/** Floating, non-blocking rest timer bar. */
export function RestTimerBar({ sound, defaultSeconds }: { sound: boolean; defaultSeconds: number }) {
  const s = useSyncExternalStore(restTimer.subscribe, restTimer.getSnapshot, restTimer.getServerSnapshot);
  const [showQuick, setShowQuick] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    restTimer.onFinish((st) => {
      if (sound) playBeep();
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* ignore */
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
        try {
          new Notification("Pause vorbei", { body: st.label ? `Weiter mit ${st.label}` : "Nächster Satz!", tag: "bettarrow-rest" });
        } catch {
          /* some mobile browsers only allow notifications via service worker */
        }
      }
    });
    return () => restTimer.onFinish(null);
  }, [sound]);

  // Auto-hide the "done" state after a while.
  useEffect(() => {
    if (!s.finishedAt) return;
    const t = setTimeout(() => restTimer.stop(), 8000);
    return () => clearTimeout(t);
  }, [s.finishedAt]);

  const running = s.endsAt != null;
  const paused = s.pausedRemaining != null;
  const done = s.finishedAt != null && !running && !paused;
  const remaining = restTimer.remainingMs();
  const progress = s.duration ? Math.min(1, Math.max(0, 1 - remaining / s.duration)) : 0;

  if (!running && !paused && !done) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pl-[264px]">
        <div className="pointer-events-auto relative">
          {showQuick ? (
            <div className="absolute bottom-14 right-0 flex gap-1.5 rounded-lg border border-border bg-surface-2 p-1.5 shadow-xl">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    restTimer.start(q);
                    setShowQuick(false);
                  }}
                  className="tabular h-10 rounded-md px-3 text-sm font-medium hover:bg-surface-3"
                >
                  {formatClock(q)}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowQuick((v) => !v)}
            onDoubleClick={() => restTimer.start(defaultSeconds)}
            className="flex h-12 items-center gap-2 rounded-full border border-border bg-surface-2/95 px-4 text-sm font-medium text-muted shadow-lg backdrop-blur hover:text-text"
            aria-label="Pausentimer starten"
            aria-expanded={showQuick}
          >
            <Timer className="size-4" aria-hidden />
            Pause
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pl-[260px]" role="timer" aria-live="off">
      <div className={cn("mx-auto max-w-3xl overflow-hidden rounded-xl border shadow-2xl backdrop-blur", done ? "border-accent/50 bg-accent-soft" : "border-border bg-surface-2/95")}>
        <div className="h-1 bg-surface-3">
          <div className="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{done ? "Pause vorbei" : paused ? "Pausiert" : "Pause"}{s.label ? ` · ${s.label}` : ""}</p>
            <p className={cn("tabular text-2xl font-semibold leading-tight", done && "text-accent")} aria-label={`Verbleibend ${formatClock(remaining / 1000)}`}>
              {done ? "0:00" : formatClock(remaining / 1000)}
            </p>
          </div>
          {!done ? (
            <>
              <TimerButton label="15 Sekunden weniger" onClick={() => restTimer.add(-15)}>−15</TimerButton>
              <TimerButton label="15 Sekunden mehr" onClick={() => restTimer.add(15)}>+15</TimerButton>
              <TimerButton label={paused ? "Fortsetzen" : "Pausieren"} onClick={() => (paused ? restTimer.resume() : restTimer.pause())}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </TimerButton>
            </>
          ) : null}
          <TimerButton label="Zurücksetzen" onClick={() => restTimer.reset()}>
            <RotateCcw className="size-4" />
          </TimerButton>
          {perm === "default" ? (
            <TimerButton
              label="Benachrichtigungen aktivieren"
              onClick={async () => setPerm(await Notification.requestPermission())}
            >
              <Bell className="size-4" />
            </TimerButton>
          ) : null}
          <TimerButton label="Timer schließen" onClick={() => restTimer.stop()}>
            <X className="size-4" />
          </TimerButton>
        </div>
      </div>
    </div>
  );
}

function TimerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="tabular grid h-11 min-w-10 shrink-0 place-items-center rounded-md px-1.5 text-sm font-medium text-muted hover:bg-surface-3 hover:text-text sm:min-w-11 sm:px-2">
      {children}
    </button>
  );
}
