// Focus timer arithmetic. Elapsed time always comes from wall-clock timestamps (epoch ms), never
// from counting ticks, so the timer stays right while the window is hidden, the Mac sleeps, or the
// app is closed and reopened.

import type { Settings, TimerState } from './types.ts';

export const DEFAULT_SETTINGS: Settings = { focusMinutes: 25, breakMinutes: 5 };
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 180;

export function clampMinutes(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(n)));
}

export function elapsedMs(timer: TimerState, now: number): number {
  // A clock set backwards never makes time run in reverse.
  const running = timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt);
  return Math.min(timer.durationMs, timer.elapsedMs + running);
}

export function remainingMs(timer: TimerState, now: number): number {
  return timer.durationMs - elapsedMs(timer, now);
}

export function isFinished(timer: TimerState, now: number): boolean {
  return remainingMs(timer, now) <= 0;
}

/** Epoch ms when a running timer reaches zero, or null while paused. */
export function endsAt(timer: TimerState): number | null {
  return timer.startedAt === null ? null : timer.startedAt + timer.durationMs - timer.elapsedMs;
}

export function startTimer(taskId: string, taskTitle: string, settings: Settings, now: number): TimerState {
  return {
    taskId,
    taskTitle,
    phase: 'focus',
    durationMs: settings.focusMinutes * 60_000,
    breakMs: settings.breakMinutes * 60_000,
    startedAt: now,
    elapsedMs: 0,
  };
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.startedAt === null) return timer;
  return { ...timer, startedAt: null, elapsedMs: elapsedMs(timer, now) };
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
  if (timer.startedAt !== null || isFinished(timer, now)) return timer;
  return { ...timer, startedAt: now };
}

export function startBreak(timer: TimerState, now: number): TimerState {
  return { ...timer, phase: 'break', durationMs: timer.breakMs, startedAt: now, elapsedMs: 0 };
}

/** '25:00', or '1:05:00' past an hour. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function parseTimer(value: unknown): TimerState | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (typeof t.taskId !== 'string' || typeof t.taskTitle !== 'string') return null;
  if (t.phase !== 'focus' && t.phase !== 'break') return null;
  if (!num(t.durationMs) || !num(t.breakMs) || !num(t.elapsedMs)) return null;
  if (t.startedAt !== null && !num(t.startedAt)) return null;
  return {
    taskId: t.taskId,
    taskTitle: t.taskTitle,
    phase: t.phase,
    durationMs: t.durationMs as number,
    breakMs: t.breakMs as number,
    startedAt: t.startedAt as number | null,
    elapsedMs: Math.min(t.elapsedMs as number, t.durationMs as number),
  };
}
