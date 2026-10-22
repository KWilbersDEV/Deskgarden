// The garden's data and every change to it, as pure functions. The main window, the menu bar
// quick-add and imports all go through here, so validation and reward rules are the same
// everywhere.
//
// Reward rules (one place, used for daily totals, the week chart, plant growth, collection and
// unlocks):
// - Completing a task awards POINTS_PER_TASK to the active plant and to lifetime points, and
//   counts one completion on the day it was completed.
// - Unchecking it, or deleting it while done, takes exactly that back from the same day's count
//   and from lifetime points. The active plant gives the point back; if the point had gone into a
//   plant that's since moved to the garden, the active plant owes it (its points dip below zero)
//   and the garden plant is never touched.
// - Restoring a deleted completed task gives the point back once.
// - Moving a plant to the garden takes exactly BLOOM_POINTS from it; anything beyond stays with the
//   next plant. It only works on the plant it was offered for, so it can't happen twice.

import { addDays, isDateKey, isDateTimeKey, isTimeKey, todayKey } from './dates.ts';
import {
  BLOOM_POINTS,
  CATALOG,
  DEFAULT_LOOK,
  POINTS_PER_TASK,
  findOption,
  isUnlocked,
  stageFor,
  withUnlocks,
  type OptionKind,
} from './plants.ts';
import { HISTORY_KEPT, generateOccurrences, recordHistory } from './recurrence.ts';
import { DEFAULT_SETTINGS, clampMinutes, parseTimer, pauseTimer, resumeTimer, startBreak, startTimer } from './timer.ts';
import type {
  ActivePlant,
  ChecklistItem,
  CollectedPlant,
  CompletionLog,
  GardenState,
  PlantLook,
  Priority,
  RepeatRule,
  Series,
  Settings,
  Task,
  TaskDetails,
} from './types.ts';

/** Bump with a migration in parseState whenever the saved shape changes. */
export const DATA_VERSION = 2;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const PLANT_NAME_MAX = 40;
export const MAX_PRIORITIES = 3;
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const LOG_DAYS_KEPT = 60;

export type Ctx = { today: string; now: number; newId: () => string };

/** Data saved by a newer version of the app. It is never loaded or overwritten. */
export class NewerDataError extends Error {}

// ---------------------------------------------------------------------------- validation

export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

/** The one title check for the main window, the details panel and the menu bar quick-add. */
export function validateTitle(raw: unknown): { ok: true; title: string } | { ok: false; error: string } {
  const title = typeof raw === 'string' ? cleanTitle(raw) : '';
  return title ? { ok: true, title } : { ok: false, error: 'Give the task a title.' };
}

function isRepeat(value: unknown): value is RepeatRule {
  const r = value as RepeatRule;
  if (typeof r !== 'object' || r === null) return false;
  if (r.kind === 'daily') return true;
  if (r.kind !== 'weekly' && r.kind !== 'weekdays') return false;
  if (!Array.isArray(r.days) || r.days.length === 0) return false;
  if (!r.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  return r.kind === 'weekdays' || r.days.length === 1;
}

export function normalizeRepeat(rule: RepeatRule): RepeatRule {
  return rule.kind === 'daily' ? { kind: 'daily' } : { kind: rule.kind, days: [...new Set(rule.days)].sort() };
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  const c = value as ChecklistItem;
  return typeof c === 'object' && c !== null && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.done === 'boolean';
}

/**
 * Applies details to a task, normalising them: empty optional fields are removed so they don't
 * linger in storage. Completion state is left untouched.
 */
export function withDetails(task: Task, details: TaskDetails): Task {
  const { description: _d, dueDate: _due, priority: _p, checklist: _c, remindAt: _r, ...base } = task;
  const next: Task = { ...base, title: cleanTitle(details.title) || task.title };
  const description = details.description?.trim().slice(0, DESCRIPTION_MAX);
  if (description) next.description = description;
  if (details.dueDate && isDateKey(details.dueDate)) next.dueDate = details.dueDate;
  if (details.priority && PRIORITIES.includes(details.priority)) next.priority = details.priority;
  const checklist = details.checklist?.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text);
  if (checklist?.length) next.checklist = checklist;
  if (details.remindAt && isDateTimeKey(details.remindAt)) next.remindAt = details.remindAt;
  return next;
}

// ---------------------------------------------------------------------------- parsing & migrations

/** Accepts current tasks and v1 tasks, which only had a `date` field. */
function parseTask(value: unknown): Task | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.done !== 'boolean') return null;
  const createdDate = isDateKey(v.createdDate) ? v.createdDate : isDateKey(v.date) ? v.date : null;
  if (!createdDate) return null;

  const task: Task = { id: v.id, title: v.title, done: v.done, createdDate };
  if (v.done) task.completedDate = isDateKey(v.completedDate) ? v.completedDate : createdDate;
  if (typeof v.seriesId === 'string' && isDateKey(v.occurrenceDate)) {
    task.seriesId = v.seriesId;
    task.occurrenceDate = v.occurrenceDate;
  }
  return withDetails(task, {
    title: v.title,
    description: typeof v.description === 'string' ? v.description : undefined,
    dueDate: typeof v.dueDate === 'string' ? v.dueDate : undefined,
    priority: PRIORITIES.includes(v.priority as Priority) ? (v.priority as Priority) : undefined,
    checklist: Array.isArray(v.checklist) ? v.checklist.filter(isChecklistItem) : undefined,
    remindAt: typeof v.remindAt === 'string' ? v.remindAt : undefined,
  });
}

function parseSeries(value: unknown): Series | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.title !== 'string' || !cleanTitle(v.title)) return null;
  if (!isRepeat(v.repeat) || !isDateKey(v.startDate) || !isDateKey(v.generatedThrough)) return null;
  const series: Series = {
    id: v.id,
    title: cleanTitle(v.title),
    repeat: normalizeRepeat(v.repeat),
    startDate: v.startDate,
    generatedThrough: v.generatedThrough,
    history: Array.isArray(v.history)
      ? v.history
          .filter((h) => isDateKey(h?.date) && (h.status === 'done' || h.status === 'missed'))
          .map((h) => ({ date: h.date as string, status: h.status as 'done' | 'missed' }))
          .slice(-HISTORY_KEPT)
      : [],
  };
  if (typeof v.description === 'string' && v.description.trim()) series.description = v.description.trim().slice(0, DESCRIPTION_MAX);
  if (PRIORITIES.includes(v.priority as Priority)) series.priority = v.priority as Priority;
  if (Array.isArray(v.checklist)) {
    const checklist = v.checklist.filter(isChecklistItem).filter((c) => c.text.trim());
    if (checklist.length) series.checklist = checklist.map((c) => ({ ...c, done: false }));
  }
  if (isTimeKey(v.remindTime)) series.remindTime = v.remindTime;
  return series;
}

function parseLook(v: Record<string, unknown>): PlantLook {
  const pick = (kind: OptionKind, value: unknown) =>
    typeof value === 'string' && (CATALOG[kind] as readonly { id: string }[]).some((o) => o.id === value)
      ? value
      : DEFAULT_LOOK[kind];
  return { species: pick('species', v.species), pot: pick('pot', v.pot), background: pick('background', v.background) };
}

function plantName(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim().slice(0, PLANT_NAME_MAX) : fallback;
}

function parsePlant(value: unknown, ctx: Ctx): ActivePlant | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.points !== 'number' || !Number.isFinite(v.points)) return null;
  const plant: ActivePlant = {
    id: v.id,
    name: plantName(v.name, 'My plant'),
    ...parseLook(v),
    startedDate: isDateKey(v.startedDate) ? v.startedDate : ctx.today,
    points: Math.trunc(v.points),
  };
  if (isDateKey(v.bloomedDate) && plant.points >= BLOOM_POINTS) plant.bloomedDate = v.bloomedDate;
  return plant;
}

function parseCollected(value: unknown): CollectedPlant | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !isDateKey(v.collectedDate)) return null;
  return {
    id: v.id,
    name: plantName(v.name, 'Garden plant'),
    ...parseLook(v),
    startedDate: isDateKey(v.startedDate) ? v.startedDate : v.collectedDate,
    bloomedDate: isDateKey(v.bloomedDate) ? v.bloomedDate : v.collectedDate,
    collectedDate: v.collectedDate,
    points: BLOOM_POINTS,
  };
}

function parseLog(value: unknown): CompletionLog {
  const log: CompletionLog = {};
  if (typeof value !== 'object' || value === null) return log;
  for (const [key, count] of Object.entries(value)) {
    if (isDateKey(key) && typeof count === 'number' && count > 0) log[key] = Math.floor(count);
  }
  return log;
}

function parseSettings(value: unknown): Settings {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    focusMinutes: clampMinutes(v.focusMinutes, DEFAULT_SETTINGS.focusMinutes),
    breakMinutes: clampMinutes(v.breakMinutes, DEFAULT_SETTINGS.breakMinutes),
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
}

function newPlant(ctx: Ctx, look: PlantLook, name: string, points = 0): ActivePlant {
  return { id: ctx.newId(), name, ...look, startedDate: ctx.today, points };
}

export function emptyGarden(ctx: Ctx): GardenState {
  return startDay(
    {
      version: DATA_VERSION,
      tasks: [],
      series: [],
      log: {},
      lifetimePoints: 0,
      plant: newPlant(ctx, { ...DEFAULT_LOOK }, 'My first plant'),
      collection: [],
      unlocked: [],
      priorities: { date: ctx.today, ids: [] },
      timer: null,
      settings: { ...DEFAULT_SETTINGS },
    },
    ctx,
  );
}

/**
 * Validates and migrates saved or imported data, then brings it up to `ctx.today` (see startDay).
 *
 * - v1 (no `version`): `{ tasks, points, log? }`. Tasks may still use `date` instead of
 *   `createdDate`. Points become the first plant's points and the lifetime total.
 * - v2: everything in GardenState.
 *
 * Throws NewerDataError for data from a newer app version, so it is never overwritten.
 */
export function parseState(value: unknown, ctx: Ctx): GardenState {
  if (typeof value !== 'object' || value === null) return emptyGarden(ctx);
  const v = value as Record<string, unknown>;
  const version = typeof v.version === 'number' ? v.version : 1;
  if (version > DATA_VERSION) throw new NewerDataError(`Saved by a newer version of Desk Garden (data version ${version}).`);

  const tasks = uniqueById(Array.isArray(v.tasks) ? v.tasks.map(parseTask).filter((t): t is Task => t !== null) : []);
  let log = parseLog(v.log);
  if (!('log' in v)) {
    // v1 saves had no history; today's completed tasks are the only completions we know of.
    const doneToday = tasks.filter((t) => t.done && t.completedDate === ctx.today).length;
    if (doneToday) log = { [ctx.today]: doneToday };
  }

  let state: GardenState;
  if (version === 1) {
    const points = typeof v.points === 'number' && v.points > 0 ? Math.floor(v.points) : 0;
    const earliest = Object.keys(log).sort()[0] ?? tasks.map((t) => t.createdDate).sort()[0] ?? ctx.today;
    const plant = newPlant({ ...ctx, today: earliest }, { ...DEFAULT_LOOK }, 'My first plant', points);
    if (points >= BLOOM_POINTS) plant.bloomedDate = ctx.today;
    state = {
      version: DATA_VERSION,
      tasks,
      series: [],
      log,
      lifetimePoints: points,
      plant,
      collection: [],
      unlocked: [],
      priorities: { date: ctx.today, ids: [] },
      timer: null,
      settings: { ...DEFAULT_SETTINGS },
    };
  } else {
    const series = uniqueById(Array.isArray(v.series) ? v.series.map(parseSeries).filter((s): s is Series => s !== null) : []);
    const seriesIds = new Set(series.map((s) => s.id));
    const collection = uniqueById(
      Array.isArray(v.collection) ? v.collection.map(parseCollected).filter((c): c is CollectedPlant => c !== null) : [],
    );
    const plant = parsePlant(v.plant, ctx) ?? newPlant(ctx, { ...DEFAULT_LOOK }, 'My plant');
    const pri = v.priorities as Record<string, unknown> | undefined;
    const collectedPoints = collection.length * BLOOM_POINTS;
    const lifetime = typeof v.lifetimePoints === 'number' && Number.isFinite(v.lifetimePoints) ? Math.trunc(v.lifetimePoints) : 0;
    state = {
      version: DATA_VERSION,
      // An occurrence whose series is gone becomes an ordinary task.
      tasks: tasks.map((t) => (t.seriesId && !seriesIds.has(t.seriesId) ? stripSeries(t) : t)),
      series,
      log,
      // Lifetime points can never be less than what the garden and the active plant hold.
      lifetimePoints: Math.max(lifetime, collectedPoints + plant.points),
      plant,
      collection,
      unlocked: Array.isArray(v.unlocked) ? [...new Set(v.unlocked.filter((u): u is string => typeof u === 'string'))].sort() : [],
      priorities: {
        date: isDateKey(pri?.date) ? pri.date : ctx.today,
        ids: Array.isArray(pri?.ids) ? pri.ids.filter((id): id is string => typeof id === 'string').slice(0, MAX_PRIORITIES) : [],
      },
      timer: parseTimer(v.timer),
      settings: parseSettings(v.settings),
    };
  }
  return startDay(state, ctx);
}

function stripSeries(task: Task): Task {
  const { seriesId: _s, occurrenceDate: _o, ...rest } = task;
  return rest;
}

// ---------------------------------------------------------------------------- day changes

/** Drops tasks completed on earlier days; unfinished tasks carry over. */
export function rollover(tasks: Task[], today: string): Task[] {
  const kept = tasks.filter((t) => !t.done || t.completedDate === today);
  return kept.length === tasks.length ? tasks : kept;
}

export function pruneLog(log: CompletionLog, today: string): CompletionLog {
  const oldest = addDays(today, -LOG_DAYS_KEPT);
  const keys = Object.keys(log);
  const kept = keys.filter((k) => k >= oldest);
  return kept.length === keys.length ? log : Object.fromEntries(kept.map((k) => [k, log[k]]));
}

export function adjustLog(log: CompletionLog, date: string, delta: number): CompletionLog {
  const next = { ...log };
  const count = (next[date] ?? 0) + delta;
  if (count > 0) next[date] = count;
  else delete next[date];
  return next;
}

/** Today's pinned task ids, in order: only unfinished tasks that still exist. */
export function todaysPriorities(state: GardenState, today: string): string[] {
  if (state.priorities.date !== today) return [];
  return state.priorities.ids.filter((id) => state.tasks.some((t) => t.id === id && !t.done));
}

/**
 * Brings the garden up to `ctx.today`: drops tasks finished on earlier days, creates due recurring
 * occurrences (see recurrence.ts), clears yesterday's priorities and prunes old history.
 */
export function startDay(state: GardenState, ctx: Ctx): GardenState {
  const generated = generateOccurrences(rollover(state.tasks, ctx.today), state.series, ctx.today, ctx.newId);
  const next: GardenState = { ...state, ...generated, log: pruneLog(state.log, ctx.today) };
  next.priorities = { date: ctx.today, ids: todaysPriorities(next, ctx.today) };
  return withUnlocks(next);
}

// ---------------------------------------------------------------------------- actions

export type Action =
  | { type: 'addTask'; title: string; repeat?: RepeatRule }
  | { type: 'toggleTask'; id: string }
  | { type: 'renameTask'; id: string; title: string }
  | { type: 'deleteTask'; id: string }
  | { type: 'restoreTask'; task: Task; index: number }
  | { type: 'saveDetails'; id: string; details: TaskDetails; repeat?: RepeatRule | null; remindTime?: string | null }
  | { type: 'pin'; id: string; replace?: string }
  | { type: 'unpin'; id: string }
  | { type: 'movePin'; id: string; delta: -1 | 1 }
  | { type: 'collect'; plantId: string; next: Partial<PlantLook> & { name?: string } }
  | { type: 'customize'; patch: Partial<PlantLook> & { name?: string } }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'timerStart'; taskId: string; focusMinutes?: number; breakMinutes?: number }
  | { type: 'timerPause' }
  | { type: 'timerResume' }
  | { type: 'timerBreak' }
  | { type: 'timerStop' }
  | { type: 'startDay' }
  | { type: 'replace'; state: GardenState };

export type Result = { ok: boolean; error?: string; task?: Task; full?: boolean; collected?: CollectedPlant };

type Outcome = { state: GardenState; result: Result };

const ok = (state: GardenState, extra: Partial<Result> = {}): Outcome => ({ state, result: { ok: true, ...extra } });
const fail = (state: GardenState, error: string, extra: Partial<Result> = {}): Outcome => ({
  state,
  result: { ok: false, error, ...extra },
});

/** Adds `delta` growth points earned on `date`, keeping every total in step. */
function award(state: GardenState, delta: number, date: string, ctx: Ctx): GardenState {
  const points = state.plant.points + delta;
  const plant: ActivePlant = { ...state.plant, points };
  if (points >= BLOOM_POINTS) plant.bloomedDate = state.plant.bloomedDate ?? ctx.today;
  else delete plant.bloomedDate;
  return withUnlocks({
    ...state,
    plant,
    lifetimePoints: state.lifetimePoints + delta,
    log: adjustLog(state.log, date, delta > 0 ? 1 : -1),
  });
}

function updateSeries(state: GardenState, id: string | undefined, fn: (s: Series) => Series): GardenState {
  if (!id) return state;
  return { ...state, series: state.series.map((s) => (s.id === id ? fn(s) : s)) };
}

function withoutPriority(state: GardenState, id: string): GardenState {
  if (!state.priorities.ids.includes(id)) return state;
  return { ...state, priorities: { ...state.priorities, ids: state.priorities.ids.filter((p) => p !== id) } };
}

function seriesFrom(task: Task, repeat: RepeatRule, remindTime: string | null | undefined, ctx: Ctx): Series {
  const series: Series = {
    id: ctx.newId(),
    title: task.title,
    repeat: normalizeRepeat(repeat),
    startDate: ctx.today,
    generatedThrough: ctx.today,
    history: [],
  };
  if (task.description) series.description = task.description;
  if (task.priority) series.priority = task.priority;
  if (task.checklist?.length) series.checklist = task.checklist.map((c) => ({ ...c, done: false }));
  if (remindTime && isTimeKey(remindTime)) series.remindTime = remindTime;
  return series;
}

export function reduce(state: GardenState, action: Action, ctx: Ctx): Outcome {
  const { today } = ctx;
  const find = (id: string) => state.tasks.find((t) => t.id === id);

  switch (action.type) {
    case 'addTask': {
      const check = validateTitle(action.title);
      if (!check.ok) return fail(state, check.error);
      if (action.repeat && !isRepeat(action.repeat)) return fail(state, 'Choose the days this task repeats on.');
      let task: Task = { id: ctx.newId(), title: check.title, done: false, createdDate: today };
      let series = state.series;
      if (action.repeat) {
        const s = seriesFrom(task, action.repeat, null, ctx);
        series = [...series, s];
        task = { ...task, seriesId: s.id, occurrenceDate: today };
      }
      return ok({ ...state, tasks: [...state.tasks, task], series }, { task });
    }

    case 'toggleTask': {
      const task = find(action.id);
      if (!task) return fail(state, 'That task is no longer on your list.');
      if (!task.done) {
        const done: Task = { ...task, done: true, completedDate: today };
        let next: GardenState = { ...state, tasks: state.tasks.map((t) => (t.id === task.id ? done : t)) };
        next = award(next, POINTS_PER_TASK, today, ctx);
        next = withoutPriority(next, task.id);
        next = updateSeries(next, task.seriesId, (s) => recordHistory(s, task.occurrenceDate ?? today, 'done'));
        return ok(next, { task: done });
      }
      const { completedDate, ...rest } = task;
      const undone: Task = { ...rest, done: false };
      let next: GardenState = { ...state, tasks: state.tasks.map((t) => (t.id === task.id ? undone : t)) };
      next = award(next, -POINTS_PER_TASK, completedDate ?? today, ctx);
      next = updateSeries(next, task.seriesId, (s) => recordHistory(s, task.occurrenceDate ?? today, null));
      return ok(next, { task: undone });
    }

    case 'renameTask': {
      const task = find(action.id);
      const check = validateTitle(action.title);
      if (!task) return fail(state, 'That task is no longer on your list.');
      if (!check.ok) return fail(state, check.error);
      if (check.title === task.title) return ok(state, { task });
      const renamed = { ...task, title: check.title };
      let next: GardenState = { ...state, tasks: state.tasks.map((t) => (t.id === task.id ? renamed : t)) };
      next = updateSeries(next, task.seriesId, (s) => ({ ...s, title: check.title }));
      return ok(next, { task: renamed });
    }

    case 'deleteTask': {
      const task = find(action.id);
      if (!task) return fail(state, 'That task is no longer on your list.');
      let next: GardenState = withoutPriority({ ...state, tasks: state.tasks.filter((t) => t.id !== task.id) }, task.id);
      if (task.done && task.completedDate) {
        next = award(next, -POINTS_PER_TASK, task.completedDate, ctx);
        next = updateSeries(next, task.seriesId, (s) => recordHistory(s, task.occurrenceDate ?? today, null));
      }
      return ok(next, { task });
    }

    case 'restoreTask': {
      const task = action.task;
      const duplicate = state.tasks.some(
        (t) => t.id === task.id || (task.seriesId && t.seriesId === task.seriesId && t.occurrenceDate === task.occurrenceDate),
      );
      if (duplicate) return fail(state, 'That task is already back on your list.');
      // A task finished on an earlier day belongs to that day's history, not today's list.
      if (task.done && task.completedDate !== today) return fail(state, 'That task belonged to an earlier day.');
      const tasks = [...state.tasks];
      tasks.splice(Math.max(0, Math.min(action.index, tasks.length)), 0, task.seriesId && !state.series.some((s) => s.id === task.seriesId) ? stripSeries(task) : task);
      let next: GardenState = { ...state, tasks };
      if (task.done && task.completedDate) {
        next = award(next, POINTS_PER_TASK, task.completedDate, ctx);
        next = updateSeries(next, task.seriesId, (s) => recordHistory(s, task.occurrenceDate ?? today, 'done'));
      }
      return ok(next, { task });
    }

    case 'saveDetails': {
      const task = find(action.id);
      if (!task) return fail(state, 'That task is no longer on your list.');
      const check = validateTitle(action.details.title);
      if (!check.ok) return fail(state, check.error);
      if (action.repeat && !isRepeat(action.repeat)) return fail(state, 'Choose the days this task repeats on.');
      let updated = withDetails(task, action.details);
      let next: GardenState = state;
      const series = task.seriesId ? state.series.find((s) => s.id === task.seriesId) : undefined;

      if (series && action.repeat === null) {
        // Stop repeating: every copy becomes an ordinary task.
        next = {
          ...next,
          series: next.series.filter((s) => s.id !== series.id),
          tasks: next.tasks.map((t) => (t.seriesId === series.id ? stripSeries(t) : t)),
        };
        updated = stripSeries(updated);
      } else if (series || action.repeat) {
        const remindTime = action.remindTime === undefined ? series?.remindTime : action.remindTime ?? undefined;
        const base: Series = series ?? seriesFrom(updated, action.repeat!, remindTime, ctx);
        const template: Series = {
          ...base,
          title: updated.title,
          repeat: action.repeat ? normalizeRepeat(action.repeat) : base.repeat,
        };
        for (const key of ['description', 'priority', 'checklist', 'remindTime'] as const) delete template[key];
        if (updated.description) template.description = updated.description;
        if (updated.priority) template.priority = updated.priority;
        if (updated.checklist?.length) template.checklist = updated.checklist.map((c) => ({ ...c, done: false }));
        if (remindTime && isTimeKey(remindTime)) template.remindTime = remindTime;
        const date = task.occurrenceDate ?? today;
        updated = { ...updated, seriesId: template.id, occurrenceDate: date };
        delete updated.remindAt;
        if (template.remindTime) updated.remindAt = `${date}T${template.remindTime}`;
        next = { ...next, series: series ? next.series.map((s) => (s.id === series.id ? template : s)) : [...next.series, template] };
      }

      if (JSON.stringify(updated) === JSON.stringify(task) && next === state) return ok(state, { task });
      next = { ...next, tasks: next.tasks.map((t) => (t.id === task.id ? updated : t)) };
      return ok(next, { task: updated });
    }

    case 'pin': {
      const task = find(action.id);
      if (!task || task.done) return fail(state, 'Only unfinished tasks can be pinned.');
      const ids = todaysPriorities(state, today);
      if (ids.includes(task.id)) return ok(state);
      if (ids.length < MAX_PRIORITIES) return ok({ ...state, priorities: { date: today, ids: [...ids, task.id] } });
      if (action.replace && ids.includes(action.replace)) {
        return ok({ ...state, priorities: { date: today, ids: ids.map((id) => (id === action.replace ? task.id : id)) } });
      }
      return fail(state, 'Today’s top three is full.', { full: true });
    }

    case 'unpin': {
      const ids = todaysPriorities(state, today);
      return ok({ ...state, priorities: { date: today, ids: ids.filter((id) => id !== action.id) } });
    }

    case 'movePin': {
      const ids = todaysPriorities(state, today);
      const from = ids.indexOf(action.id);
      const to = from + action.delta;
      if (from < 0 || to < 0 || to >= ids.length) return ok(state);
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      return ok({ ...state, priorities: { date: today, ids: next } });
    }

    case 'collect': {
      const plant = state.plant;
      // Offered for a specific plant: a second click, or a stale window, finds a different plant.
      if (action.plantId !== plant.id) return fail(state, 'That plant is already in your garden.');
      if (stageFor(plant.points) < STAGE_BLOOM) return fail(state, 'Your plant needs to be in full bloom first.');
      const collected: CollectedPlant = {
        id: plant.id,
        name: plant.name,
        species: plant.species,
        pot: plant.pot,
        background: plant.background,
        startedDate: plant.startedDate,
        bloomedDate: plant.bloomedDate ?? today,
        collectedDate: today,
        points: BLOOM_POINTS,
      };
      // Options unlocked by this very collection can be chosen for the new seed.
      const withPlant = withUnlocks({ ...state, collection: [...state.collection, collected] });
      const look = pickLook(withPlant, action.next, plant);
      const name = plantName(action.next.name, `Plant no. ${state.collection.length + 2}`);
      const seed = newPlant(ctx, look, name, plant.points - BLOOM_POINTS);
      if (seed.points >= BLOOM_POINTS) seed.bloomedDate = today;
      const next = { ...withPlant, plant: seed };
      return ok(next, { collected });
    }

    case 'customize': {
      const look = pickLook(state, action.patch, state.plant);
      const name = action.patch.name === undefined ? state.plant.name : plantName(action.patch.name, state.plant.name);
      return ok({ ...state, plant: { ...state.plant, ...look, name } });
    }

    case 'settings': {
      const settings: Settings = {
        focusMinutes: clampMinutes(action.patch.focusMinutes ?? state.settings.focusMinutes, state.settings.focusMinutes),
        breakMinutes: clampMinutes(action.patch.breakMinutes ?? state.settings.breakMinutes, state.settings.breakMinutes),
      };
      return ok({ ...state, settings });
    }

    case 'timerStart': {
      const task = find(action.taskId);
      if (!task) return fail(state, 'That task is no longer on your list.');
      const settings: Settings = {
        focusMinutes: clampMinutes(action.focusMinutes ?? state.settings.focusMinutes, state.settings.focusMinutes),
        breakMinutes: clampMinutes(action.breakMinutes ?? state.settings.breakMinutes, state.settings.breakMinutes),
      };
      return ok({ ...state, settings, timer: startTimer(task.id, task.title, settings, ctx.now) });
    }
    case 'timerPause':
      return ok(state.timer ? { ...state, timer: pauseTimer(state.timer, ctx.now) } : state);
    case 'timerResume':
      return ok(state.timer ? { ...state, timer: resumeTimer(state.timer, ctx.now) } : state);
    case 'timerBreak':
      return ok(state.timer ? { ...state, timer: startBreak(state.timer, ctx.now) } : state);
    case 'timerStop':
      return ok({ ...state, timer: null });

    case 'startDay':
      return ok(startDay(state, ctx));

    case 'replace':
      return ok(startDay(action.state, ctx));
  }
}

const STAGE_BLOOM = stageFor(BLOOM_POINTS);

/** Applies only unlocked options; anything else keeps the current choice. */
function pickLook(state: GardenState, patch: Partial<PlantLook>, current: PlantLook): PlantLook {
  const choose = (kind: OptionKind, id: string | undefined, fallback: string) => {
    if (!id) return fallback;
    const option = findOption(kind, id);
    return option.id === id && isUnlocked(state, kind, option) ? id : fallback;
  };
  return {
    species: choose('species', patch.species, current.species),
    pot: choose('pot', patch.pot, current.pot),
    background: choose('background', patch.background, current.background),
  };
}

// ---------------------------------------------------------------------------- import

export function isEmptyGarden(state: GardenState): boolean {
  return (
    state.tasks.length === 0 &&
    state.series.length === 0 &&
    state.collection.length === 0 &&
    state.plant.points === 0 &&
    state.lifetimePoints === 0 &&
    Object.keys(state.log).length === 0
  );
}

/**
 * Adds what `incoming` has and this garden lacks, removing nothing: tasks, recurring tasks and
 * garden plants are matched by id (the copy here wins), the larger active plant and the higher
 * daily counts are kept, and unlocks are combined. Importing the same file twice changes nothing.
 */
export function combineGardens(current: GardenState, incoming: GardenState, ctx: Ctx): GardenState {
  const taskIds = new Set(current.tasks.map((t) => t.id));
  const occurrenceKeys = new Set(current.tasks.filter((t) => t.seriesId).map((t) => `${t.seriesId}|${t.occurrenceDate}`));
  const tasks = [
    ...current.tasks,
    ...incoming.tasks.filter((t) => !taskIds.has(t.id) && !(t.seriesId && occurrenceKeys.has(`${t.seriesId}|${t.occurrenceDate}`))),
  ];
  const seriesIds = new Set(current.series.map((s) => s.id));
  const series = [...current.series, ...incoming.series.filter((s) => !seriesIds.has(s.id))];
  const collectedIds = new Set(current.collection.map((c) => c.id));
  // A plant can't be both in the garden and growing.
  const collection = [
    ...current.collection,
    ...incoming.collection.filter((c) => !collectedIds.has(c.id) && c.id !== current.plant.id),
  ];
  const inGarden = new Set(collection.map((c) => c.id));

  let plant = current.plant;
  if (incoming.plant.id === current.plant.id) {
    plant = incoming.plant.points > current.plant.points ? { ...current.plant, points: incoming.plant.points, bloomedDate: incoming.plant.bloomedDate } : current.plant;
  } else if (incoming.plant.points > current.plant.points && !inGarden.has(incoming.plant.id)) {
    plant = incoming.plant;
  }

  const log: CompletionLog = { ...current.log };
  for (const [date, count] of Object.entries(incoming.log)) log[date] = Math.max(log[date] ?? 0, count);
  // Every completed task is counted on its day, even if neither log had it yet.
  const doneByDay: CompletionLog = {};
  for (const t of tasks) if (t.done && t.completedDate) doneByDay[t.completedDate] = (doneByDay[t.completedDate] ?? 0) + 1;
  for (const [date, count] of Object.entries(doneByDay)) log[date] = Math.max(log[date] ?? 0, count);

  return startDay(
    {
      ...current,
      tasks,
      series,
      collection,
      plant,
      log,
      lifetimePoints: Math.max(current.lifetimePoints, incoming.lifetimePoints, collection.length * BLOOM_POINTS + plant.points),
      unlocked: [...new Set([...current.unlocked, ...incoming.unlocked])].sort(),
    },
    ctx,
  );
}

/** For tests and the dev tools: a context for "now". */
export function contextFor(now: Date, newId: () => string): Ctx {
  return { today: todayKey(now), now: now.getTime(), newId };
}
