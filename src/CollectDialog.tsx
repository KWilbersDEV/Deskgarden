import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { OptionPicker } from './OptionPicker';
import { Plant, backdropStyle } from './Plant';
import { combineLook } from './views/lookUtils';
import { reduce } from './model/garden.ts';
import { BLOOM_POINTS, BLOOM_STAGE, PLANT_NAME_MAX, currentCtx, type GardenState, type PlantLook } from './storage';

type Props = {
  state: GardenState;
  onCollect: (next: PlantLook & { name: string }) => void;
  onClose: () => void;
};

/** Move the blooming plant to the garden shelf and choose the next seed. */
export function CollectDialog({ state, onCollect, onClose }: Props) {
  const plant = state.plant;
  const extra = plant.points - BLOOM_POINTS;
  // Preview what the collection unlocks, so the new seed can use it straight away.
  const after = reduce(state, { type: 'collect', plantId: plant.id, next: {} }, currentCtx()).state;
  const [look, setLook] = useState<PlantLook>(combineLook(plant));
  const [name, setName] = useState(`Plant no. ${state.collection.length + 2}`);

  function submit(e: FormEvent) {
    e.preventDefault();
    onCollect({ ...look, name });
  }

  return (
    <Modal labelledBy="collect-heading" describedBy="collect-text" onClose={onClose} className="modal-wide">
      <form onSubmit={submit}>
        <h2 id="collect-heading">Move {plant.name} to your garden</h2>
        <div className="collect-hero" style={backdropStyle(plant)}>
          <Plant stage={BLOOM_STAGE} look={plant} decorative />
        </div>
        <p id="collect-text">
          {plant.name} goes on your garden shelf in full bloom, with its {BLOOM_POINTS} growth points.
          {extra > 0
            ? ` The ${extra} extra ${extra === 1 ? 'point carries' : 'points carry'} over to your new seed.`
            : ' Your new seed starts fresh.'}
        </p>
        <div className="field">
          <label htmlFor="seed-name">Name your new plant</label>
          <input
            id="seed-name"
            type="text"
            value={name}
            maxLength={PLANT_NAME_MAX}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <OptionPicker
          kind="species"
          legend="Choose a seed"
          state={after}
          look={look}
          name="seed-species"
          onChange={(species) => setLook((l) => ({ ...l, species }))}
        />
        <p className="field-hint">You can change the pot and background any time under Customize.</p>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Not yet
          </button>
          <button type="submit" className="btn-primary">
            Move to garden
          </button>
        </div>
      </form>
    </Modal>
  );
}
