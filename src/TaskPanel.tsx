import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import {
  DESCRIPTION_MAX,
  PRIORITIES,
  TITLE_MAX,
  newId,
  parseDateKey,
  toDateTimeKey,
  weekdayOf,
  type ChecklistItem,
  type Priority,
  type RepeatRule,
  type Series,
  type Task,
  type TaskDetails,
} from './storage';
import { autosize } from './autosize';
import { WEEK_ORDER, describeRepeat, weekdayName } from './model/recurrence.ts';
import { getPlatform, type NotificationStatus } from './platform';
import { notificationMessage } from './views/SettingsView';

export type SaveDetails = (id: string, details: TaskDetails, repeat: RepeatRule | null | undefined, remindTime: string | null | undefined) => void;

type Props = {
  task: Task;
  today: string;
  series?: Series;
  pinned: boolean;
  onSave: SaveDetails;
  onPin: () => void;
  onFocus: () => void;
  /** Called once the panel has closed, whether or not anything was saved. */
  onClose: () => void;
};

type RepeatKind = 'none' | RepeatRule['kind'];

type Draft = {
  title: string;
  description: string;
  dueDate: string;
  priority: Priority | '';
  checklist: ChecklistItem[];
  repeat: RepeatKind;
  weeklyDay: number;
  weekdays: number[];
  remind: boolean;
  remindAt: string;
  remindTime: string;
};

/** The next whole hour, as a starting suggestion for a reminder. */
function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDateTimeKey(d);
}

const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

function draftFrom(task: Task, series: Series | undefined, today: string): Draft {
  const rule = series?.repeat;
  return {
    title: task.title,
    description: task.description ?? '',
    dueDate: task.dueDate ?? '',
    priority: task.priority ?? '',
    checklist: task.checklist ?? [],
    repeat: rule?.kind ?? 'none',
    weeklyDay: rule && rule.kind !== 'daily' ? rule.days[0] : weekdayOf(today),
    weekdays: rule && rule.kind === 'weekdays' ? rule.days : [1, 2, 3, 4, 5],
    remind: series ? !!series.remindTime : !!task.remindAt,
    remindAt: task.remindAt ?? nextHour(),
    remindTime: series?.remindTime ?? task.remindAt?.split('T')[1] ?? '09:00',
  };
}

function ruleFrom(draft: Draft): RepeatRule | null {
  if (draft.repeat === 'none') return null;
  if (draft.repeat === 'daily') return { kind: 'daily' };
  if (draft.repeat === 'weekly') return { kind: 'weekly', days: [draft.weeklyDay] };
  return { kind: 'weekdays', days: draft.weekdays };
}

function formatDate(key: string) {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TaskPanel({ task, today, series, pinned, onSave, onPin, onFocus, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [original] = useState(() => draftFrom(task, series, today));
  const [notify, setNotify] = useState<NotificationStatus | null>(null);
  const platform = getPlatform();
  const [draft, setDraft] = useState(original);
  const [newItem, setNewItem] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || newItem.trim() !== '';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // showModal makes the rest of the page inert and keeps Tab inside the panel.
    if (!dialog.open) dialog.showModal();
    // The field can only be measured once the dialog is showing.
    autosize(titleRef.current);
    titleRef.current?.focus();
    return () => dialog.close();
  }, []);

  // Also warn when leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (confirmingDiscard) keepEditingRef.current?.focus();
  }, [confirmingDiscard]);

  // The title field grows with its text so long titles stay fully visible.
  useLayoutEffect(() => autosize(titleRef.current), [draft.title]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setConfirmingDiscard(false);
  }

  // Ask for notification permission the first time a reminder is switched on.
  async function setRemind(on: boolean) {
    update('remind', on);
    if (!on) return;
    let status = await platform.notificationStatus().catch(() => 'unavailable' as const);
    if (status === 'default') status = await platform.requestNotifications().catch(() => 'unavailable' as const);
    setNotify(status);
  }

  useEffect(() => {
    if (original.remind) platform.notificationStatus().then(setNotify, () => setNotify('unavailable'));
  }, [original.remind, platform]);

  function requestClose() {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  }

  function keepEditing() {
    setConfirmingDiscard(false);
    titleRef.current?.focus();
  }

  function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.title.trim()) {
      setTitleError(true);
      setConfirmingDiscard(false);
      titleRef.current?.focus();
      return;
    }
    if (draft.repeat === 'weekdays' && draft.weekdays.length === 0) {
      document.getElementById('repeat-days')?.querySelector('input')?.focus();
      return;
    }
    // A subtask typed but not yet added is kept rather than silently lost.
    const pending = newItem.trim();
    const checklist = pending ? [...draft.checklist, { id: newId(), text: pending, done: false }] : draft.checklist;
    const rule = ruleFrom(draft);
    onSave(
      task.id,
      {
        title: draft.title,
        description: draft.description,
        dueDate: draft.dueDate || undefined,
        priority: draft.priority || undefined,
        checklist,
        remindAt: !rule && draft.remind ? draft.remindAt : undefined,
      },
      // undefined: leave as is; null: stop repeating.
      rule ?? (series ? null : undefined),
      rule ? (draft.remind ? draft.remindTime : null) : undefined,
    );
    onClose();
  }

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    update('checklist', [...draft.checklist, { id: newId(), text, done: false }]);
    setNewItem('');
  }

  function onDialogKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Escape') return;
    // Handle Escape ourselves so the browser never closes the dialog behind our back.
    e.preventDefault();
    if (confirmingDiscard) keepEditing();
    else requestClose();
  }

  function onDialogClick(e: MouseEvent<HTMLDialogElement>) {
    // Clicks on the backdrop land on the dialog element itself, outside its box.
    if (e.target !== dialogRef.current) return;
    const r = dialogRef.current.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) requestClose();
  }

  const done = draft.checklist.filter((c) => c.done).length;
  const carried = task.createdDate < today;

  return (
    <dialog
      ref={dialogRef}
      className="panel"
      aria-labelledby="panel-heading"
      onKeyDown={onDialogKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={onDialogClick}
    >
      <form className="panel-form" onSubmit={save} noValidate>
        <header className="panel-header">
          <span className="panel-grip" aria-hidden="true" />
          <h2 id="panel-heading">Task details</h2>
          <button type="button" className="btn-icon" onClick={requestClose} aria-label="Close details">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="panel-body">
          <p className={`panel-status${task.done ? ' is-done' : ''}`}>
            <span aria-hidden="true">{task.done ? '✓' : '○'}</span>
            {task.done && task.completedDate
              ? `Completed ${task.completedDate === today ? 'today' : formatDate(task.completedDate)}`
              : 'Not done yet'}
          </p>
          <p className="panel-meta">
            Added {task.createdDate === today ? 'today' : formatDate(task.createdDate)}
            {carried && ' · carried over'}
          </p>
          {!task.done && (
            <div className="panel-quick">
              <button type="button" className="btn-chip" onClick={onPin} aria-pressed={pinned}>
                <span aria-hidden="true">{pinned ? '★' : '☆'}</span> {pinned ? 'In today’s top three' : 'Pin to top three'}
              </button>
              <button type="button" className="btn-chip" onClick={onFocus}>
                <span aria-hidden="true">⏱</span> Start focus session
              </button>
            </div>
          )}

          <div className="field">
            <label htmlFor="panel-title">Title</label>
            <textarea
              ref={titleRef}
              id="panel-title"
              className="panel-title-field"
              rows={1}
              value={draft.title}
              maxLength={TITLE_MAX}
              aria-invalid={titleError || undefined}
              aria-describedby={titleError ? 'panel-title-error' : undefined}
              onChange={(e) => {
                // Titles are single-line: pasted line breaks become spaces.
                const value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
                update('title', value);
                if (value.trim()) setTitleError(false);
              }}
              onKeyDown={(e) => {
                // Enter saves, as it would in a single-line field.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {titleError && (
              <p id="panel-title-error" className="field-error">
                Give the task a title before saving.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="panel-description">
              Description <span className="optional">optional</span>
            </label>
            <textarea
              id="panel-description"
              rows={4}
              value={draft.description}
              maxLength={DESCRIPTION_MAX}
              placeholder="Notes, links, anything useful…"
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="panel-due">
                Due date <span className="optional">optional</span>
              </label>
              <input
                id="panel-due"
                type="date"
                value={draft.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </div>

            <fieldset className="field priority">
              <legend>
                Priority <span className="optional">optional</span>
              </legend>
              <div className="segmented">
                {(['', ...PRIORITIES] as const).map((p) => (
                  <label key={p || 'none'} className={`segment${p ? ` p-${p}` : ''}`}>
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={draft.priority === p}
                      onChange={() => update('priority', p)}
                    />
                    <span>{p ? PRIORITY_LABEL[p] : 'None'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="field repeat">
            <legend>
              Repeat <span className="optional">optional</span>
            </legend>
            <div className="repeat-row">
              <label htmlFor="panel-repeat" className="visually-hidden">
                Repeat
              </label>
              <select id="panel-repeat" value={draft.repeat} onChange={(e) => update('repeat', e.target.value as RepeatKind)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="weekdays">On selected days</option>
              </select>
              {draft.repeat === 'weekly' && (
                <>
                  <label htmlFor="panel-weekly-day" className="visually-hidden">
                    Day of the week
                  </label>
                  <select id="panel-weekly-day" value={draft.weeklyDay} onChange={(e) => update('weeklyDay', Number(e.target.value))}>
                    {WEEK_ORDER.map((d) => (
                      <option key={d} value={d}>
                        on {weekdayName(d)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {draft.repeat === 'weekdays' && (
              <div id="repeat-days" className="day-toggles" role="group" aria-label="Repeat on">
                {WEEK_ORDER.map((d) => (
                  <label key={d} className="day-toggle">
                    <input
                      type="checkbox"
                      checked={draft.weekdays.includes(d)}
                      onChange={(e) =>
                        update('weekdays', e.target.checked ? [...draft.weekdays, d] : draft.weekdays.filter((x) => x !== d))
                      }
                    />
                    <span aria-hidden="true">{weekdayName(d, 'short')}</span>
                    <span className="visually-hidden">{weekdayName(d)}</span>
                  </label>
                ))}
              </div>
            )}
            {draft.repeat === 'weekdays' && draft.weekdays.length === 0 && (
              <p className="field-error">Pick at least one day.</p>
            )}
            {ruleFrom(draft) && (
              <p className="field-hint">
                {describeRepeat(ruleFrom(draft)!)}. Each day gets its own copy. A missed copy waits, marked missed, until the next
                day it’s due.
              </p>
            )}
            {series && series.history.length > 0 && (
              <p className="field-hint repeat-history">
                Last {Math.min(series.history.length, 10)}:{' '}
                {series.history.slice(-10).map((h) => (
                  <span key={h.date} className={`history-dot ${h.status}`} title={`${h.date}: ${h.status}`}>
                    <span className="visually-hidden">
                      {parseDateKey(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {h.status}
                    </span>
                  </span>
                ))}
                {' '}
                {series.history.filter((h) => h.status === 'done').length} done, {series.history.filter((h) => h.status === 'missed').length} missed
              </p>
            )}
          </fieldset>

          <fieldset className="field reminder">
            <legend>
              Reminder <span className="optional">optional</span>
            </legend>
            <label className="inline-check">
              <input type="checkbox" checked={draft.remind} onChange={(e) => void setRemind(e.target.checked)} />
              {ruleFrom(draft) ? 'Remind me on each day it’s due' : 'Remind me'}
            </label>
            {draft.remind &&
              (ruleFrom(draft) ? (
                <div className="field">
                  <label htmlFor="panel-remind-time">At</label>
                  <input id="panel-remind-time" type="time" value={draft.remindTime} onChange={(e) => update('remindTime', e.target.value)} required />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="panel-remind-at">On</label>
                  <input id="panel-remind-at" type="datetime-local" value={draft.remindAt} onChange={(e) => update('remindAt', e.target.value)} required />
                  {draft.remindAt && new Date(draft.remindAt).getTime() <= Date.now() && (
                    <p className="field-hint">That time has passed, so no reminder will be sent.</p>
                  )}
                </div>
              ))}
            {draft.remind && notify && <p className="field-hint">{notificationMessage(notify, platform.kind === 'desktop')}</p>}
          </fieldset>

          <fieldset className="field checklist">
            <legend>
              Checklist{' '}
              {draft.checklist.length > 0 && (
                <span className="optional">
                  {done} of {draft.checklist.length} done
                </span>
              )}
            </legend>
            <p className="field-hint">Subtasks help you track progress. Only finishing the task itself grows your plant.</p>

            {draft.checklist.length > 0 && (
              <ul className="checklist-items">
                {draft.checklist.map((item) => (
                  <li key={item.id} className={item.done ? 'done' : undefined}>
                    <input
                      id={`sub-${item.id}`}
                      type="checkbox"
                      checked={item.done}
                      onChange={() =>
                        update(
                          'checklist',
                          draft.checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)),
                        )
                      }
                    />
                    <label htmlFor={`sub-${item.id}`}>{item.text}</label>
                    <button
                      type="button"
                      className="btn-icon btn-delete"
                      aria-label={`Remove subtask: ${item.text}`}
                      onClick={() => {
                        update('checklist', draft.checklist.filter((c) => c.id !== item.id));
                        document.getElementById('panel-new-item')?.focus();
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="checklist-add">
              <label htmlFor="panel-new-item" className="visually-hidden">
                New subtask
              </label>
              <input
                id="panel-new-item"
                type="text"
                value={newItem}
                maxLength={TITLE_MAX}
                placeholder="Add a subtask"
                autoComplete="off"
                onChange={(e) => {
                  setNewItem(e.target.value);
                  setConfirmingDiscard(false);
                }}
                onKeyDown={(e) => {
                  // Enter adds the subtask here instead of saving the whole form.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addItem();
                  }
                }}
              />
              <button type="button" className="btn-secondary" onClick={addItem} disabled={!newItem.trim()}>
                Add
              </button>
            </div>
          </fieldset>
        </div>

        {confirmingDiscard && (
          <div className="discard-warning" role="alert">
            <p>You have unsaved changes. Close without saving?</p>
            <div className="discard-actions">
              <button ref={keepEditingRef} type="button" className="btn-secondary" onClick={keepEditing}>
                Keep editing
              </button>
              <button type="button" className="btn-danger" onClick={onClose}>
                Discard changes
              </button>
            </div>
          </div>
        )}

        <footer className="panel-footer">
          <button type="button" className="btn-secondary" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
