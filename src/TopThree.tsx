import { Modal } from './Modal';
import { MAX_PRIORITIES, type Task } from './storage';

type Props = {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onFocus: (task: Task) => void;
  onUnpin: (task: Task) => void;
  onMove: (task: Task, delta: -1 | 1) => void;
};

export function topThreeId(id: string) {
  return `top-${id}`;
}

/** Today's pinned priorities. Completing one frees its slot; the list resets each day. */
export function TopThree({ tasks, onToggle, onOpen, onFocus, onUnpin, onMove }: Props) {
  const empty = MAX_PRIORITIES - tasks.length;
  return (
    <section className="card top-card" aria-labelledby="top-heading">
      <div className="top-head">
        <h2 id="top-heading">Today’s top three</h2>
        <span className="list-count" aria-label={`${tasks.length} of ${MAX_PRIORITIES} pinned`}>
          {tasks.length}/{MAX_PRIORITIES}
        </span>
      </div>
      <ol className="top-list">
        {tasks.map((task, i) => (
          <li key={task.id} className="top-item">
            <span className="top-rank" aria-hidden="true">
              {i + 1}
            </span>
            <input
              id={topThreeId(task.id)}
              type="checkbox"
              checked={false}
              onChange={() => onToggle(task)}
              aria-label={`Done: ${task.title}`}
            />
            <button type="button" className="top-title" onClick={() => onOpen(task)} aria-haspopup="dialog">
              {task.title}
            </button>
            <div className="top-actions">
              <button type="button" className="btn-chip" onClick={() => onFocus(task)} aria-label={`Focus on: ${task.title}`}>
                <span aria-hidden="true">⏱</span> Focus
              </button>
              <button
                type="button"
                className="btn-icon btn-small"
                onClick={() => onMove(task, -1)}
                disabled={i === 0}
                aria-label={`Move up: ${task.title}`}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="btn-icon btn-small"
                onClick={() => onMove(task, 1)}
                disabled={i === tasks.length - 1}
                aria-label={`Move down: ${task.title}`}
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button type="button" className="btn-icon btn-small" onClick={() => onUnpin(task)} aria-label={`Unpin: ${task.title}`}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="top-item top-empty">
            <span className="top-rank" aria-hidden="true">
              {tasks.length + i + 1}
            </span>
            <span>
              {i === 0 && tasks.length === 0
                ? 'Pin up to three tasks with the star to make them today’s focus.'
                : 'Open slot'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

type ReplaceProps = { task: Task; pinned: Task[]; onReplace: (old: Task) => void; onClose: () => void };

/** All three slots are taken: the user picks which one makes way. */
export function ReplacePinDialog({ task, pinned, onReplace, onClose }: ReplaceProps) {
  return (
    <Modal labelledBy="replace-heading" describedBy="replace-text" onClose={onClose}>
      <h2 id="replace-heading">Today’s top three is full</h2>
      <p id="replace-text">
        Choose a task to swap out for <strong>{task.title}</strong>. It stays on your list.
      </p>
      <ul className="replace-list">
        {pinned.map((p, i) => (
          <li key={p.id}>
            <button type="button" className="btn-secondary replace-option" onClick={() => onReplace(p)}>
              <span className="top-rank" aria-hidden="true">
                {i + 1}
              </span>
              <span className="replace-title">Replace “{p.title}”</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
