import { useEffect, useState } from 'react';
import { DataTools } from '../DataTools';
import { MINUTES_MAX, MINUTES_MIN } from '../model/timer.ts';
import { getPlatform, type NotificationStatus } from '../platform';
import type { GardenState, Settings } from '../storage';

type Props = {
  state: GardenState;
  today: string;
  onSettings: (patch: Partial<Settings>) => void;
  onReplace: (state: GardenState) => void;
};

export function notificationMessage(status: NotificationStatus | null, desktop: boolean): string {
  switch (status) {
    case 'granted':
      return desktop
        ? 'Notifications are on. Reminders arrive even when the window is closed or Desk Garden has quit.'
        : 'Notifications are on. Reminders arrive while a Desk Garden tab is open.';
    case 'denied':
      return desktop
        ? 'Notifications are off for Desk Garden. Turn them on in System Settings › Notifications › Desk Garden.'
        : 'This browser blocks notifications for this site. Reminders show inside Desk Garden while it’s open.';
    case 'default':
      return 'Desk Garden will ask for permission the first time you set a reminder.';
    case 'unavailable':
      return desktop
        ? 'Reminders need the installed app. They aren’t available in desktop development mode.'
        : 'This browser can’t show notifications. Reminders show inside Desk Garden while it’s open.';
    default:
      return 'Checking…';
  }
}

function MinutesField({ id, label, value, onSave }: { id: string; label: string; value: number; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = Number.isInteger(Number(draft)) && Number(draft) >= MINUTES_MIN && Number(draft) <= MINUTES_MAX;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={MINUTES_MIN}
        max={MINUTES_MAX}
        value={draft}
        aria-invalid={!valid || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (valid ? onSave(Number(draft)) : setDraft(String(value)))}
      />
    </div>
  );
}

export function SettingsView({ state, today, onSettings, onReplace }: Props) {
  const platform = getPlatform();
  const desktop = platform.kind === 'desktop';
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  useEffect(() => {
    platform.notificationStatus().then(setStatus, () => setStatus('unavailable'));
  }, [platform]);

  return (
    <div className="view settings">
      <section className="card" aria-labelledby="focus-settings-heading">
        <h2 id="focus-settings-heading">Focus timer</h2>
        <p className="field-hint">Defaults for new focus sessions. You can also change them each time you start one.</p>
        <div className="field-row">
          <MinutesField id="settings-focus" label="Focus (minutes)" value={state.settings.focusMinutes} onSave={(n) => onSettings({ focusMinutes: n })} />
          <MinutesField id="settings-break" label="Break (minutes)" value={state.settings.breakMinutes} onSave={(n) => onSettings({ breakMinutes: n })} />
        </div>
      </section>

      <section className="card" aria-labelledby="reminder-settings-heading">
        <h2 id="reminder-settings-heading">Reminders</h2>
        <p>Set a reminder in a task’s details. Repeating tasks can remind you at the same time on each day they’re due.</p>
        <p className="settings-status" role="status">
          {notificationMessage(status, desktop)}
        </p>
        {status === 'default' && (
          <button type="button" className="btn-secondary" onClick={() => platform.requestNotifications().then(setStatus)}>
            Allow notifications
          </button>
        )}
        <p className="field-hint">
          {desktop
            ? 'macOS delivers reminders on schedule, so they arrive with the window closed or the app quit. Clicking one opens the task. Reminders for repeating tasks are scheduled two weeks ahead and topped up whenever Desk Garden runs.'
            : 'In a browser, reminders only arrive while a Desk Garden tab is open. Install the Mac app to get them with the window closed.'}
        </p>
      </section>

      <section className="card" aria-labelledby="menubar-heading">
        <h2 id="menubar-heading">Menu bar</h2>
        <p>
          {platform.hasMenuBar
            ? 'Desk Garden shows how many of today’s tasks are left in the menu bar. Click it to add a task without opening the window, or to open Desk Garden. Closing the window keeps Desk Garden running there; choose Quit from its menu to quit.'
            : 'The menu bar item, with today’s remaining tasks and a quick-add, is part of the Mac app.'}
        </p>
      </section>

      <section className="card" aria-label="Export and import">
        <DataTools state={state} today={today} onReplace={onReplace} />
      </section>
    </div>
  );
}
