import type { CSSProperties } from 'react';
import { DEFAULT_LOOK, findOption } from './model/plants.ts';
import { STAGES, type PlantLook } from './storage';

type Props = {
  stage: number;
  look?: PlantLook;
  /** Static thumbnail: hidden from assistive tech and not animated. */
  decorative?: boolean;
  /** Accessible name; defaults to the stage. */
  label?: string;
};

const SOIL_Y = 142;
const STEM_HEIGHT = [0, 28, 55, 82, 100];

// Leaves per stage: position along the stem (0 = soil, 1 = top), side, and size.
const LEAVES: { at: number; side: -1 | 1; size: number }[][] = [
  [],
  [
    { at: 1, side: -1, size: 11 },
    { at: 1, side: 1, size: 11 },
  ],
  [
    { at: 0.45, side: -1, size: 13 },
    { at: 0.7, side: 1, size: 14 },
    { at: 1, side: -1, size: 11 },
    { at: 1, side: 1, size: 11 },
  ],
  [
    { at: 0.25, side: 1, size: 15 },
    { at: 0.42, side: -1, size: 18 },
    { at: 0.62, side: 1, size: 18 },
    { at: 0.8, side: -1, size: 15 },
    { at: 1, side: 1, size: 12 },
    { at: 1, side: -1, size: 12 },
  ],
];
LEAVES[4] = LEAVES[3];

/** CSS variables that colour the plant and pot for a look. */
export function lookStyle(look: PlantLook = DEFAULT_LOOK): CSSProperties {
  const species = findOption('species', look.species);
  const pot = findOption('pot', look.pot);
  return {
    '--leaf': species.leaf,
    '--leaf-dark': species.leafDark,
    '--stem': species.stem,
    '--petal': species.petal,
    '--petal-alt': species.petalAlt,
    '--pot': pot.body,
    '--pot-rim': pot.rim,
    '--pot-dot': pot.dot,
  } as CSSProperties;
}

/** The glow behind the plant. */
export function backdropStyle(look: PlantLook = DEFAULT_LOOK): CSSProperties {
  const bg = findOption('background', look.background);
  return { '--backdrop-inner': bg.inner, '--backdrop-outer': bg.outer } as CSSProperties;
}

function Leaf({ x, y, side, size, shape }: { x: number; y: number; side: -1 | 1; size: number; shape: number }) {
  return (
    <g transform={`rotate(${side * -28} ${x} ${y})`}>
      <ellipse cx={x + side * size} cy={y} rx={size} ry={size * shape} className="leaf" />
      <path d={`M${x} ${y} L${x + side * size * 1.6} ${y}`} className="leaf-vein" />
    </g>
  );
}

function Flower({ x, y, r, color, petals = 5 }: { x: number; y: number; r: number; color: string; petals?: number }) {
  return (
    <g>
      {Array.from({ length: petals }, (_, i) => (i * 360) / petals).map((angle) => (
        <ellipse key={angle} cx={x} cy={y - r} rx={r * 0.6} ry={r} fill={color} transform={`rotate(${angle} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill="var(--sun)" />
    </g>
  );
}

function Tulip({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <path d={`M${x - r} ${y - r * 0.4} Q${x - r} ${y + r} ${x} ${y + r} Q${x + r} ${y + r} ${x + r} ${y - r * 0.4} L${x + r * 0.5} ${y} L${x} ${y - r * 0.7} L${x - r * 0.5} ${y} Z`} fill="var(--petal)" />
      <path d={`M${x - r * 0.35} ${y + r * 0.2} Q${x} ${y - r * 0.9} ${x + r * 0.35} ${y + r * 0.2}`} fill="var(--petal-alt)" opacity="0.7" />
    </g>
  );
}

function Sunflower({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => i * 30).map((angle) => (
        <ellipse key={angle} cx={x} cy={y - r * 0.95} rx={r * 0.32} ry={r * 0.62} fill="var(--petal)" transform={`rotate(${angle} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill="#7a4a24" />
      <circle cx={x} cy={y} r={r * 0.3} fill="#5c361a" />
    </g>
  );
}

/** A cactus grows as a column, with arms from the leafy stage. */
function Cactus({ stage, height }: { stage: number; height: number }) {
  const top = SOIL_Y - height;
  const w = 12 + stage * 3;
  return (
    <g>
      <rect x={100 - w / 2} y={top} width={w} height={height + 4} rx={w / 2} className="leaf" />
      {stage >= 3 && (
        <>
          <path d={`M${100 - w / 2} ${SOIL_Y - height * 0.45} h-10 a6 6 0 0 1 -6 -6 v-18`} className="cactus-arm" />
          <path d={`M${100 + w / 2} ${SOIL_Y - height * 0.6} h10 a6 6 0 0 0 6 -6 v-14`} className="cactus-arm" />
        </>
      )}
      {Array.from({ length: Math.max(0, stage * 2) }, (_, i) => (
        <circle key={i} cx={100 + (i % 2 ? w / 4 : -w / 4)} cy={top + 8 + i * (height / (stage * 2 + 1))} r={1.4} className="leaf-vein-dot" />
      ))}
    </g>
  );
}

export function Plant({ stage, look = DEFAULT_LOOK, decorative = false, label }: Props) {
  const species = findOption('species', look.species);
  const height = species.form === 'column' ? STEM_HEIGHT[stage] * 0.75 : STEM_HEIGHT[stage];
  const top = SOIL_Y - height;
  const sizeScale = species.form === 'fronds' ? 1.3 : species.form === 'cup' ? 1.15 : 1;

  return (
    <svg
      className="plant"
      viewBox="0 0 200 220"
      focusable="false"
      style={lookStyle(look)}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label ?? `Your plant: ${STAGES[stage].name}, stage ${stage + 1} of ${STAGES.length}.` })}
    >
      <ellipse cx="100" cy="212" rx="62" ry="6" className="shadow" />

      {/* key forces a fresh "pop" animation each time the stage changes */}
      <g className={decorative ? undefined : 'plant-sway'} key={`${stage}-${look.species}`}>
        {stage === 0 ? (
          <g>
            <ellipse cx="100" cy={SOIL_Y - 9} rx="9" ry="6.5" className="seed" />
            <path d={`M101 ${SOIL_Y - 14} q2 -6 7 -7`} className="seed-curl" />
          </g>
        ) : species.form === 'column' ? (
          <Cactus stage={stage} height={height} />
        ) : (
          <>
            <path
              d={`M100 ${SOIL_Y} C 96 ${SOIL_Y - height * 0.4}, 104 ${SOIL_Y - height * 0.7}, 100 ${top}`}
              className="stem"
            />
            {LEAVES[stage].map((leaf, i) => (
              <Leaf
                key={i}
                x={100}
                y={SOIL_Y - height * leaf.at}
                side={leaf.side}
                size={leaf.size * sizeScale}
                shape={species.leafShape}
              />
            ))}
          </>
        )}
        {stage === 4 && species.form === 'flower' && (
          <>
            <Flower x={100} y={top - 6} r={11} color="var(--petal)" />
            <Flower x={73} y={top + 22} r={7} color="var(--petal-alt)" />
            <Flower x={128} y={top + 36} r={7} color="var(--petal-alt)" />
          </>
        )}
        {stage === 4 && species.form === 'fronds' && (
          <>
            <Flower x={100} y={top - 4} r={6} color="var(--petal)" petals={6} />
            <Flower x={70} y={top + 30} r={5} color="var(--petal-alt)" petals={6} />
            <Flower x={131} y={top + 44} r={5} color="var(--petal)" petals={6} />
          </>
        )}
        {stage === 4 && species.form === 'cup' && <Tulip x={100} y={top - 6} r={13} />}
        {stage === 4 && species.form === 'disc' && <Sunflower x={100} y={top - 10} r={19} />}
        {stage === 4 && species.form === 'column' && <Flower x={100} y={top - 2} r={9} color="var(--petal)" petals={7} />}
      </g>

      {/* pot */}
      <path d="M52 146 h96 l-10 64 h-76 z" className="pot" />
      <rect x="46" y="138" width="108" height="16" rx="5" className="pot-rim" />
      <ellipse cx="100" cy="141" rx="48" ry="4" className="soil" />
      <circle cx="78" cy="180" r="3" className="pot-dot" />
      <circle cx="100" cy="186" r="3" className="pot-dot" />
      <circle cx="122" cy="180" r="3" className="pot-dot" />
    </svg>
  );
}
