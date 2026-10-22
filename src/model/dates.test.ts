/// <reference types="node" />
// Date handling. `npm run test:timezones` runs this under several time zones, including
// America/Havana, where daylight-saving time starts at midnight (so midnight doesn't exist that day).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  daysBetween,
  isDateKey,
  isDateTimeKey,
  localMoment,
  todayKey,
  toDateTimeKey,
  weekDays,
  weekdayOf,
} from './dates.ts';

test('todayKey uses the local calendar date, not UTC', () => {
  assert.equal(todayKey(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
  assert.equal(todayKey(new Date(2026, 11, 31, 23, 55)), '2026-12-31');
});

test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-22', -60), '2026-08-23');
});

test('addDays never skips or repeats a day across daylight-saving changes', () => {
  // Europe: 2026-03-29 and 2026-10-25. US/Cuba: 2026-03-08 and 2026-11-01. NZ: 2026-04-05, 2026-09-27.
  for (const start of ['2026-03-27', '2026-10-23', '2026-03-06', '2026-10-30', '2026-04-03', '2026-09-25']) {
    let day = start;
    for (let i = 1; i <= 5; i++) {
      const next = addDays(day, 1);
      assert.equal(daysBetween(day, next), 1, `${day} -> ${next}`);
      assert.equal(daysBetween(start, next), i);
      day = next;
    }
  }
});

test('isDateKey accepts real dates only', () => {
  assert.ok(isDateKey('2028-02-29'));
  assert.ok(!isDateKey('2026-02-29'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.ok(!isDateKey('2026-13-01'));
  assert.ok(!isDateKey('2026-1-1'));
  assert.ok(!isDateKey(20260101));
  assert.ok(isDateTimeKey('2026-10-22T09:30'));
  assert.ok(!isDateTimeKey('2026-10-22T24:00'));
  assert.ok(!isDateTimeKey('2026-10-22 09:30'));
});

test('weeks run Monday to Sunday', () => {
  assert.deepEqual(weekDays('2026-10-22'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
  assert.deepEqual(weekDays('2026-10-19')[0], '2026-10-19');
  assert.deepEqual(weekDays('2026-10-25')[0], '2026-10-19');
  assert.equal(weekdayOf('2026-10-22'), 4); // Thursday
  assert.equal(weekdayOf('2026-03-08'), 0); // Sunday, even where that day starts with a DST gap
});

test('local reminder times are wall-clock times', () => {
  const at = localMoment('2026-10-22T09:30');
  assert.equal(at.getHours(), 9);
  assert.equal(at.getMinutes(), 30);
  assert.equal(toDateTimeKey(at), '2026-10-22T09:30');
  // A time skipped by a DST jump still produces a valid moment on the same day.
  const gap = localMoment('2026-03-08T00:30');
  assert.equal(todayKey(gap), '2026-03-08');
});
