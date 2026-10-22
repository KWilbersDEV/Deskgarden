// Desktop-only features behind one interface, so the app never calls a Tauri API in a browser.
//
// Reminders
// - Desktop app: scheduled with macOS (UserNotifications), so they arrive while the window is
//   closed and even after the app has quit. Clicking one opens the task.
// - Browser: shown with the Web Notification API while a Desk Garden tab is open (any tab, even in
//   the background). If notifications are blocked, an in-app reminder appears instead. Nothing
//   arrives once the tab is closed.
// Menu bar item and quick-add: desktop app only.
import type { Reminder, ReminderTarget } from './model/reminders.ts';
import { isDesktop } from './storage';

export type NotificationStatus = 'granted' | 'denied' | 'default' | 'unavailable';

export type Platform = {
  kind: 'desktop' | 'browser';
  /** Whether reminders can still arrive after this window or tab is closed. */
  remindersWhenClosed: boolean;
  notificationStatus(): Promise<NotificationStatus>;
  requestNotifications(): Promise<NotificationStatus>;
  /** Replaces everything scheduled with exactly this list. */
  syncReminders(reminders: Reminder[]): void;
  /** Called when the user clicks a reminder (or the app was opened by one). */
  onReminderOpen(handler: (target: ReminderTarget) => void): () => void;
  /** Browser only: a reminder came due but system notifications aren't allowed. */
  onReminderDue(handler: (reminder: Reminder) => void): () => void;
  /** Removes delivered notifications for a task that's finished or gone. */
  clearDelivered(ids: string[]): void;
  /** Menu bar item (desktop): the remaining-task count. */
  setRemaining(count: number): void;
  /** Menu bar quick-add (desktop): the handler adds the task and reports the outcome. */
  onQuickAdd(handler: (title: string) => { ok: boolean; error?: string }): () => void;
  hasMenuBar: boolean;
};

// Longest delay setTimeout supports (~24.8 days); later reminders are scheduled on a later sync.
const MAX_TIMEOUT = 2 ** 31 - 1;

function browserPlatform(): Platform {
  const timers = new Map<string, number>();
  const openHandlers = new Set<(target: ReminderTarget) => void>();
  const dueHandlers = new Set<(reminder: Reminder) => void>();
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  function show(reminder: Reminder) {
    if (supported && Notification.permission === 'granted') {
      // The tag makes the system replace rather than stack a reminder shown by two open tabs.
      const n = new Notification(reminder.title, { body: reminder.body, tag: reminder.id, icon: '/favicon.svg' });
      n.onclick = () => {
        window.focus();
        openHandlers.forEach((h) => h(reminder.target));
        n.close();
      };
    } else {
      dueHandlers.forEach((h) => h(reminder));
    }
  }

  return {
    kind: 'browser',
    remindersWhenClosed: false,
    hasMenuBar: false,
    async notificationStatus() {
      return supported ? Notification.permission : 'unavailable';
    },
    async requestNotifications() {
      if (!supported) return 'unavailable';
      if (Notification.permission !== 'default') return Notification.permission;
      return Notification.requestPermission();
    },
    syncReminders(reminders) {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      const now = Date.now();
      for (const r of reminders) {
        const delay = r.at - now;
        if (delay > 0 && delay <= MAX_TIMEOUT) timers.set(r.id, window.setTimeout(() => show(r), delay));
      }
    },
    onReminderOpen(handler) {
      openHandlers.add(handler);
      return () => openHandlers.delete(handler);
    },
    onReminderDue(handler) {
      dueHandlers.add(handler);
      return () => dueHandlers.delete(handler);
    },
    clearDelivered() {},
    setRemaining() {},
    onQuickAdd() {
      return () => {};
    },
  };
}

let platform: Platform = browserPlatform();

/** Call once before rendering. The desktop bridge is only loaded inside the app. */
export async function initPlatform(): Promise<void> {
  if (isDesktop) platform = await (await import('./desktop')).desktopPlatform();
}

export function getPlatform(): Platform {
  return platform;
}
