/// <reference types="node" />
// Growth points, daily totals, collection and unlocks.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATA_VERSION, NewerDataError, combineGardens, parseState, reduce, startDay } from './garden.ts';
import { BLOOM_POINTS, unlockKey } from './plants.ts';
import { counter, ctxOn, earn, garden, ledgerHolds, run } from './testkit.ts';

const DAY = '2026-10-22';

test('completing awards one point; unchecking takes exactly that back', () => {
  const ctx = ctxOn(DAY);
  let s = run(garden(DAY), ctx, { type: 'addTask', title: 'Write report' });
  const id = s.tasks[0].id;
  for (let i = 0; i < 5; i++) {
    s = run(s, ctx, { type: 'toggleTask', id }, { type: 'toggleTask', id });
  }
  assert.equal(s.plant.points, 0, 'toggling can’t farm points');
  assert.equal(s.lifetimePoints, 0);
  assert.deepEqual(s.log, {});
  s = run(s, ctx, { type: 'toggleTask', id });
  assert.equal(s.plant.points, 1);
  assert.equal(s.log[DAY], 1);
  assert.ok(ledgerHolds(s));
});

test('deleting a completed task takes its point back, and undo returns it only once', () => {
  const ctx = ctxOn(DAY);
  let s = earn(garden(DAY), ctx, 3);
  const task = s.tasks[1];
  s = run(s, ctx, { type: 'deleteTask', id: task.id });
  assert.equal(s.plant.points, 2);
  assert.equal(s.log[DAY], 2);
  s = run(s, ctx, { type: 'restoreTask', task, index: 1 });
  assert.equal(s.plant.points, 3);
  const twice = reduce(s, { type: 'restoreTask', task, index: 1 }, ctx);
  assert.equal(twice.result.ok, false);
  assert.equal(twice.state.plant.points, 3);
  assert.equal(twice.state.tasks.length, 3);
  assert.ok(ledgerHolds(twice.state));
});

test('an unchecked completion from yesterday comes off yesterday’s count', () => {
  const ids = counter();
  let s = run(garden('2026-10-21', ids), ctxOn('2026-10-21', ids), { type: 'addTask', title: 'Late task' });
  const id = s.tasks[0].id;
  s = run(s, ctxOn('2026-10-21', ids), { type: 'toggleTask', id });
  // Open across midnight: the task is still shown until the day is started.
  s = run(s, ctxOn('2026-10-22', ids), { type: 'toggleTask', id });
  assert.deepEqual(s.log, {});
  assert.equal(s.plant.points, 0);
});

test('a plant in bloom moves to the garden exactly once, keeping extra points', () => {
  const ctx = ctxOn(DAY);
  let s = earn(garden(DAY), ctx, BLOOM_POINTS + 3);
  const plantId = s.plant.id;
  assert.equal(s.plant.bloomedDate, DAY);
  const first = reduce(s, { type: 'collect', plantId, next: { name: 'Basil', species: 'fern' } }, ctx);
  assert.ok(first.result.ok);
  s = first.state;
  assert.equal(s.collection.length, 1);
  assert.equal(s.collection[0].points, BLOOM_POINTS);
  assert.equal(s.collection[0].name, 'My first plant');
  assert.equal(s.plant.points, 3, 'points beyond full bloom stay with the new seed');
  assert.equal(s.plant.name, 'Basil');
  assert.equal(s.plant.species, 'fern');
  assert.equal(s.lifetimePoints, BLOOM_POINTS + 3);
  const second = reduce(s, { type: 'collect', plantId, next: {} }, ctx);
  assert.equal(second.result.ok, false, 'the same plant can’t be collected twice');
  assert.equal(second.state.collection.length, 1);
  assert.ok(ledgerHolds(s));
});

test('a plant can’t be collected before full bloom', () => {
  const ctx = ctxOn(DAY);
  const s = earn(garden(DAY), ctx, BLOOM_POINTS - 1);
  const out = reduce(s, { type: 'collect', plantId: s.plant.id, next: {} }, ctx);
  assert.equal(out.result.ok, false);
  assert.equal(out.state.collection.length, 0);
});

test('unchecking a task whose point went into a garden plant never awards it twice', () => {
  const ctx = ctxOn(DAY);
  let s = earn(garden(DAY), ctx, BLOOM_POINTS);
  s = run(s, ctx, { type: 'collect', plantId: s.plant.id, next: {} });
  const id = s.tasks[0].id;
  s = run(s, ctx, { type: 'toggleTask', id });
  assert.equal(s.collection[0].points, BLOOM_POINTS, 'the garden plant is untouched');
  assert.equal(s.plant.points, -1, 'the new plant owes the point');
  assert.equal(s.lifetimePoints, BLOOM_POINTS - 1);
  s = run(s, ctx, { type: 'toggleTask', id });
  assert.equal(s.plant.points, 0);
  assert.equal(s.lifetimePoints, BLOOM_POINTS);
  assert.equal(s.log[DAY], BLOOM_POINTS);
  assert.ok(ledgerHolds(s));
});

test('unlocks follow clear milestones and are never taken away', () => {
  const ctx = ctxOn(DAY);
  let s = earn(garden(DAY), ctx, 10);
  assert.ok(s.unlocked.includes(unlockKey('pot', 'sky')), '10 lifetime points');
  assert.ok(!s.unlocked.includes(unlockKey('species', 'tulip')));
  s = run(s, ctx, { type: 'toggleTask', id: s.tasks[0].id });
  assert.equal(s.lifetimePoints, 9);
  assert.ok(s.unlocked.includes(unlockKey('pot', 'sky')), 'still unlocked after dipping below');
  const locked = reduce(s, { type: 'customize', patch: { species: 'tulip' } }, ctx);
  assert.equal(locked.state.plant.species, 'sprig', 'locked options are ignored');
  s = earn(s, ctx, BLOOM_POINTS);
  s = run(s, ctx, { type: 'collect', plantId: s.plant.id, next: { species: 'sunflower' } });
  assert.equal(s.plant.species, 'sunflower', 'unlocked by the collection itself');
  assert.ok(s.unlocked.includes(unlockKey('background', 'meadow')));
});

test('today’s top three: limit, replace, reorder, freed on completion, reset next day', () => {
  const ids = counter();
  const ctx = ctxOn(DAY, ids);
  let s = garden(DAY, ids);
  for (const title of ['A', 'B', 'C', 'D']) s = run(s, ctx, { type: 'addTask', title });
  const [a, b, c, d] = s.tasks.map((t) => t.id);
  s = run(s, ctx, { type: 'pin', id: a }, { type: 'pin', id: b }, { type: 'pin', id: c });
  const full = reduce(s, { type: 'pin', id: d }, ctx);
  assert.equal(full.result.full, true);
  s = run(s, ctx, { type: 'pin', id: d, replace: b });
  assert.deepEqual(s.priorities.ids, [a, d, c]);
  s = run(s, ctx, { type: 'movePin', id: c, delta: -1 });
  assert.deepEqual(s.priorities.ids, [a, c, d]);
  s = run(s, ctx, { type: 'toggleTask', id: c });
  assert.deepEqual(s.priorities.ids, [a, d], 'completing frees the slot');
  const done = reduce(s, { type: 'pin', id: c }, ctx);
  assert.equal(done.result.ok, false, 'finished tasks can’t be pinned');
  s = startDay(s, ctxOn('2026-10-23', ids));
  assert.deepEqual(s.priorities, { date: '2026-10-23', ids: [] });
});

test('v1 saves migrate without losing anything', () => {
  const ids = counter();
  const v1 = {
    points: 17,
    tasks: [
      { id: 'a', title: 'Old format', done: false, date: '2026-10-21' },
      { id: 'b', title: 'Done today', done: true, createdDate: DAY, completedDate: DAY, priority: 'high', description: 'Notes', checklist: [{ id: 'x', text: 'Sub', done: true }] },
      { id: 'c', title: 'Done yesterday', done: true, createdDate: '2026-10-21', completedDate: '2026-10-21' },
    ],
    log: { '2026-10-21': 4, [DAY]: 1 },
  };
  const s = parseState(v1, ctxOn(DAY, ids));
  assert.equal(s.version, DATA_VERSION);
  assert.deepEqual(s.tasks.map((t) => t.id), ['a', 'b']);
  assert.equal(s.tasks[0].createdDate, '2026-10-21');
  assert.equal(s.tasks[1].description, 'Notes');
  assert.equal(s.tasks[1].checklist?.[0].text, 'Sub');
  assert.equal(s.plant.points, 17);
  assert.equal(s.lifetimePoints, 17);
  assert.equal(s.plant.bloomedDate, DAY, 'already in bloom, so it can be collected');
  assert.deepEqual(s.log, v1.log);
  assert.equal(s.plant.startedDate, '2026-10-21');
  // Saving and loading again changes nothing.
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s)), ctxOn(DAY, ids)), s);
});

test('data from a newer version is refused, not overwritten', () => {
  assert.throws(() => parseState({ version: DATA_VERSION + 1, tasks: [] }, ctxOn(DAY)), NewerDataError);
});

test('combining the same backup twice changes nothing', () => {
  const ids = counter();
  const ctx = ctxOn(DAY, ids);
  let s = earn(garden(DAY, ids), ctx, 4);
  s = run(s, ctx, { type: 'addTask', title: 'Daily', repeat: { kind: 'daily' } });
  const copy = JSON.parse(JSON.stringify(s));
  const once = combineGardens(s, parseState(copy, ctx), ctx);
  assert.deepEqual(once, s);
  assert.deepEqual(combineGardens(once, parseState(copy, ctx), ctx), s);
});
