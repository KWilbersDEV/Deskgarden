// Recurring tasks. A Series describes the rule; each day it is due gets its own Task (an
// occurrence), so finishing today's copy never touches another day's.
//
// Overdue policy, so missed days never flood the list:
// - A series has at most one open occurrence. An unfinished one stays on the list (shown as
//   missed) until the series is next due, when it is replaced by the new occurrence and recorded
//   as missed in the series history.
// - Days the app wasn't opened are not back-filled: only the most recent due day gets an
//   occurrence.
// - `generatedThrough` remembers the last day processed, so restarting the app, or deleting an
//   occurrence, never brings a copy back.

import { addDays, daysBetween, weekdayOf } from './dates.ts';
import type { RepeatRule, Series, Task } from './types.ts';

export const HISTORY_KEPT = 60;
/** Weekdays in display order, Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function occursOn(rule: RepeatRule, date: string): boolean {
  return rule.kind === 'daily' || rule.days.includes(weekdayOf(date));
}

/** The latest due day in (after, upTo], or null. Never looks back more than a week. */
export function latestDueDate(series: Series, after: string, upTo: string): string | null {
  const span = Math.min(7, daysBetween(after, upTo));
  for (let i = 0; i < span; i++) {
    const date = addDays(upTo, -i);
    if (date >= series.startDate && occursOn(series.repeat, date)) return date;
  }
  return null;
}

/** The next `count` due days from `from` (inclusive), within `withinDays`. */
export function upcomingDates(series: Series, from: string, withinDays: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= withinDays; i++) {
    const date = addDays(from, i);
    if (date >= series.startDate && occursOn(series.repeat, date)) dates.push(date);
  }
  return dates;
}

export function newOccurrence(series: Series, date: string, id: string): Task {
  const task: Task = {
    id,
    title: series.title,
    done: false,
    createdDate: date,
    seriesId: series.id,
    occurrenceDate: date,
  };
  if (series.description) task.description = series.description;
  if (series.priority) task.priority = series.priority;
  if (series.checklist?.length) task.checklist = series.checklist.map((c, i) => ({ id: `${id}-${i}`, text: c.text, done: false }));
  if (series.remindTime) task.remindAt = `${date}T${series.remindTime}`;
  return task;
}

export function recordHistory(series: Series, date: string, status: 'done' | 'missed' | null): Series {
  const history = series.history.filter((h) => h.date !== date);
  if (status) history.push({ date, status });
  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...series, history: history.slice(-HISTORY_KEPT) };
}

/**
 * Brings every series up to `today`: creates the occurrence for the latest due day not yet
 * processed, and retires an older unfinished occurrence it replaces.
 */
export function generateOccurrences(
  tasks: Task[],
  seriesList: Series[],
  today: string,
  newId: () => string,
): { tasks: Task[]; series: Series[] } {
  let nextTasks = tasks;
  const nextSeries = seriesList.map((series) => {
    if (series.generatedThrough >= today) return series;
    const due = latestDueDate(series, series.generatedThrough, today);
    let updated: Series = { ...series, generatedThrough: today };
    if (!due) return updated;
    // Never two copies for the same day, even if data was merged from another device.
    if (nextTasks.some((t) => t.seriesId === series.id && t.occurrenceDate === due)) return updated;

    const stale = nextTasks.filter((t) => t.seriesId === series.id && !t.done && (t.occurrenceDate ?? '') < due);
    for (const t of stale) updated = recordHistory(updated, t.occurrenceDate ?? t.createdDate, 'missed');
    const staleIds = new Set(stale.map((t) => t.id));
    nextTasks = [...nextTasks.filter((t) => !staleIds.has(t.id)), newOccurrence(updated, due, newId())];
    return updated;
  });
  return { tasks: nextTasks, series: nextSeries };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(day: number, style: 'long' | 'short' = 'long') {
  return style === 'long' ? DAY_NAMES[day] : DAY_NAMES[day].slice(0, 3);
}

export function describeRepeat(rule: RepeatRule): string {
  if (rule.kind === 'daily') return 'Every day';
  const days = WEEK_ORDER.filter((d) => rule.days.includes(d));
  if (rule.kind === 'weekly') return `Every ${weekdayName(days[0] ?? 1)}`;
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Every weekday';
  if (days.length === 7) return 'Every day';
  return `Every ${days.map((d) => weekdayName(d, 'short')).join(', ')}`;
}
