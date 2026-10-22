import { CATALOG, isUnlocked, requirementText, type Option, type OptionKind } from './model/plants.ts';
import { Plant, backdropStyle } from './Plant';
import { BLOOM_STAGE, type GardenState, type PlantLook } from './storage';

type Props = {
  kind: OptionKind;
  legend: string;
  state: GardenState;
  look: PlantLook;
  name: string;
  onChange: (id: string) => void;
};

function progress(option: Option, state: GardenState): string {
  const r = option.requires!;
  return 'lifetime' in r
    ? `${Math.min(state.lifetimePoints, r.lifetime)} / ${r.lifetime} points`
    : `${Math.min(state.collection.length, r.collected)} / ${r.collected} collected`;
}

/** A radio group of species, pots or backgrounds. Locked options show what unlocks them. */
export function OptionPicker({ kind, legend, state, look, name, onChange }: Props) {
  const options = CATALOG[kind] as readonly Option[];
  return (
    <fieldset className="option-picker">
      <legend>{legend}</legend>
      <div className="option-grid">
        {options.map((option) => {
          const unlocked = isUnlocked(state, kind, option);
          const selected = look[kind] === option.id;
          const preview: PlantLook = { ...look, [kind]: option.id };
          const hintId = `${name}-${option.id}-hint`;
          return (
            <label key={option.id} className={`option${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`}>
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                disabled={!unlocked}
                onChange={() => onChange(option.id)}
                aria-describedby={unlocked ? undefined : hintId}
              />
              <span className="option-thumb" style={kind === 'background' ? backdropStyle(preview) : undefined}>
                {kind === 'background' ? (
                  <span className="option-swatch" aria-hidden="true" />
                ) : (
                  <Plant stage={kind === 'species' ? BLOOM_STAGE : 2} look={preview} decorative />
                )}
              </span>
              <span className="option-name">{option.name}</span>
              {!unlocked && (
                <span id={hintId} className="option-lock">
                  <span aria-hidden="true">🔒 </span>
                  {requirementText(option.requires!)}
                  <span className="option-progress"> · {progress(option, state)}</span>
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
