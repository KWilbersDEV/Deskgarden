import { findOption } from '../model/plants.ts';
import type { PlantLook } from '../storage';

export function combineLook(look: PlantLook): PlantLook {
  return { species: look.species, pot: look.pot, background: look.background };
}

export function speciesName(id: string) {
  return findOption('species', id).name;
}

export function formatDay(key: string, withYear = false) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}
