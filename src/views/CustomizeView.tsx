import { useEffect, useState } from 'react';
import { OptionPicker } from '../OptionPicker';
import { Plant, backdropStyle } from '../Plant';
import { PLANT_NAME_MAX, STAGES, stageFor, type GardenState, type PlantLook } from '../storage';
import { speciesName } from './lookUtils';

type Props = {
  state: GardenState;
  onCustomize: (patch: Partial<PlantLook> & { name?: string }) => void;
};

/** Name the active plant and choose its species, pot and background. Changes save immediately. */
export function CustomizeView({ state, onCustomize }: Props) {
  const plant = state.plant;
  const stage = stageFor(Math.max(0, plant.points));
  const [name, setName] = useState(plant.name);
  useEffect(() => setName(plant.name), [plant.name]);

  const saveName = () => {
    if (name.trim() && name.trim() !== plant.name) onCustomize({ name });
    else setName(plant.name);
  };

  return (
    <div className="view customize">
      <section className="card customize-preview" aria-labelledby="customize-heading">
        <h2 id="customize-heading">Customize</h2>
        <div className="plant-frame" style={backdropStyle(plant)}>
          <Plant stage={stage} look={plant} label={`Preview: ${plant.name}, ${speciesName(plant.species)}, ${STAGES[stage].name}.`} />
        </div>
        <div className="field">
          <label htmlFor="plant-name">Plant name</label>
          <input
            id="plant-name"
            type="text"
            value={name}
            maxLength={PLANT_NAME_MAX}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveName();
              }
            }}
          />
        </div>
        <p className="field-hint">
          New species, pots and backgrounds unlock as you earn growth points and move plants to your garden. Unlocks are yours to
          keep.
        </p>
      </section>

      <section className="card customize-options" aria-label="Plant options">
        <OptionPicker kind="species" legend="Species" state={state} look={plant} name="species" onChange={(species) => onCustomize({ species })} />
        <OptionPicker kind="pot" legend="Pot" state={state} look={plant} name="pot" onChange={(pot) => onCustomize({ pot })} />
        <OptionPicker
          kind="background"
          legend="Background"
          state={state}
          look={plant}
          name="background"
          onChange={(background) => onCustomize({ background })}
        />
      </section>
    </div>
  );
}
