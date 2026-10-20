"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toSyncPayload, type LoggerState } from "@/lib/workout-reducer";
import type { SyncResult } from "@/lib/workout-schema";

export type SyncStatus = "saved" | "pending" | "saving" | "offline" | "conflict" | "error";

const DEVICE_KEY = "bettarrow:device";
export const draftKey = (id: string) => `bettarrow:workout:${id}`;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "device-unknown";
  }
}

export function readDraft(id: string): LoggerState | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as LoggerState) : null;
  } catch {
    return null;
  }
}

export function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

/**
 * Persists every change locally (synchronously) and syncs snapshots to the server:
 * debounced while typing, immediately when the page is hidden, retried with backoff when offline.
 * Snapshots are idempotent (client ids + monotonically increasing revision), so retries never
 * duplicate sets or sessions.
 */
export function useWorkoutSync(state: LoggerState, onSynced: (serverRevision: number) => void) {
  const [status, setStatus] = useState<SyncStatus>(state.revision > state.baseRevision ? "pending" : "saved");
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);
  const stateRef = useRef(state);
  const syncedRevision = useRef(state.baseRevision);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const deviceId = useRef<string>("");
  const blocked = useRef(false); // conflict: stop auto-sync until resolved
  const conflictRevision = useRef(0);

  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {});
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const send = useCallback(async (keepalive = false): Promise<void> => {
    const current = stateRef.current;
    if (blocked.current || current.revision <= syncedRevision.current) return;
    if (!deviceId.current) deviceId.current = getDeviceId();
    setStatus("saving");
    try {
      const res = await fetch(`/api/workouts/${current.workoutId}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toSyncPayload(current, deviceId.current)),
        keepalive,
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setStatus("error");
        return;
      }
      const data = (await res.json().catch(() => ({ status: "error" }))) as SyncResult | { status: "error" };
      if (data.status === "ok" || data.status === "stale") {
        syncedRevision.current = Math.max(syncedRevision.current, current.revision);
        retryDelay.current = 1000;
        onSynced(data.revision);
        setStatus(stateRef.current.revision > syncedRevision.current ? "pending" : "saved");
        return;
      }
      if (data.status === "conflict") {
        blocked.current = true;
        conflictRevision.current = data.revision;
        setStatus("conflict");
        return;
      }
      setStatus("error");
    } catch {
      // Network problem: data is safe locally, retry later.
      setStatus("offline");
      const delay = retryDelay.current;
      retryDelay.current = Math.min(30_000, delay * 2);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), delay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(async (keepalive = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) await inFlight.current;
    if (stateRef.current.revision <= syncedRevision.current || blocked.current) return;
    const p = send(keepalive).finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    await p;
    // Changes made while the request was in flight.
    if (!blocked.current && stateRef.current.revision > syncedRevision.current && navigator.onLine) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), 400);
    }
  }, [send]);
  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Local persistence runs synchronously during commit (layout effect), so a reload or tab close
  // right after an input can never lose it. The server sync is debounced.
  useLayoutEffect(() => {
    if (state.revision <= syncedRevision.current) return;
    try {
      localStorage.setItem(draftKey(state.workoutId), JSON.stringify(state));
    } catch {
      /* storage full or unavailable: server sync still works */
    }
  }, [state]);

  useEffect(() => {
    if (state.revision > syncedRevision.current && !blocked.current) {
      setStatus((s) => (s === "offline" ? s : "pending"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    }
  }, [state, flush]);

  // Flush when leaving / hiding the page and when connectivity returns.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onPageHide = () => void flush(true);
    const onOnline = () => {
      retryDelay.current = 1000;
      void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current.revision <= syncedRevision.current || blocked.current) return;
      // Pending changes are always in localStorage and are sent with keepalive; only warn when
      // the server has been unreachable, i.e. the data currently exists on this device only.
      void flush(true);
      if (statusRef.current === "offline" || statusRef.current === "error") e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      // Leaving the editor via client-side navigation: send pending changes right away.
      void flush(true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const resolveConflictKeepMine = useCallback(() => {
    blocked.current = false;
    onSynced(conflictRevision.current);
    setStatus("pending");
    setTimeout(() => void flush(), 0);
  }, [flush, onSynced]);

  const isDirty = useCallback(() => stateRef.current.revision > syncedRevision.current, []);
  return { status, flush, resolveConflictKeepMine, isDirty };
}
