// Where the garden is saved, per environment. The data model and every change to it live in
// ./model; this file only reads and writes the saved JSON.
import { NewerDataError, emptyGarden, parseState, type Ctx } from './model/garden.ts';
import { todayKey } from './model/dates.ts';
import type { GardenState } from './model/types.ts';

export * from './model/types.ts';
export * from './model/dates.ts';
export {
  DESCRIPTION_MAX,
  MAX_PRIORITIES,
  PLANT_NAME_MAX,
  PRIORITIES,
  TITLE_MAX,
  NewerDataError,
  todaysPriorities,
  validateTitle,
  withDetails,
} from './model/garden.ts';
export { BLOOM_POINTS, BLOOM_STAGE, POINTS_PER_TASK, STAGES, stageFor } from './model/plants.ts';

// Production keeps the original key, so tasks saved before environments existed are production
// data and load exactly as before (older shapes are migrated on load, see parseState).
// Development uses its own key and never reads or writes production's.
// The env value is inlined at build time, so each bundle contains only its own key.
export const STORAGE_KEY =
  import.meta.env.VITE_APP_ENV === 'production' ? 'desk-garden:v1' : 'desk-garden:development:v1';

/** Where the garden is kept: localStorage in a browser, a data file in the desktop app. */
export type Store = { read(): string | null; write(json: string): void };

let store: Store = {
  read: () => localStorage.getItem(STORAGE_KEY),
  write: (json) => localStorage.setItem(STORAGE_KEY, json),
};

/** True when running inside the Desk Garden desktop app (Tauri) rather than a browser. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Must finish before the first loadState(). The desktop app reads its data file from disk,
 * which is asynchronous; the desktop code is only loaded there.
 */
export async function openStore(): Promise<void> {
  if (isDesktop) store = await (await import('./desktop')).openDesktopStore(STORAGE_KEY);
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function currentCtx(): Ctx {
  const now = new Date();
  return { today: todayKey(now), now: now.getTime(), newId };
}

let writable = true;

/**
 * Loads and migrates the saved garden. Unreadable data starts an empty garden, as before. Data
 * saved by a newer app version throws NewerDataError, and saving is switched off so it is never
 * replaced.
 */
export function loadState(): GardenState {
  const ctx = currentCtx();
  let raw: string | null = null;
  try {
    raw = store.read();
  } catch {
    return emptyGarden(ctx);
  }
  if (!raw) return emptyGarden(ctx);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyGarden(ctx);
  }
  try {
    return parseState(parsed, ctx);
  } catch (err) {
    if (err instanceof NewerDataError) writable = false;
    throw err;
  }
}

export function saveState(state: GardenState): void {
  if (!writable) return;
  try {
    store.write(JSON.stringify(state));
  } catch {
    // Storage can be full or blocked (e.g. private mode); the app still works for this session.
  }
}
