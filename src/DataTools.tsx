import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BackupError, combineGardens, exportBackup, isEmptyGarden, parseBackup, pickBackupText, type Backup } from './backup';
import { isDesktop, type GardenState } from './storage';

type Props = {
  state: GardenState;
  today: string;
  onReplace: (state: GardenState) => void;
};

type Note = { kind: 'ok' | 'error'; text: string };

function describe(state: GardenState) {
  const tasks = `${state.tasks.length} ${state.tasks.length === 1 ? 'task' : 'tasks'}`;
  const points = `${state.lifetimePoints} growth ${state.lifetimePoints === 1 ? 'point' : 'points'}`;
  const plants = state.collection.length ? `, ${state.collection.length} garden ${state.collection.length === 1 ? 'plant' : 'plants'}` : '';
  return `${tasks}${plants} and ${points}`;
}

const isEmpty = isEmptyGarden;

/** Export and import, for backups and for moving a garden between the browser, the desktop app and devices. */
export function DataTools({ state, today, onReplace }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  useEffect(() => {
    if (pending) dialogRef.current?.showModal();
  }, [pending]);

  async function onExport() {
    setNote(null);
    try {
      if (await exportBackup(state, today)) {
        setNote({ kind: 'ok', text: `Exported ${describe(state)}.` });
      }
    } catch (err) {
      setNote({ kind: 'error', text: `Export failed: ${String(err)}` });
    }
  }

  function onImportClick() {
    setNote(null);
    // The browser picks the file through the hidden input; the desktop app has its own dialog.
    if (isDesktop) void readBackup();
    else fileRef.current?.click();
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (file) void readBackup(file);
  }

  async function readBackup(file?: File) {
    try {
      const text = await pickBackupText(file);
      if (text === null) return;
      const backup = parseBackup(text);
      if (isEmpty(backup.state)) {
        setNote({ kind: 'error', text: 'That backup has no tasks or growth to import.' });
      } else if (isEmpty(state)) {
        apply(backup.state, `Imported ${describe(backup.state)}.`);
      } else {
        setPending(backup);
      }
    } catch (err) {
      setNote({ kind: 'error', text: err instanceof BackupError ? err.message : `Import failed: ${String(err)}` });
    }
  }

  function apply(next: GardenState, message: string) {
    onReplace(next);
    setNote({ kind: 'ok', text: message });
  }

  function closeDialog() {
    dialogRef.current?.close();
    setPending(null);
    importButtonRef.current?.focus();
  }

  function choose(how: 'combine' | 'replace') {
    if (!pending) return;
    if (how === 'combine') {
      const combined = combineGardens(state, pending.state);
      const added = combined.tasks.length - state.tasks.length;
      apply(combined, `Combined: added ${added} ${added === 1 ? 'task' : 'tasks'}. Nothing was removed.`);
    } else {
      apply(pending.state, `Replaced this garden with ${describe(pending.state)}.`);
    }
    closeDialog();
  }

  const exportedOn = pending?.exportedAt
    ? new Date(pending.exportedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <section className="data-tools" aria-labelledby="data-heading">
      <h2 id="data-heading">Your data</h2>
      <p className="data-hint">
        Save a backup of everything (tasks, repeating tasks, your garden, customization and settings), or move your garden
        between the browser, the desktop app and other devices.
      </p>
      <div className="data-actions">
        <button type="button" className="btn-secondary" onClick={onExport}>
          Export data…
        </button>
        <button ref={importButtonRef} type="button" className="btn-secondary" onClick={onImportClick}>
          Import data…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFileChosen}
        />
      </div>
      {note && (
        <p className={`data-note${note.kind === 'error' ? ' is-error' : ''}`} role={note.kind === 'error' ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}

      {pending && (
        <dialog
          ref={dialogRef}
          className="modal"
          aria-labelledby="import-heading"
          aria-describedby="import-summary"
          onCancel={(e) => {
            e.preventDefault();
            closeDialog();
          }}
        >
          <h2 id="import-heading">Import garden data</h2>
          <p id="import-summary">
            The file has <strong>{describe(pending.state)}</strong>
            {exportedOn && <> (exported {exportedOn})</>}. This garden already has{' '}
            <strong>{describe(state)}</strong>.
          </p>
          <div className="modal-choices">
            <div className="modal-choice">
              <button type="button" className="btn-primary" onClick={() => choose('combine')} aria-describedby="combine-help">
                Combine
              </button>
              <p id="combine-help">
                Adds tasks, repeating tasks and garden plants you don't have here yet, and keeps the higher growth. Nothing is
                removed.
              </p>
            </div>
            <div className="modal-choice">
              <button type="button" className="btn-danger" onClick={() => choose('replace')} aria-describedby="replace-help">
                Replace this garden
              </button>
              <p id="replace-help">Everything here is replaced by the file. Export first if you might want it back.</p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={closeDialog}>
              Cancel
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
