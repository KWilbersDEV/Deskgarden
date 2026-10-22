import type { GardenState } from './types.ts';

export const POINTS_PER_TASK = 1;

export const STAGES = [
  { name: 'Seed', min: 0, hint: 'Something is stirring under the soil.' },
  { name: 'Sprout', min: 2, hint: 'Two tiny leaves say hello.' },
  { name: 'Seedling', min: 5, hint: 'Getting taller every day.' },
  { name: 'Leafy plant', min: 9, hint: 'Lush, green and proud of you.' },
  { name: 'In bloom', min: 14, hint: 'Full bloom! Your desk is a garden.' },
] as const;

export const BLOOM_STAGE = STAGES.length - 1;
/** Points a plant takes with it into the garden. */
export const BLOOM_POINTS = STAGES[BLOOM_STAGE].min;

export function stageFor(points: number): number {
  let stage = 0;
  STAGES.forEach((s, i) => {
    if (points >= s.min) stage = i;
  });
  return stage;
}

export type Requirement = { lifetime: number } | { collected: number };

export type Option = { id: string; name: string; requires?: Requirement };

export type Species = Option & {
  leaf: string;
  leafDark: string;
  stem: string;
  /** Leaf width relative to length. */
  leafShape: number;
  petal: string;
  petalAlt: string;
  /** 'flower' draws petals, 'cup' a tulip, 'disc' a sunflower, 'column' a cactus. */
  form: 'flower' | 'cup' | 'disc' | 'column' | 'fronds';
};

export const SPECIES: Species[] = [
  { id: 'sprig', name: 'Desk sprig', leaf: '#5c9c5a', leafDark: '#3f7a43', stem: '#4b8a4c', leafShape: 0.45, petal: '#f08aa0', petalAlt: '#f6a96b', form: 'flower' },
  { id: 'fern', name: 'Fern', leaf: '#4f9a6a', leafDark: '#2f6e48', stem: '#3d7d55', leafShape: 0.28, petal: '#fff6e3', petalAlt: '#d8f0c8', form: 'fronds' },
  { id: 'tulip', name: 'Tulip', leaf: '#6aa65e', leafDark: '#477d3f', stem: '#58934f', leafShape: 0.32, petal: '#e2574c', petalAlt: '#f2a65a', form: 'cup', requires: { lifetime: 15 } },
  { id: 'sunflower', name: 'Sunflower', leaf: '#6f9f45', leafDark: '#4d7a2c', stem: '#5e8c3a', leafShape: 0.62, petal: '#f6c13d', petalAlt: '#f4d06f', form: 'disc', requires: { collected: 1 } },
  { id: 'cactus', name: 'Cactus', leaf: '#5d9e7a', leafDark: '#3f7a5c', stem: '#5d9e7a', leafShape: 0.5, petal: '#f27fb2', petalAlt: '#ffd0e4', form: 'column', requires: { lifetime: 40 } },
];

export type Pot = Option & { body: string; rim: string; dot: string };

export const POTS: Pot[] = [
  { id: 'terracotta', name: 'Terracotta', body: '#cd6a40', rim: '#b65a34', dot: '#f2b48c' },
  { id: 'cream', name: 'Cream glaze', body: '#efe2c8', rim: '#dccaa6', dot: '#c98f6b' },
  { id: 'sky', name: 'Sky glaze', body: '#7fb6d9', rim: '#5f9cc4', dot: '#e8f4fb', requires: { lifetime: 10 } },
  { id: 'speckled', name: 'Speckled stoneware', body: '#b9a58f', rim: '#9c8872', dot: '#5b4a3c', requires: { lifetime: 25 } },
  { id: 'midnight', name: 'Midnight & gold', body: '#2f3a5c', rim: '#c9a24a', dot: '#e8c46b', requires: { collected: 2 } },
];

export type Background = Option & { inner: string; outer: string };

export const BACKGROUNDS: Background[] = [
  { id: 'sunny', name: 'Sunny window', inner: '#fff3c9', outer: '#fdeacc' },
  { id: 'mint', name: 'Mint morning', inner: '#dff3e4', outer: '#f3f8ee' },
  { id: 'meadow', name: 'Meadow', inner: '#e6f2c6', outer: '#cfe6b3', requires: { collected: 1 } },
  { id: 'twilight', name: 'Twilight', inner: '#e9dcf5', outer: '#c9c3ea', requires: { lifetime: 20 } },
  { id: 'starry', name: 'Starry night', inner: '#3a4a78', outer: '#232c4f', requires: { lifetime: 60 } },
];

export const CATALOG = { species: SPECIES, pot: POTS, background: BACKGROUNDS } as const;
export type OptionKind = keyof typeof CATALOG;

export const DEFAULT_LOOK = { species: 'sprig', pot: 'terracotta', background: 'sunny' } as const;

export function unlockKey(kind: OptionKind, id: string) {
  return `${kind}:${id}`;
}

export function requirementText(r: Requirement): string {
  return 'lifetime' in r
    ? `Reach ${r.lifetime} lifetime growth points`
    : `Move ${r.collected} ${r.collected === 1 ? 'plant' : 'plants'} to your garden`;
}

export function meetsRequirement(r: Requirement, lifetimePoints: number, collected: number): boolean {
  return 'lifetime' in r ? lifetimePoints >= r.lifetime : collected >= r.collected;
}

export function isUnlocked(state: Pick<GardenState, 'unlocked'>, kind: OptionKind, option: Option): boolean {
  return !option.requires || state.unlocked.includes(unlockKey(kind, option.id));
}

/** Adds every option whose milestone has been reached. Unlocks are never removed. */
export function withUnlocks<S extends Pick<GardenState, 'unlocked' | 'lifetimePoints' | 'collection'>>(state: S): S {
  const next = new Set(state.unlocked);
  for (const kind of Object.keys(CATALOG) as OptionKind[]) {
    for (const option of CATALOG[kind] as Option[]) {
      if (option.requires && meetsRequirement(option.requires, state.lifetimePoints, state.collection.length)) {
        next.add(unlockKey(kind, option.id));
      }
    }
  }
  return next.size === state.unlocked.length ? state : { ...state, unlocked: [...next].sort() };
}

export function findOption<K extends OptionKind>(kind: K, id: string): (typeof CATALOG)[K][number] {
  const list = CATALOG[kind] as readonly Option[];
  return (list.find((o) => o.id === id) ?? list[0]) as (typeof CATALOG)[K][number];
}
