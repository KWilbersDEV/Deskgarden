// Helpers for the model tests (node --test). Not used by the app.
import { emptyGarden, reduce, type Action, type Ctx } from './garden.ts';
import type { GardenState } from './types.ts';

/** A context at local noon on `today`, with predictable ids. */
export function ctxOn(today: string, ids = counter()): Ctx {
  const [y, m, d] = today.split('-').map(Number);
  return { today, now: new Date(y, m - 1, d, 12).getTime(), newId: ids };
}

export function counter(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

export function garden(today: string, ids = counter()): GardenState {
  return emptyGarden(ctxOn(today, ids));
}

/** Runs actions in order and returns the final state (throws if one fails unexpectedly). */
export function run(state: GardenState, ctx: Ctx, ...actions: Action[]): GardenState {
  for (const action of actions) {
    const out = reduce(state, action, ctx);
    if (!out.result.ok && action.type !== 'pin') throw new Error(`${action.type} failed: ${out.result.error}`);
    state = out.state;
  }
  return state;
}

/** Adds and completes `n` tasks. */
export function earn(state: GardenState, ctx: Ctx, n: number): GardenState {
  for (let i = 0; i < n; i++) {
    const added = reduce(state, { type: 'addTask', title: `Task ${i}` }, ctx);
    state = reduce(added.state, { type: 'toggleTask', id: added.result.task!.id }, ctx).state;
  }
  return state;
}

/** The rule every state must satisfy: lifetime points = garden + active plant. */
export function ledgerHolds(state: GardenState): boolean {
  return state.lifetimePoints === state.collection.reduce((sum, c) => sum + c.points, 0) + state.plant.points;
}
