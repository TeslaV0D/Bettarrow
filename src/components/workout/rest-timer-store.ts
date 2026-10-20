"use client";

/**
 * Rest timer as an external store (independent of React render cycles).
 * The timer is defined by timestamps (endsAt), so it stays correct when the tab is throttled
 * or the page is reloaded (state is persisted in localStorage).
 */

export interface RestTimerState {
  /** Epoch ms when the rest ends (running) */
  endsAt: number | null;
  /** Remaining ms while paused */
  pausedRemaining: number | null;
  /** Total duration of the current rest (ms), for progress display */
  duration: number;
  /** Label, e.g. exercise name */
  label: string | null;
  /** Set when the timer finished and was not yet dismissed */
  finishedAt: number | null;
}

const KEY = "bettarrow:rest-timer";
const EMPTY: RestTimerState = { endsAt: null, pausedRemaining: null, duration: 0, label: null, finishedAt: null };

let state: RestTimerState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
let tick: ReturnType<typeof setInterval> | null = null;
let onFinish: ((s: RestTimerState) => void) | null = null;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  ensureTicking();
}

function persist() {
  try {
    if (state.endsAt || state.pausedRemaining) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function set(next: RestTimerState) {
  state = next;
  persist();
  ensureTicking();
  listeners.forEach((l) => l());
}

function ensureTicking() {
  const running = state.endsAt != null;
  if (running && !tick) {
    tick = setInterval(() => {
      if (state.endsAt && Date.now() >= state.endsAt) {
        const finished = { ...state, endsAt: null, pausedRemaining: null, finishedAt: Date.now() };
        set(finished);
        onFinish?.(finished);
      } else {
        listeners.forEach((l) => l());
      }
    }, 250);
  } else if (!running && tick) {
    clearInterval(tick);
    tick = null;
  }
}

export const restTimer = {
  subscribe(listener: () => void) {
    load();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): RestTimerState {
    load();
    return state;
  },
  getServerSnapshot(): RestTimerState {
    return EMPTY;
  },
  remainingMs(): number {
    if (state.endsAt) return Math.max(0, state.endsAt - Date.now());
    return state.pausedRemaining ?? 0;
  },
  start(seconds: number, label: string | null = null) {
    const ms = Math.max(1, seconds) * 1000;
    set({ endsAt: Date.now() + ms, pausedRemaining: null, duration: ms, label, finishedAt: null });
  },
  pause() {
    if (!state.endsAt) return;
    set({ ...state, pausedRemaining: Math.max(0, state.endsAt - Date.now()), endsAt: null });
  },
  resume() {
    if (state.pausedRemaining == null) return;
    set({ ...state, endsAt: Date.now() + state.pausedRemaining, pausedRemaining: null });
  },
  add(seconds: number) {
    if (state.endsAt) {
      const endsAt = Math.max(Date.now() + 1000, state.endsAt + seconds * 1000);
      set({ ...state, endsAt, duration: Math.max(1000, state.duration + seconds * 1000) });
    } else if (state.pausedRemaining != null) {
      set({ ...state, pausedRemaining: Math.max(1000, state.pausedRemaining + seconds * 1000), duration: Math.max(1000, state.duration + seconds * 1000) });
    }
  },
  reset() {
    if (!state.duration) return;
    set({ ...state, endsAt: Date.now() + state.duration, pausedRemaining: null, finishedAt: null });
  },
  stop() {
    set(EMPTY);
  },
  onFinish(cb: ((s: RestTimerState) => void) | null) {
    onFinish = cb;
  },
};

/** Short double beep using Web Audio (no audio files needed). */
export function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const beep = (at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    };
    beep(0);
    beep(0.28);
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio not available */
  }
}
