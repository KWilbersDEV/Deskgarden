import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { autosize } from './autosize';
import { describeRepeat } from './model/recurrence.ts';
import { POINTS_PER_TASK, parseDateKey, splitDateTime, type Series, type Task } from './storage';

type Props = {
  task: Task;
  today: string;
  series?: Series;
  pinned: boolean;
  onPin: (task: Task) => void;
  onOpen: (task: Task) => void;
  onToggle: (task: Task) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (task: Task) => void;
};

export function taskCheckboxId(id: string) {
  return `task-${id}`;
}

export function taskTitleId(id: string) {
  return `task-title-${id}`;
}

const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

function dueLabel(dueDate: string, today: string): { text: string; overdue: boolean } {
  if (dueDate === today) return { text: 'Due today', overdue: false };
  const date = parseDateKey(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return dueDate < today ? { text: `Overdue · ${date}`, overdue: true } : { text: `Due ${date}`, overdue: false };
}

export function reminderLabel(remindAt: string, today: string): string {
  const { date, time } = splitDateTime(remindAt);
  const [h, m] = time.split(':').map(Number);
  const clock = new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date === today) return clock;
  return `${parseDateKey(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${clock}`;
}

/** Small summary of the details-panel fields, shown under the title. */
function TaskMeta({ id, task, today, series }: { id: string; task: Task; today: string; series?: Series }) {
  const due = task.dueDate ? dueLabel(task.dueDate, today) : null;
  const checklist = task.checklist ?? [];
  const missed = !task.done && task.occurrenceDate && task.occurrenceDate < today ? task.occurrenceDate : null;
  const reminder = !task.done && task.remindAt ? reminderLabel(task.remindAt, today) : null;
  if (!task.priority && !due && !checklist.length && !task.description && !series && !reminder) return null;
  return (
    <span id={id} className="task-meta">
      {series && (
        <span className="meta-repeat">
          <span aria-hidden="true">↻ </span>
          {describeRepeat(series.repeat)}
        </span>
      )}
      {missed && (
        <span className="meta-due overdue">
          Missed · {parseDateKey(missed).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      )}
      {reminder && (
        <span className="meta-reminder">
          <span aria-hidden="true">⏰ </span>
          <span className="visually-hidden">Reminder at </span>
          {reminder}
        </span>
      )}
      {task.priority && (
        <span className={`meta-pill p-${task.priority}`}>{PRIORITY_LABEL[task.priority]} priority</span>
      )}
      {due && <span className={due.overdue && !task.done ? 'meta-due overdue' : 'meta-due'}>{due.text}</span>}
      {checklist.length > 0 && (
        <span className="meta-checklist">
          {checklist.filter((c) => c.done).length}/{checklist.length} subtasks
        </span>
      )}
      {task.description && <span className="meta-notes">Notes</span>}
    </span>
  );
}

export function TaskItem({ task, today, series, pinned, onPin, onOpen, onToggle, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // Set when Enter/Escape already closed the editor, so the blur that follows is ignored.
  const closingRef = useRef(false);
  // Set when closing the editor should hand focus back to the edit button.
  const restoreFocusRef = useRef(false);

  // Runs right after the editor opens or closes, so focus moves to an element that now exists.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  // Grow the edit field with its text so long titles stay fully visible.
  useLayoutEffect(() => autosize(inputRef.current), [editing, draft]);

  function startEditing() {
    closingRef.current = false;
    setDraft(task.title);
    setEditing(true);
  }

  function finish(save: boolean, restoreFocus: boolean) {
    if (closingRef.current) return;
    closingRef.current = true;
    const title = draft.trim();
    // Only the title changes, so done state and completion date are kept as they are.
    if (save && title && title !== task.title) onRename(task.id, title);
    restoreFocusRef.current = restoreFocus;
    setEditing(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while an IME is composing confirms the characters; it shouldn't save yet.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false, true);
    }
  }

  const checkboxId = taskCheckboxId(task.id);
  const titleId = taskTitleId(task.id);

  return (
    <li
      className={`task${task.done ? ' done' : ''}${editing ? ' editing' : ''}`}
      // Clicking the card's empty space opens the details too; its controls keep their own behaviour.
      onClick={(e) => {
        if (!editing && !(e.target as HTMLElement).closest('button, input, textarea, a, label')) onOpen(task);
      }}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task)}
        aria-labelledby={editing ? undefined : titleId}
        aria-label={editing ? task.title : undefined}
      />

      {editing ? (
        <>
          <textarea
            ref={inputRef}
            className="task-edit"
            rows={1}
            value={draft}
            maxLength={120}
            aria-label={`Edit task: ${task.title}`}
            aria-describedby="edit-help"
            // Titles are single-line: pasted line breaks become spaces.
            onChange={(e) => setDraft(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
            onKeyDown={onKeyDown}
            onBlur={() => finish(true, false)}
          />
          <button
            type="button"
            className="btn-icon btn-save"
            // Keep focus in the input so its blur doesn't close the editor before this click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => finish(true, true)}
          >
            Save
          </button>
        </>
      ) : (
        <>
          <div className="task-main">
            <button
              id={titleId}
              type="button"
              className="task-title"
              aria-haspopup="dialog"
              aria-describedby={`${titleId}-meta ${titleId}-hint`}
              onClick={() => onOpen(task)}
            >
              {task.title}
            </button>
            <span id={`${titleId}-hint`} hidden>
              Opens task details
            </span>
            <TaskMeta id={`${titleId}-meta`} task={task} today={today} series={series} />
          </div>
          {task.done && (
            <span className="points-badge" aria-hidden="true">
              +{POINTS_PER_TASK}
            </span>
          )}
          {!task.done && (
            <button
              type="button"
              className={`btn-icon btn-pin${pinned ? ' is-pinned' : ''}`}
              onClick={() => onPin(task)}
              aria-pressed={pinned}
              aria-label={`Pin to today’s top three: ${task.title}`}
              title={pinned ? 'In today’s top three' : 'Pin to today’s top three'}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" />
              </svg>
            </button>
          )}
          <button
            ref={editButtonRef}
            type="button"
            className="btn-icon"
            onClick={startEditing}
            aria-label={`Edit task: ${task.title}`}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5zm11.7-6.8a.7.7 0 0 0 0-1l-1.4-1.4a.7.7 0 0 0-1 0l-1.1 1.1 2.5 2.5 1-1.2z" />
            </svg>
          </button>
          <button
            type="button"
            className="btn-icon btn-delete"
            onClick={() => onDelete(task)}
            aria-label={`Delete task: ${task.title}`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </>
      )}
    </li>
  );
}
