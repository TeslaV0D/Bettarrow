"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

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
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (pausedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pausedAt]);
  const end = pausedAt ? new Date(pausedAt).getTime() : (now ?? new Date(startedAt).getTime());
  const secs = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000) - pausedSeconds);
  return (
    <span className={className} suppressHydrationWarning>
      {now == null && !pausedAt ? "–:–" : formatDuration(secs, true)}
    </span>
  );
}
