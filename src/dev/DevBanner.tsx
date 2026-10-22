import { sampleTasks, type SampleTask } from './sampleTasks';
import './DevBanner.css';

type Props = {
  storageKey: string;
  today: string;
  onAddTasks: (tasks: SampleTask[]) => void;
};

// Must match the production key in storage.ts. Only read here, to count tasks; never written.
const PRODUCTION_STORAGE_KEY = 'desk-garden:v1';

/** Number of production tasks saved for this address in this browser, or null if there are none. */
function productionTaskCount(): number | null {
  try {
    const raw = localStorage.getItem(PRODUCTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tasks?: unknown };
    return Array.isArray(parsed.tasks) ? parsed.tasks.length : 0;
  } catch {
    return null;
  }
}

/** Shown only in development (server and build). Production bundles never include this module. */
export default function DevBanner({ storageKey, onAddTasks }: Props) {
  // import.meta.hot exists only on the live dev server, not in a built bundle.
  const runtime = import.meta.hot ? 'live server' : 'development build';
  const productionTasks = productionTaskCount();

  return (
    <aside className="dev-banner" aria-label="Development environment">
      <span className="dev-badge">Development</span>
      <span className="dev-detail">
        {runtime} · data saved under <code>{storageKey}</code>, separate from production
        {productionTasks !== null && (
          <span className="dev-note">
            Production data is also saved at this address ({productionTasks}{' '}
            {productionTasks === 1 ? 'task' : 'tasks'}). Development never changes it.
          </span>
        )}
      </span>
      <button type="button" className="dev-action" onClick={() => onAddTasks(sampleTasks())}>
        Add sample tasks
      </button>
    </aside>
  );
}
