/// <reference types="node" />
// Focus timer and reminder scheduling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduce, startDay } from './garden.ts';
import { desiredReminders, targetFromId } from './reminders.ts';
import { counter, ctxOn, garden, run } from './testkit.ts';
import { elapsedMs, endsAt, formatClock, isFinished, pauseTimer, remainingMs, resumeTimer, startTimer } from './timer.ts';

const MIN = 60_000;
const T0 = new Date(2026, 9, 22, 10, 0).getTime();
const settings = { focusMinutes: 25, breakMinutes: 5 };

test('elapsed time comes from timestamps, so sleep or a hidden window can’t stall it', () => {
  const t = startTimer('a', 'Task', settings, T0);
  // No ticks at all for 10 minutes (e.g. the Mac slept): still exactly 15 left.
  assert.equal(remainingMs(t, T0 + 10 * MIN), 15 * MIN);
  assert.ok(isFinished(t, T0 + 40 * MIN));
  assert.equal(remainingMs(t, T0 + 40 * MIN), 0);
  assert.equal(endsAt(t), T0 + 25 * MIN);
});

test('pause and resume keep the remaining time', () => {
  let t = startTimer('a', 'Task', settings, T0);
  t = pauseTimer(t, T0 + 5 * MIN);
  assert.equal(remainingMs(t, T0 + 60 * MIN), 20 * MIN, 'paused time doesn’t count');
  assert.equal(endsAt(t), null);
  t = resumeTimer(t, T0 + 60 * MIN);
  assert.equal(remainingMs(t, T0 + 70 * MIN), 10 * MIN);
  assert.equal(elapsedMs(t, T0 + 1000 * MIN), 25 * MIN, 'never more than the duration');
});

test('a clock set backwards never runs the timer in reverse', () => {
  const t = startTimer('a', 'Task', settings, T0);
  assert.equal(remainingMs(t, T0 - 5 * MIN), 25 * MIN);
});

test('the timer survives a restart (saved state, then reloaded later)', () => {
  const ids = counter();
  const ctx = { ...ctxOn('2026-10-22', ids), now: T0 };
  let s = run(garden('2026-10-22', ids), ctx, { type: 'addTask', title: 'Deep work' });
  s = run(s, ctx, { type: 'timerStart', taskId: s.tasks[0].id, focusMinutes: 50 });
  assert.equal(s.settings.focusMinutes, 50, 'edited durations become the new default');
  const reopened = startDay(JSON.parse(JSON.stringify(s)), { ...ctx, now: T0 + 30 * MIN });
  assert.equal(remainingMs(reopened.timer!, T0 + 30 * MIN), 20 * MIN);
});

test('finishing a session awards nothing by itself', () => {
  const ids = counter();
  const ctx = { ...ctxOn('2026-10-22', ids), now: T0 };
  let s = run(garden('2026-10-22', ids), ctx, { type: 'addTask', title: 'Deep work' });
  s = run(s, ctx, { type: 'timerStart', taskId: s.tasks[0].id });
  s = run(s, { ...ctx, now: T0 + 26 * MIN }, { type: 'timerBreak' }, { type: 'timerStop' });
  assert.equal(s.plant.points, 0);
  assert.equal(s.tasks[0].done, false);
});

test('clock formatting', () => {
  assert.equal(formatClock(25 * MIN), '25:00');
  assert.equal(formatClock(61_000), '1:01');
  assert.equal(formatClock(999), '0:01');
  assert.equal(formatClock(90 * MIN), '1:30:00');
});

test('reminders: one per task and day, and none for finished or past ones', () => {
  const ids = counter();
  const ctx = { ...ctxOn('2026-10-22', ids), now: new Date(2026, 9, 22, 8, 0).getTime() };
  let s = run(garden('2026-10-22', ids), ctx, { type: 'addTask', title: 'Call dentist' }, { type: 'addTask', title: 'Stretch' });
  const [call, stretch] = s.tasks;
  s = run(
    s,
    ctx,
    { type: 'saveDetails', id: call.id, details: { title: call.title, remindAt: '2026-10-22T09:00' } },
    { type: 'saveDetails', id: stretch.id, details: { title: stretch.title }, repeat: { kind: 'daily' }, remindTime: '11:00' },
  );
  let list = desiredReminders(s, ctx.now);
  const ids1 = list.map((r) => r.id);
  assert.equal(new Set(ids1).size, ids1.length, 'no duplicate ids');
  assert.ok(ids1.includes(`task-${call.id}`));
  const seriesId = s.series[0].id;
  assert.ok(ids1.includes(`series-${seriesId}-2026-10-22`), 'today’s occurrence');
  assert.ok(ids1.includes(`series-${seriesId}-2026-10-23`), 'tomorrow, before the app creates it');
  assert.equal(list.filter((r) => r.id.startsWith(`series-${seriesId}`)).length, 15);

  // Completing removes the reminder; rescheduling replaces it (same id, new time).
  s = run(s, ctx, { type: 'toggleTask', id: call.id });
  assert.ok(!desiredReminders(s, ctx.now).some((r) => r.id === `task-${call.id}`));
  s = run(s, ctx, { type: 'toggleTask', id: call.id }, { type: 'saveDetails', id: call.id, details: { title: call.title, remindAt: '2026-10-22T15:30' } });
  list = desiredReminders(s, ctx.now);
  assert.equal(list.filter((r) => r.id === `task-${call.id}`).length, 1);
  assert.equal(list.find((r) => r.id === `task-${call.id}`)!.at, new Date(2026, 9, 22, 15, 30).getTime());
  // Deleting removes it; past reminders are never scheduled.
  s = run(s, ctx, { type: 'deleteTask', id: call.id });
  assert.ok(!desiredReminders(s, ctx.now).some((r) => r.id === `task-${call.id}`));
  assert.ok(!desiredReminders(s, new Date(2026, 9, 22, 12, 0).getTime()).some((r) => r.id === `series-${seriesId}-2026-10-22`));

  // When tomorrow's occurrence is created, it keeps the same id: no duplicate notification.
  const tomorrow = startDay(s, { ...ctxOn('2026-10-23', ids), now: new Date(2026, 9, 23, 8, 0).getTime() });
  const t = desiredReminders(tomorrow, new Date(2026, 9, 23, 8, 0).getTime()).filter((r) => r.id === `series-${seriesId}-2026-10-23`);
  assert.equal(t.length, 1);
  assert.ok('taskId' in t[0].target);
});

test('a running focus timer is a reminder; pausing removes it', () => {
  const ids = counter();
  const ctx = { ...ctxOn('2026-10-22', ids), now: T0 };
  let s = run(garden('2026-10-22', ids), ctx, { type: 'addTask', title: 'Deep work' });
  s = run(s, ctx, { type: 'timerStart', taskId: s.tasks[0].id });
  assert.equal(desiredReminders(s, T0).find((r) => r.id === 'focus-timer')?.at, T0 + 25 * MIN);
  s = reduce(s, { type: 'timerPause' }, { ...ctx, now: T0 + MIN }).state;
  assert.ok(!desiredReminders(s, T0 + MIN).some((r) => r.id === 'focus-timer'));
});

test('a clicked reminder id leads back to its task', () => {
  assert.deepEqual(targetFromId('task-abc-123'), { taskId: 'abc-123' });
  assert.deepEqual(targetFromId('series-6f1c-49d2-a1b0-2026-10-23'), { seriesId: '6f1c-49d2-a1b0', date: '2026-10-23' });
  assert.deepEqual(targetFromId('focus-timer'), { timer: true });
  assert.equal(targetFromId('something-else'), null);
});
