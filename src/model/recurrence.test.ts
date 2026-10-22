/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduce, startDay } from './garden.ts';
import { describeRepeat } from './recurrence.ts';
import { counter, ctxOn, garden, run } from './testkit.ts';
import type { GardenState } from './types.ts';

const occurrences = (s: GardenState) => s.tasks.filter((t) => t.seriesId).map((t) => `${t.occurrenceDate}${t.done ? ' done' : ''}`);

function dailyGarden() {
  const ids = counter();
  const ctx = ctxOn('2026-10-19', ids); // Monday
  const s = run(garden('2026-10-19', ids), ctx, { type: 'addTask', title: 'Water plants', repeat: { kind: 'daily' } });
  return { s, ids };
}

test('a new repeating task is today’s first occurrence', () => {
  const { s } = dailyGarden();
  assert.equal(s.series.length, 1);
  assert.deepEqual(occurrences(s), ['2026-10-19']);
});

test('each day gets its own occurrence; completing one never completes another', () => {
  const { s: start, ids } = dailyGarden();
  let s = run(start, ctxOn('2026-10-19', ids), { type: 'toggleTask', id: start.tasks[0].id });
  s = startDay(s, ctxOn('2026-10-20', ids));
  assert.deepEqual(occurrences(s), ['2026-10-20'], 'yesterday’s finished copy leaves the list, today’s is new');
  assert.equal(s.tasks[0].done, false);
  assert.deepEqual(s.series[0].history, [{ date: '2026-10-19', status: 'done' }]);
  assert.equal(s.log['2026-10-19'], 1);
});

test('restarting the app the same day never duplicates an occurrence', () => {
  const { s: start, ids } = dailyGarden();
  let s = startDay(start, ctxOn('2026-10-20', ids));
  const again = startDay(startDay(s, ctxOn('2026-10-20', ids)), ctxOn('2026-10-20', ids));
  assert.deepEqual(occurrences(again), ['2026-10-20']);
  // Round-trip through saved JSON, as a restart does.
  s = JSON.parse(JSON.stringify(again));
  assert.deepEqual(occurrences(startDay(s, ctxOn('2026-10-20', ids))), ['2026-10-20']);
});

test('a deleted occurrence does not come back that day', () => {
  const { s: start, ids } = dailyGarden();
  const ctx = ctxOn('2026-10-19', ids);
  const s = run(start, ctx, { type: 'deleteTask', id: start.tasks[0].id });
  assert.deepEqual(occurrences(startDay(s, ctx)), []);
  assert.deepEqual(occurrences(startDay(s, ctxOn('2026-10-20', ids))), ['2026-10-20']);
});

test('a missed occurrence is replaced by the next one and recorded as missed', () => {
  const { s: start, ids } = dailyGarden();
  const s = startDay(start, ctxOn('2026-10-20', ids));
  assert.deepEqual(occurrences(s), ['2026-10-20'], 'only one open copy');
  assert.deepEqual(s.series[0].history, [{ date: '2026-10-19', status: 'missed' }]);
});

test('days the app was closed are not back-filled', () => {
  const { s: start, ids } = dailyGarden();
  const s = startDay(start, ctxOn('2026-11-02', ids));
  assert.deepEqual(occurrences(s), ['2026-11-02']);
});

test('a weekly occurrence missed while closed waits as overdue until the next due day', () => {
  const ids = counter();
  // Created on a Monday, repeating on Mondays.
  let s = run(garden('2026-10-19', ids), ctxOn('2026-10-19', ids), {
    type: 'addTask',
    title: 'Weekly review',
    repeat: { kind: 'weekly', days: [1] },
  });
  s = startDay(s, ctxOn('2026-10-22', ids)); // Thursday: nothing new is due
  assert.deepEqual(occurrences(s), ['2026-10-19'], 'Monday’s copy is still open, as overdue');
  // Next opened on Wednesday the 28th: Monday the 26th was due, so it replaces the old copy.
  s = startDay(s, ctxOn('2026-10-28', ids));
  assert.deepEqual(occurrences(s), ['2026-10-26']);
  assert.deepEqual(s.series[0].history, [{ date: '2026-10-19', status: 'missed' }]);
  assert.equal(s.tasks[0].createdDate, '2026-10-26', 'shown under "Carried over" on Wednesday');
});

test('selected weekdays repeat only on those days', () => {
  const ids = counter();
  let s = run(garden('2026-10-19', ids), ctxOn('2026-10-19', ids), {
    type: 'addTask',
    title: 'Gym',
    repeat: { kind: 'weekdays', days: [1, 3, 5] },
  });
  const seen: string[] = [];
  for (const day of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']) {
    s = startDay(s, ctxOn(day, ids));
    const open = s.tasks.find((t) => t.seriesId && !t.done);
    seen.push(open?.occurrenceDate ?? '-');
    if (open) s = run(s, ctxOn(day, ids), { type: 'toggleTask', id: open.id });
  }
  // Tue: Monday's copy is still open (overdue) and gets finished; Wed and Fri get their own;
  // Thu and Sat have nothing due.
  assert.deepEqual(seen, ['2026-10-19', '2026-10-21', '-', '2026-10-23', '-']);
  assert.ok(s.series[0].history.every((h) => h.status === 'done'));
  assert.equal(describeRepeat({ kind: 'weekdays', days: [1, 3, 5] }), 'Every Mon, Wed, Fri');
  assert.equal(describeRepeat({ kind: 'weekdays', days: [1, 2, 3, 4, 5] }), 'Every weekday');
});

test('stopping a repeat keeps the task as an ordinary one', () => {
  const { s: start, ids } = dailyGarden();
  const ctx = ctxOn('2026-10-19', ids);
  const task = start.tasks[0];
  const out = reduce(start, { type: 'saveDetails', id: task.id, details: { title: task.title }, repeat: null }, ctx);
  assert.equal(out.state.series.length, 0);
  assert.equal(out.state.tasks[0].seriesId, undefined);
  assert.deepEqual(occurrences(startDay(out.state, ctxOn('2026-10-20', ids))), []);
});

test('making a task repeat keeps its details as the template', () => {
  const ids = counter();
  const ctx = ctxOn('2026-10-19', ids);
  let s = run(garden('2026-10-19', ids), ctx, { type: 'addTask', title: 'Stand-up notes' });
  const id = s.tasks[0].id;
  s = run(s, ctx, {
    type: 'saveDetails',
    id,
    details: { title: 'Stand-up notes', description: 'Yesterday / today / blockers', priority: 'high', checklist: [{ id: 'c', text: 'Post in channel', done: true }] },
    repeat: { kind: 'daily' },
    remindTime: '09:15',
  });
  assert.equal(s.tasks[0].remindAt, '2026-10-19T09:15');
  s = startDay(s, ctxOn('2026-10-20', ids));
  const next = s.tasks.find((t) => t.occurrenceDate === '2026-10-20')!;
  assert.equal(next.description, 'Yesterday / today / blockers');
  assert.equal(next.priority, 'high');
  assert.deepEqual(next.checklist?.map((c) => [c.text, c.done]), [['Post in channel', false]], 'subtasks start unticked');
  assert.equal(next.remindAt, '2026-10-20T09:15');
});
