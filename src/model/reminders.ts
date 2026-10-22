// Which notifications should be scheduled right now. The platform layer replaces whatever it has
// scheduled with exactly this list, so rescheduling, completing or deleting a task can never leave
// a duplicate or stale notification behind.

import { addDays, localMoment, todayKey } from './dates.ts';
import { upcomingDates } from './recurrence.ts';
import { endsAt } from './timer.ts';
import type { GardenState } from './types.ts';

/** Recurring reminders are scheduled this many days ahead, so they still arrive if the app isn't opened. */
export const RECURRING_HORIZON_DAYS = 14;

export type ReminderTarget = { taskId: string } | { seriesId: string; date: string } | { timer: true };

export type Reminder = {
  /** Stable per task and day, so scheduling the same reminder twice replaces it. */
  id: string;
  /** Epoch ms. */
  at: number;
  title: string;
  body: string;
  target: ReminderTarget;
};

export function desiredReminders(state: GardenState, now: number): Reminder[] {
  const reminders: Reminder[] = [];
  const today = todayKey(new Date(now));

  for (const task of state.tasks) {
    if (task.done || !task.remindAt) continue;
    const at = localMoment(task.remindAt).getTime();
    if (at <= now) continue;
    reminders.push(
      task.seriesId && task.occurrenceDate
        ? { id: `series-${task.seriesId}-${task.occurrenceDate}`, at, title: task.title, body: 'Repeating task reminder', target: { taskId: task.id } }
        : { id: `task-${task.id}`, at, title: task.title, body: 'Task reminder', target: { taskId: task.id } },
    );
  }

  // Days a series hasn't created an occurrence for yet.
  for (const series of state.series) {
    if (!series.remindTime) continue;
    const from = series.generatedThrough >= today ? addDays(series.generatedThrough, 1) : today;
    for (const date of upcomingDates(series, from, RECURRING_HORIZON_DAYS)) {
      if (date > addDays(today, RECURRING_HORIZON_DAYS)) break;
      const at = localMoment(`${date}T${series.remindTime}`).getTime();
      if (at <= now) continue;
      reminders.push({
        id: `series-${series.id}-${date}`,
        at,
        title: series.title,
        body: 'Repeating task reminder',
        target: { seriesId: series.id, date },
      });
    }
  }

  const timer = state.timer;
  const timerEnd = timer ? endsAt(timer) : null;
  if (timer && timerEnd !== null && timerEnd > now) {
    reminders.push({
      id: 'focus-timer',
      at: timerEnd,
      title: timer.phase === 'focus' ? 'Focus session finished' : 'Break is over',
      body: timer.phase === 'focus' ? `Nice work on “${timer.taskTitle}”.` : `Ready for “${timer.taskTitle}” again?`,
      target: { timer: true },
    });
  }

  return reminders.sort((a, b) => a.at - b.at);
}

/** Reverses a reminder id into its target, e.g. when macOS reports which one was clicked. */
export function targetFromId(id: string): ReminderTarget | null {
  if (id === 'focus-timer') return { timer: true };
  if (id.startsWith('task-') && id.length > 5) return { taskId: id.slice(5) };
  const m = /^series-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m ? { seriesId: m[1], date: m[2] } : null;
}

/** Ids a task's reminder may have been delivered under. */
export function reminderIdsFor(task: { id: string; seriesId?: string; occurrenceDate?: string }): string[] {
  return task.seriesId && task.occurrenceDate ? [`series-${task.seriesId}-${task.occurrenceDate}`] : [`task-${task.id}`];
}
