// Local calendar dates and times. Dates are 'YYYY-MM-DD' keys in the user's own time zone,
// never UTC, so "today" always matches the calendar on the user's wall. Day arithmetic happens at
// local noon, which never falls in a daylight-saving gap, so adding a day can't skip or repeat one.

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_KEY = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_TIME_KEY = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a date key. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A real calendar date in 'YYYY-MM-DD' form (rejects e.g. 2026-02-30). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_KEY.exec(value);
  if (!m) return false;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return todayKey(date) === value;
}

/** 'HH:mm', 24-hour. */
export function isTimeKey(value: unknown): value is string {
  return typeof value === 'string' && TIME_KEY.test(value);
}

/** 'YYYY-MM-DDTHH:mm' in local time, as produced by <input type="datetime-local">. */
export function isDateTimeKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_TIME_KEY.exec(value);
  return !!m && isDateKey(m[1]) && isTimeKey(m[2]);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + days, 12));
}

/** Whole calendar days from `a` to `b` (negative if `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, like Date.getDay(). */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

/** The seven date keys of the Monday-to-Sunday week containing `key`. */
export function weekDays(key: string): string[] {
  const monday = addDays(key, -((weekdayOf(key) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function dateTimeKey(date: string, time: string): string {
  return `${date}T${time}`;
}

export function splitDateTime(value: string): { date: string; time: string } {
  const [date, time] = value.split('T');
  return { date, time };
}

/**
 * The moment a local date and time happens. If a daylight-saving jump skips that wall-clock time,
 * JavaScript moves it forward to the first valid moment, which is what a reminder should do.
 */
export function localMoment(value: string): Date {
  const { date, time } = splitDateTime(value);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function toDateTimeKey(date: Date): string {
  return `${todayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
