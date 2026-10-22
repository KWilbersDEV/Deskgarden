import { NewerDataError, combineGardens as combine, isEmptyGarden, parseState } from './model/garden.ts';
import { currentCtx, isDesktop, type GardenState } from './storage';

/**
 * Bump when the backup layout changes. 1: v1 garden (tasks, points, log). 2: the full garden
 * (repeating tasks, garden shelf, customization, top three, timer, settings). Older backups are
 * migrated on import.
 */
const BACKUP_FORMAT = 2;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class BackupError extends Error {}

export type Backup = { state: GardenState; exportedAt?: string };

export { isEmptyGarden };

export function backupFileName(today: string) {
  return `desk-garden-backup-${today}.json`;
}

export function serializeBackup(state: GardenState): string {
  return JSON.stringify(
    { app: 'desk-garden', format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data: state },
    null,
    2,
  );
}

const NEWER = 'That backup was made by a newer version of Desk Garden. Update the app, then import it again.';

/**
 * Reads an exported backup. A raw saved garden (the value stored in the browser) is accepted too.
 * The data goes through the same validation and migration as saved data.
 */
export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a Desk Garden backup.");
  }
  const file = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  try {
    if (file.app === 'desk-garden') {
      if (typeof file.format !== 'number' || file.format > BACKUP_FORMAT) throw new BackupError(NEWER);
      if (typeof file.data !== 'object' || file.data === null) throw new BackupError("That backup doesn't contain a garden.");
      return {
        state: parseState(file.data, currentCtx()),
        exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : undefined,
      };
    }
    if (Array.isArray(file.tasks)) return { state: parseState(file, currentCtx()) };
  } catch (err) {
    if (err instanceof NewerDataError) throw new BackupError(NEWER);
    throw err;
  }
  throw new BackupError("That file isn't a Desk Garden backup.");
}

/** See combineGardens in the model: adds what's missing, removes nothing, idempotent. */
export function combineGardens(current: GardenState, incoming: GardenState): GardenState {
  return combine(current, incoming, currentCtx());
}

/** Saves a backup file: a save dialog in the desktop app, a download in the browser. */
export async function exportBackup(state: GardenState, today: string): Promise<boolean> {
  const name = backupFileName(today);
  const contents = serializeBackup(state);
  if (isDesktop) return (await import('./desktop')).exportToFile(name, contents);

  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Lets the user pick a backup file and returns its text, or null if they cancel. In the browser
 * this takes the file chosen in a file input; the desktop app shows its own open dialog.
 */
export async function pickBackupText(file?: File): Promise<string | null> {
  if (isDesktop) return (await import('./desktop')).importFromFile();
  if (!file) return null;
  if (file.size > MAX_IMPORT_BYTES) throw new BackupError('That file is too large to be a Desk Garden backup.');
  return file.text();
}
