// The menu bar quick-add window (desktop app only). It checks the title with the same validator as
// the main window, then asks the main window to add it, which runs the same add-task action and
// saves it the same way. This window never writes data itself.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TITLE_MAX, newId, validateTitle } from './storage';

type Reply = { requestId: string; ok: boolean; error?: string };

const hide = () => invoke('hide_quick_add').catch(() => {});

export function QuickAdd() {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ id: string; resolve: (r: Reply) => void } | null>(null);

  useEffect(() => {
    document.title = 'Quick add';
    document.body.classList.add('quick-add-body');
    const stopReply = listen<Reply>('quick-add:result', (e) => {
      if (pending.current?.id === e.payload.requestId) pending.current.resolve(e.payload);
    });
    // Fresh each time the window is shown.
    const stopFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setError('');
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    });
    inputRef.current?.focus();
    return () => {
      void stopReply.then((f) => f());
      void stopFocus.then((f) => f());
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validateTitle(title);
    if (!check.ok) {
      setError(check.error);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    const id = newId();
    const reply = await new Promise<Reply>((resolve) => {
      pending.current = { id, resolve };
      void emitTo('main', 'quick-add:request', { requestId: id, title: check.title });
      setTimeout(() => resolve({ requestId: id, ok: false, error: 'Desk Garden didn’t respond. Open it and try again.' }), 4000);
    });
    pending.current = null;
    setBusy(false);
    if (reply.ok) {
      setTitle('');
      void hide();
    } else {
      setError(reply.error ?? 'That task couldn’t be added.');
      inputRef.current?.focus();
    }
  }

  return (
    <form className="quick-add" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && void hide()} noValidate>
      <label htmlFor="quick-title" className="quick-label">
        Add a task for today
      </label>
      <div className="quick-row">
        <input
          ref={inputRef}
          id="quick-title"
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          placeholder="What needs doing?"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'quick-error' : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setError('');
          }}
        />
        <button type="submit" className="btn-primary" disabled={busy}>
          Add
        </button>
      </div>
      {error ? (
        <p id="quick-error" className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="quick-hint">Enter to add · Esc to close</p>
      )}
    </form>
  );
}
