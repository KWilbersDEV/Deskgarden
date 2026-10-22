// Desktop app only (loaded on demand when running inside Tauri). The Rust side keeps the garden
// in ~/Library/Application Support/<bundle id>/, one file per storage key.
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { targetFromId, type ReminderTarget } from './model/reminders.ts';
import type { NotificationStatus, Platform } from './platform';
import type { Store } from './storage';

export async function openDesktopStore(key: string): Promise<Store> {
  let saved = await invoke<string | null>('load_garden', { key });

  // Saves go out one at a time and only the newest waiting one is written, so an older save
  // can never land after a newer one.
  let pending: string | null = null;
  let writing = false;
  async function flush() {
    writing = true;
    while (pending !== null) {
      const contents = pending;
      pending = null;
      try {
        await invoke('save_garden', { key, contents });
      } catch (err) {
        console.error('Desk Garden could not save:', err);
      }
    }
    writing = false;
  }

  return {
    read: () => saved,
    write(json) {
      saved = json;
      pending = json;
      if (!writing) void flush();
    },
  };
}

/** Shows a save dialog and writes the backup. Resolves false if the user cancels. */
export function exportToFile(fileName: string, contents: string): Promise<boolean> {
  return invoke<boolean>('export_garden', { fileName, contents });
}

/** Shows an open dialog and returns the chosen file's text, or null if the user cancels. */
export function importFromFile(): Promise<string | null> {
  return invoke<string | null>('import_garden');
}

/**
 * Reminders are scheduled with macOS, so they arrive with the window closed or the app quit.
 * Quick-add requests come from the menu bar window as events; the main window applies them with
 * the same logic as its own form and replies with the outcome.
 */
export async function desktopPlatform(): Promise<Platform> {
  const openHandlers = new Set<(target: ReminderTarget) => void>();
  // macOS reports the clicked notification's id; the id says which task it was for.
  const deliver = (id: string) => {
    const target = targetFromId(id);
    if (target) openHandlers.forEach((h) => h(target));
  };
  await listen<string>('reminder-open', (e) => deliver(e.payload));

  let lastSynced = '';
  let syncTimer: number | undefined;

  return {
    kind: 'desktop',
    remindersWhenClosed: true,
    hasMenuBar: true,
    notificationStatus: () => invoke<NotificationStatus>('notification_status'),
    requestNotifications: () => invoke<NotificationStatus>('request_notification_permission'),
    syncReminders(reminders) {
      // Local wall-clock components: macOS fires them at that time in the Mac's time zone.
      const payload = reminders.map((r) => {
        const d = new Date(r.at);
        return {
          id: r.id,
          title: r.title,
          body: r.body,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
          hour: d.getHours(),
          minute: d.getMinutes(),
          second: d.getSeconds(),
        };
      });
      const key = JSON.stringify(payload);
      if (key === lastSynced) return;
      // Changes come in bursts (typing in the details panel); schedule once things settle.
      clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        lastSynced = key;
        invoke('sync_reminders', { reminders: payload }).catch((err) => console.error('Desk Garden could not schedule reminders:', err));
      }, 300);
    },
    onReminderOpen(handler) {
      openHandlers.add(handler);
      // The app may have been launched by clicking a reminder before this page was ready.
      invoke<string | null>('take_pending_open').then((raw) => raw && deliver(raw));
      return () => openHandlers.delete(handler);
    },
    onReminderDue() {
      return () => {};
    },
    clearDelivered(ids) {
      invoke('clear_delivered_reminders', { ids }).catch(() => {});
    },
    setRemaining(count) {
      invoke('set_tray_count', { count }).catch(() => {});
    },
    onQuickAdd(handler) {
      const stop = listen<{ requestId: string; title: string }>('quick-add:request', (e) => {
        const result = handler(e.payload.title);
        void emitTo('quick-add', 'quick-add:result', { requestId: e.payload.requestId, ...result });
      });
      return () => void stop.then((f) => f());
    },
  };
}
