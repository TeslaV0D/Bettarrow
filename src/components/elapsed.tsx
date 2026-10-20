"use client";

import { useSyncExternalStore } from "react";
import { formatDuration } from "@/lib/format";

/** Shared 1-second clock (one interval for all subscribers). */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getNow = () => Math.floor(Date.now() / 1000);
const getServerNow = () => null;

export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getNow, getServerNow);
}

/** Live elapsed time of a workout (excluding pauses). Uses timestamps, not tick counting. */
export function Elapsed({
  startedAt,
  pausedAt,
  pausedSeconds,
  className,
}: {
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  className?: string;
}) {
  const now = useNowSeconds();
  const start = new Date(startedAt).getTime() / 1000;
  const end = pausedAt ? new Date(pausedAt).getTime() / 1000 : now;
  if (end == null) return <span className={className}>–:–</span>;
  const secs = Math.max(0, Math.floor(end - start) - pausedSeconds);
  return <span className={className}>{formatDuration(secs, true)}</span>;
}
