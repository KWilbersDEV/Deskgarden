import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CollectDialog } from './CollectDialog';
import { FocusCard, FocusSetupDialog } from './FocusCard';
import { Plant, backdropStyle } from './Plant';
import { StageTrack } from './StageTrack';
import { TaskItem, taskCheckboxId, taskTitleId } from './TaskItem';
import { TaskPanel, type SaveDetails } from './TaskPanel';
import { ReplacePinDialog, TopThree, topThreeId } from './TopThree';
import { WeekCard } from './WeekCard';
import { desiredReminders, reminderIdsFor, type Reminder, type ReminderTarget } from './model/reminders.ts';
import { getPlatform } from './platform';
import {
  BLOOM_STAGE,
  POINTS_PER_TASK,
  STAGES,
  STORAGE_KEY,
  TITLE_MAX,
  parseDateKey,
  stageFor,
  todaysPriorities,
  type GardenState,
  type PlantLook,
  type Task,
} from './storage';
import { useGarden, useNow } from './useGarden';
import { CustomizeView } from './views/CustomizeView';
import { GardenView } from './views/GardenView';
import { SettingsView } from './views/SettingsView';

const BURST_MS = 1600;

// Development-only tools. The env value is inlined at build time, so in production this
// condition is a literal `false` and the bundler drops the module (and its CSS) entirely.
const DevBanner =
  import.meta.env.VITE_APP_ENV === 'development' ? lazy(() => import('./dev/DevBanner')) : null;

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'garden', label: 'Garden' },
  { id: 'customize', label: 'Customize' },
  { id: 'settings', label: 'Settings' },
] as const;
type View = (typeof VIEWS)[number]['id'];

function viewFromHash(): View {
  const id = location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.id === id) ? (id as View) : 'today';
}

/** Secondary views live at #/garden, #/customize and #/settings, so Back works in a browser. */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: View) => {
    location.hash = v === 'today' ? '' : `/${v}`;
    setView(v);
  };
  return [view, go];
}

function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const shown = Math.max(0, value);
  const pct = max === 0 ? 0 : Math.round((shown / max) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={shown}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

type Deleted = { task: Task; index: number };

export default function App({ initial }: { initial: GardenState }) {
  const { state, dispatch, today } = useGarden(initial);
  const { tasks, log, plant, series } = state;
  const platform = getPlatform();
  const [view, setView] = useView();
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [growthNote, setGrowthNote] = useState('');
  const [burst, setBurst] = useState(0);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Task | null>(null);
  const [focusSetup, setFocusSetup] = useState<Task | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [dueReminders, setDueReminders] = useState<Reminder[]>([]);
  const focusNext = useRef<string | null>(null);
  const now = useNow(!!state.timer);

  const points = plant.points;
  const shownPoints = Math.max(0, points);
  const stage = stageFor(shownPoints);
  const current = STAGES[stage];
  const next = STAGES[stage + 1];
  const doneCount = tasks.filter((t) => t.done).length;
  const remaining = tasks.length - doneCount;
  const allDone = tasks.length > 0 && doneCount === tasks.length;
  // If the open task disappears (e.g. the day rolls over), the panel simply closes.
  const panelTask = tasks.find((t) => t.id === panelTaskId);
  const carried = tasks.filter((t) => t.createdDate < today);
  const addedToday = tasks.filter((t) => t.createdDate >= today);
  const pinnedIds = todaysPriorities(state, today);
  const pinned = pinnedIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
  const seriesOf = (task: Task) => (task.seriesId ? series.find((s) => s.id === task.seriesId) : undefined);

  // An undo from yesterday could bring back a task that no longer belongs to today.
  useEffect(() => setDeleted(null), [today]);

  // The +1 badge is cleared by a timer rather than by animationend, so it also
  // disappears when reduced motion turns the animation off.
  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(0), BURST_MS);
    return () => clearTimeout(id);
  }, [burst]);

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  // ---- Platform features: reminders, menu bar count, quick-add ----
  // Recurring reminders look two weeks ahead; the schedule is refreshed every half hour too.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30 * 60_000);
    return () => clearInterval(id);
  }, []);
  const reminders = useMemo(() => desiredReminders(state, Date.now()), [state, tick]);
  useEffect(() => platform.syncReminders(reminders), [platform, reminders]);
  useEffect(() => platform.setRemaining(remaining), [platform, remaining]);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(
    () =>
      platform.onQuickAdd((title) => {
        const result = dispatch({ type: 'addTask', title });
        if (result.ok && result.task) setAnnouncement(`Added “${result.task.title}” from the menu bar.`);
        return { ok: result.ok, error: result.error };
      }),
    [platform, dispatch],
  );

  const openTarget = useRef<(target: ReminderTarget) => void>(() => {});
  openTarget.current = (target) => {
    setView('today');
    if ('timer' in target) return;
    // The app may have been opened on a later day: bring the list up to date first.
    dispatch({ type: 'startDay' });
    const list = stateRef.current.tasks;
    const task =
      'taskId' in target
        ? list.find((t) => t.id === target.taskId)
        : list.find((t) => t.seriesId === target.seriesId && t.occurrenceDate === target.date);
    if (task) setPanelTaskId(task.id);
    else setAnnouncement('That task is no longer on your list.');
  };
  useEffect(() => {
    const stopOpen = platform.onReminderOpen((target) => openTarget.current(target));
    const stopDue = platform.onReminderDue((r) => setDueReminders((list) => [...list.filter((x) => x.id !== r.id), r]));
    return () => {
      stopOpen();
      stopDue();
    };
  }, [platform]);

  const dateLabel = parseDateKey(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  /** A sentence about a stage change between two point totals. */
  function stageNote(before: number, after: number) {
    const a = stageFor(Math.max(0, before));
    const b = stageFor(Math.max(0, after));
    if (b > a) {
      setGrowthNote(`Your plant grew into: ${STAGES[b].name}!`);
      return ` Your plant grew into: ${STAGES[b].name}!`;
    }
    if (b < a) {
      setGrowthNote('');
      return ` Your plant shrank back to: ${STAGES[b].name}.`;
    }
    return '';
  }

  function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = dispatch({ type: 'addTask', title: draft });
    if (!result.ok) return;
    setDraft('');
    setAnnouncement(`Added “${result.task!.title}”.`);
  }

  function toggleTask(task: Task) {
    const before = points;
    const completing = !task.done;
    const finishesDay = completing && tasks.every((t) => t.id === task.id || t.done);
    const result = dispatch({ type: 'toggleTask', id: task.id });
    if (!result.ok) return;
    const after = before + (completing ? POINTS_PER_TASK : -POINTS_PER_TASK);
    const total = Math.max(0, after);
    setAnnouncement(
      (completing ? `+${POINTS_PER_TASK} growth point, ${total} in total.` : `Marked “${task.title}” not done, ${total} growth points.`) +
        stageNote(before, after) +
        (finishesDay ? ' All done for today!' : ''),
    );
    if (completing) {
      setBurst((b) => b + 1);
      platform.clearDelivered(reminderIdsFor(task));
    }
  }

  function renameTask(id: string, title: string) {
    const result = dispatch({ type: 'renameTask', id, title });
    if (result.ok) setAnnouncement(`Task renamed to “${result.task!.title}”.`);
  }

  // Deleting a completed task also takes back its completion, so the daily count,
  // week chart and plant stay in step with the list. Undo puts all of it back.
  function deleteTask(task: Task) {
    const index = tasks.findIndex((t) => t.id === task.id);
    const result = dispatch({ type: 'deleteTask', id: task.id });
    if (!result.ok) return;
    const note = task.done ? ` Removed its ${POINTS_PER_TASK} growth point.${stageNote(points, points - POINTS_PER_TASK)}` : '';
    setDeleted({ task, index });
    platform.clearDelivered(reminderIdsFor(task));
    setAnnouncement(`Deleted “${task.title}”.${note}`);
    focusNext.current = 'undo-delete';
  }

  function undoDelete() {
    if (!deleted) return;
    const { task, index } = deleted;
    const result = dispatch({ type: 'restoreTask', task, index });
    setDeleted(null);
    if (!result.ok) {
      setAnnouncement(result.error ?? '');
      focusNext.current = 'new-task';
      return;
    }
    const note = task.done ? ` Its growth point is back.${stageNote(points, points + POINTS_PER_TASK)}` : '';
    setAnnouncement(`Restored “${task.title}”.${note}`);
    focusNext.current = taskCheckboxId(task.id);
  }

  const saveDetails: SaveDetails = (id, details, repeat, remindTime) => {
    const before = tasks.find((t) => t.id === id);
    const result = dispatch({ type: 'saveDetails', id, details, repeat, remindTime });
    if (result.ok && result.task && JSON.stringify(result.task) !== JSON.stringify(before)) {
      setAnnouncement(`Saved changes to “${result.task.title}”.`);
    }
  };

  function closePanel() {
    if (panelTaskId) focusNext.current = taskTitleId(panelTaskId);
    setPanelTaskId(null);
  }

  function dismissUndo() {
    setDeleted(null);
    focusNext.current = 'new-task';
  }

  function togglePin(task: Task) {
    if (pinnedIds.includes(task.id)) {
      dispatch({ type: 'unpin', id: task.id });
      setAnnouncement(`Unpinned “${task.title}”.`);
      return;
    }
    const result = dispatch({ type: 'pin', id: task.id });
    if (result.full) setReplacing(task);
    else if (result.ok) setAnnouncement(`Pinned “${task.title}” to today’s top three.`);
  }

  function replacePin(old: Task) {
    if (!replacing) return;
    dispatch({ type: 'pin', id: replacing.id, replace: old.id });
    setAnnouncement(`Pinned “${replacing.title}” in place of “${old.title}”.`);
    setReplacing(null);
  }

  function startFocus(focusMinutes: number, breakMinutes: number) {
    if (!focusSetup) return;
    dispatch({ type: 'timerStart', taskId: focusSetup.id, focusMinutes, breakMinutes });
    setAnnouncement(`Focus session started: ${focusMinutes} minutes on “${focusSetup.title}”.`);
    setFocusSetup(null);
    setPanelTaskId(null);
    setView('today');
  }

  /** The timer never awards points by itself: this completes the task the normal way. */
  function completeFromTimer() {
    const task = state.timer && tasks.find((t) => t.id === state.timer!.taskId);
    if (task && !task.done) toggleTask(task);
    dispatch({ type: 'timerStop' });
  }

  function collect(nextLook: PlantLook & { name: string }) {
    const result = dispatch({ type: 'collect', plantId: plant.id, next: nextLook });
    setCollecting(false);
    if (result.ok && result.collected) {
      setGrowthNote('');
      setAnnouncement(`${result.collected.name} moved to your garden. Say hello to ${nextLook.name.trim() || 'your new seed'}!`);
    } else if (result.error) {
      setAnnouncement(result.error);
    }
  }

  const renderList = (list: Task[], labelledBy?: string) => (
    <ul className="task-list" aria-labelledby={labelledBy}>
      {list.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          today={today}
          series={seriesOf(task)}
          pinned={pinnedIds.includes(task.id)}
          onPin={togglePin}
          onOpen={(t) => setPanelTaskId(t.id)}
          onToggle={toggleTask}
          onRename={renameTask}
          onDelete={deleteTask}
        />
      ))}
    </ul>
  );

  const timerTask = state.timer ? tasks.find((t) => t.id === state.timer!.taskId) : undefined;

  return (
    <div className="app">
      {DevBanner && (
        <Suspense fallback={null}>
          <DevBanner
            storageKey={STORAGE_KEY}
            today={today}
            onAddTasks={(samples) => {
              for (const t of samples) dispatch({ type: 'addTask', title: t.title, repeat: t.repeat });
              setAnnouncement(`Added ${samples.length} sample tasks.`);
            }}
          />
        </Suspense>
      )}
      <header className="app-header">
        <h1>
          Desk Garden <span aria-hidden="true">🌱</span>
        </h1>
        <p className="date">{dateLabel}</p>
        <nav className="app-nav" aria-label="Views">
          {VIEWS.map((v) => (
            <a
              key={v.id}
              href={v.id === 'today' ? '#' : `#/${v.id}`}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                setView(v.id);
              }}
            >
              {v.label}
            </a>
          ))}
        </nav>
      </header>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <p id="edit-help" className="visually-hidden">
        Press Enter to save or Escape to cancel.
      </p>

      {dueReminders.length > 0 && (
        <div className="reminder-toasts" role="alert">
          {dueReminders.map((r) => (
            <div key={r.id} className="reminder-toast">
              <span aria-hidden="true">⏰</span>
              <span className="reminder-toast-text">
                <strong>Reminder:</strong> {r.title}
              </span>
              <button
                type="button"
                className="btn-undo"
                onClick={() => {
                  setDueReminders((list) => list.filter((x) => x.id !== r.id));
                  openTarget.current(r.target);
                }}
              >
                Open
              </button>
              <button
                type="button"
                className="btn-icon"
                aria-label={`Dismiss reminder: ${r.title}`}
                onClick={() => setDueReminders((list) => list.filter((x) => x.id !== r.id))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {view === 'garden' && <GardenView state={state} />}
      {view === 'customize' && <CustomizeView state={state} onCustomize={(patch) => dispatch({ type: 'customize', patch })} />}
      {view === 'settings' && (
        <SettingsView
          state={state}
          today={today}
          onSettings={(patch) => dispatch({ type: 'settings', patch })}
          onReplace={(nextState) => {
            dispatch({ type: 'replace', state: nextState });
            setDeleted(null);
            setPanelTaskId(null);
          }}
        />
      )}

      {view === 'today' && (
        <main className="layout">
          <section className="card plant-card" aria-labelledby="plant-heading">
            <h2 id="plant-heading">{plant.name}</h2>
            <div className={`plant-frame${state.timer ? ' is-focusing' : ''}`} style={backdropStyle(plant)}>
              {burst > 0 && <span key={`glow-${burst}`} className="growth-glow" aria-hidden="true" />}
              <Plant stage={stage} look={plant} label={`${plant.name}: ${current.name}, stage ${stage + 1} of ${STAGES.length}.`} />
              {burst > 0 && (
                <span key={`burst-${burst}`} className="growth-burst" aria-hidden="true">
                  +{POINTS_PER_TASK} <span className="burst-leaf">🌱</span>
                </span>
              )}
            </div>

            {state.timer && (
              <FocusCard
                timer={state.timer}
                now={now}
                task={timerTask}
                onPause={() => dispatch({ type: 'timerPause' })}
                onResume={() => dispatch({ type: 'timerResume' })}
                onCancel={() => {
                  dispatch({ type: 'timerStop' });
                  setAnnouncement('Focus session cancelled.');
                }}
                onBreak={() => dispatch({ type: 'timerBreak' })}
                onComplete={completeFromTimer}
                onFinish={() => dispatch({ type: 'timerStop' })}
              />
            )}

            <p className="stage-name">
              {current.name}
              <span className="stage-count">
                Stage {stage + 1} of {STAGES.length}
              </span>
            </p>
            <p className="stage-hint">{growthNote || current.hint}</p>

            {next ? (
              <div className="meter">
                <div className="meter-label">
                  <span>Growth</span>
                  <span>
                    {shownPoints} / {next.min} pts
                  </span>
                </div>
                <ProgressBar label={`Growth toward ${next.name}`} value={points} max={next.min} />
                <p className="meter-note">
                  {next.min - shownPoints} more to reach <strong>{next.name}</strong>
                  {points < 0 && ` (after ${-points} owed)`}
                </p>
              </div>
            ) : (
              <div className="bloom-ready">
                <p className="meter-note">{points} growth points. Fully grown! 🌸</p>
                <button type="button" className="btn-primary" onClick={() => setCollecting(true)}>
                  Move to garden
                </button>
              </div>
            )}

            <StageTrack stage={stage} look={plant} />
          </section>

          <div className="side-column">
            {(tasks.some((t) => !t.done) || pinned.length > 0) && (
              <TopThree
                tasks={pinned}
                onToggle={(t) => toggleTask(t)}
                onOpen={(t) => setPanelTaskId(t.id)}
                onFocus={(t) => setFocusSetup(t)}
                onUnpin={(t) => togglePin(t)}
                onMove={(t, delta) => {
                  dispatch({ type: 'movePin', id: t.id, delta });
                  focusNext.current = topThreeId(t.id);
                }}
              />
            )}

            <section className="card tasks-card" aria-labelledby="tasks-heading">
              <h2 id="tasks-heading">Today's tasks</h2>

              <form className="add-form" onSubmit={addTask}>
                <label htmlFor="new-task" className="visually-hidden">
                  New task
                </label>
                <input
                  id="new-task"
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add a task and press Enter"
                  maxLength={TITLE_MAX}
                  autoComplete="off"
                  enterKeyHint="done"
                />
                <button type="submit" className="btn-primary" disabled={!draft.trim()}>
                  Add task
                </button>
              </form>

              <div className="meter">
                <div className="meter-label">
                  <span>Done today</span>
                  <span>
                    {doneCount} of {tasks.length}
                  </span>
                </div>
                <ProgressBar label="Tasks completed today" value={doneCount} max={tasks.length} />
              </div>

              {allDone && (
                <div className="all-done">
                  <span className="all-done-icon" aria-hidden="true">
                    🌼
                  </span>
                  <div>
                    <p className="all-done-title">All done for today!</p>
                    <p className="all-done-text">Your plant is soaking up the sunshine. Enjoy the rest of your day.</p>
                  </div>
                </div>
              )}

              {deleted && (
                <div className="undo-bar">
                  <span className="undo-text">
                    Deleted “<span className="undo-title">{deleted.task.title}</span>”
                  </span>
                  <button id="undo-delete" type="button" className="btn-undo" onClick={undoDelete}>
                    Undo
                  </button>
                  <button type="button" className="btn-icon" onClick={dismissUndo} aria-label="Dismiss undo">
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              )}

              {tasks.length === 0 ? (
                <p className="empty">No tasks yet. Add one above and give your plant something to grow on.</p>
              ) : carried.length === 0 ? (
                renderList(addedToday)
              ) : (
                <>
                  <h3 id="carried-heading" className="list-heading">
                    Carried over <span className="list-count">{carried.length}</span>
                  </h3>
                  {renderList(carried, 'carried-heading')}
                  <h3 id="today-heading" className="list-heading">
                    Added today <span className="list-count">{addedToday.length}</span>
                  </h3>
                  {addedToday.length > 0 ? (
                    renderList(addedToday, 'today-heading')
                  ) : (
                    <p className="empty empty-small">Nothing new yet today.</p>
                  )}
                </>
              )}
            </section>

            <WeekCard log={log} today={today} />
          </div>
        </main>
      )}

      {panelTask && (
        <TaskPanel
          key={panelTask.id}
          task={panelTask}
          today={today}
          series={seriesOf(panelTask)}
          pinned={pinnedIds.includes(panelTask.id)}
          onSave={saveDetails}
          onPin={() => togglePin(panelTask)}
          onFocus={() => setFocusSetup(panelTask)}
          onClose={closePanel}
        />
      )}
      {replacing && <ReplacePinDialog task={replacing} pinned={pinned} onReplace={replacePin} onClose={() => setReplacing(null)} />}
      {focusSetup && (
        <FocusSetupDialog
          task={focusSetup}
          settings={state.settings}
          replacing={state.timer}
          onStart={startFocus}
          onClose={() => setFocusSetup(null)}
        />
      )}
      {collecting && stage === BLOOM_STAGE && <CollectDialog state={state} onCollect={collect} onClose={() => setCollecting(false)} />}

      <footer className="app-footer">
        <p>Each finished task gives your plant {POINTS_PER_TASK} growth point. Unfinished tasks carry over to tomorrow.</p>
      </footer>
    </div>
  );
}
