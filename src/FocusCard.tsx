import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { MINUTES_MAX, MINUTES_MIN, elapsedMs, formatClock, isFinished, remainingMs } from './model/timer.ts';
import type { Settings, Task, TimerState } from './storage';

type SetupProps = {
  task: Task;
  settings: Settings;
  replacing: TimerState | null;
  onStart: (focusMinutes: number, breakMinutes: number) => void;
  onClose: () => void;
};

/** Start a focus session for a task, with editable durations (remembered for next time). */
export function FocusSetupDialog({ task, settings, replacing, onStart, onClose }: SetupProps) {
  const [focus, setFocus] = useState(String(settings.focusMinutes));
  const [rest, setRest] = useState(String(settings.breakMinutes));
  const valid = (v: string) => Number.isInteger(Number(v)) && Number(v) >= MINUTES_MIN && Number(v) <= MINUTES_MAX;
  const ok = valid(focus) && valid(rest);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ok) onStart(Number(focus), Number(rest));
  }

  return (
    <Modal labelledBy="focus-setup-heading" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2 id="focus-setup-heading">Focus session</h2>
        <p className="focus-setup-task">{task.title}</p>
        <div className="field-row focus-fields">
          <div className="field">
            <label htmlFor="focus-minutes">Focus (minutes)</label>
            <input
              id="focus-minutes"
              type="number"
              inputMode="numeric"
              min={MINUTES_MIN}
              max={MINUTES_MAX}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              aria-invalid={!valid(focus) || undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="break-minutes">Break (minutes)</label>
            <input
              id="break-minutes"
              type="number"
              inputMode="numeric"
              min={MINUTES_MIN}
              max={MINUTES_MAX}
              value={rest}
              onChange={(e) => setRest(e.target.value)}
              aria-invalid={!valid(rest) || undefined}
            />
          </div>
        </div>
        {!ok && (
          <p className="field-error" role="alert">
            Use whole minutes from {MINUTES_MIN} to {MINUTES_MAX}.
          </p>
        )}
        {replacing && (
          <p className="field-hint">This ends your current session for “{replacing.taskTitle}”.</p>
        )}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!ok}>
            Start focus
          </button>
        </div>
      </form>
    </Modal>
  );
}

type CardProps = {
  timer: TimerState;
  now: number;
  task: Task | undefined;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onBreak: () => void;
  onComplete: () => void;
  onFinish: () => void;
};

/** The running session, shown in the plant card. */
export function FocusCard({ timer, now, task, onPause, onResume, onCancel, onBreak, onComplete, onFinish }: CardProps) {
  const finished = isFinished(timer, now);
  const paused = timer.startedAt === null;
  const pct = Math.round((elapsedMs(timer, now) / timer.durationMs) * 100);
  const label = timer.phase === 'focus' ? 'Focus' : 'Break';
  const canComplete = task && !task.done;

  return (
    <section className={`focus-card phase-${timer.phase}`} aria-labelledby="focus-heading">
      <h2 id="focus-heading" className="focus-label">
        {label}
        {paused && !finished && ' · paused'}
      </h2>
      <p className="focus-task">{timer.taskTitle}</p>

      {finished ? (
        <div className="focus-done" role="status">
          {timer.phase === 'focus' ? (
            <>
              <p className="focus-done-title">Session complete 🌿</p>
              <p>{canComplete ? 'Is the task done?' : 'Nice work.'}</p>
              <div className="focus-actions">
                {canComplete && (
                  <button type="button" className="btn-primary" onClick={onComplete}>
                    Mark task done
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={onBreak}>
                  Take a {Math.round(timer.breakMs / 60_000)}-minute break
                </button>
                <button type="button" className="btn-secondary" onClick={onFinish}>
                  Finish
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="focus-done-title">Break’s over</p>
              <div className="focus-actions">
                <button type="button" className="btn-primary" onClick={onFinish}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="focus-clock" aria-hidden="true">
            {formatClock(remainingMs(timer, now))}
          </p>
          {/* Announced once a minute rather than every second. */}
          <p className="visually-hidden" aria-live="polite">
            {Math.ceil(remainingMs(timer, now) / 60_000)} minutes left
          </p>
          <div className="progress focus-progress" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="focus-actions">
            {paused ? (
              <button type="button" className="btn-primary" onClick={onResume}>
                Resume
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={onPause}>
                Pause
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
