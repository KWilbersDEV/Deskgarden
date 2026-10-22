import { useCallback, useEffect, useRef, useState } from 'react';
import { reduce, type Action, type Result } from './model/garden.ts';
import { currentCtx, saveState, todayKey, type GardenState } from './storage';

/** Today's date key, refreshed when the day changes while the app is open. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const check = () => setToday(todayKey());
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}

/** The current time, updated every second while `active` (for the focus timer). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    // Timers are throttled while hidden; catch up the moment the window is visible again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
}

/**
 * The garden and its one way to change: dispatch(action). Every change goes through the pure
 * reducer with the current date and time, and is saved straight away.
 */
export function useGarden(initial: GardenState) {
  const [state, setState] = useState(initial);
  const ref = useRef(state);
  const today = useToday();

  const dispatch = useCallback((action: Action): Result => {
    const out = reduce(ref.current, action, currentCtx());
    if (out.state !== ref.current) {
      ref.current = out.state;
      setState(out.state);
    }
    return out.result;
  }, []);

  useEffect(() => saveState(state), [state]);

  // A new day: finished tasks leave, recurring tasks appear, yesterday's top three is cleared.
  const firstDay = useRef(today);
  useEffect(() => {
    if (today !== firstDay.current) dispatch({ type: 'startDay' });
    firstDay.current = today;
  }, [today, dispatch]);

  return { state, dispatch, today };
}
