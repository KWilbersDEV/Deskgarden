import { Plant, backdropStyle } from '../Plant';
import { BLOOM_POINTS, BLOOM_STAGE, STAGES, stageFor, type GardenState } from '../storage';
import { formatDay, speciesName } from './lookUtils';

/** The garden shelf: every plant grown to full bloom, plus lifetime totals. */
export function GardenView({ state }: { state: GardenState }) {
  const plant = state.plant;
  const stage = stageFor(Math.max(0, plant.points));
  const plants = [...state.collection].reverse();
  return (
    <div className="view">
      <section className="card" aria-labelledby="garden-heading">
        <h2 id="garden-heading">Your garden</h2>
        <dl className="garden-stats">
          <div>
            <dt>Lifetime growth</dt>
            <dd>{state.lifetimePoints} points</dd>
          </div>
          <div>
            <dt>Plants collected</dt>
            <dd>{state.collection.length}</dd>
          </div>
          <div>
            <dt>Growing now</dt>
            <dd>
              {plant.name} · {STAGES[stage].name}
            </dd>
          </div>
        </dl>
        {plant.points < 0 && (
          <p className="field-hint">
            {plant.name} owes {-plant.points} {plant.points === -1 ? 'point' : 'points'}: a task whose growth went into a garden
            plant was unchecked. Garden plants always keep their bloom.
          </p>
        )}

        {plants.length === 0 ? (
          <p className="empty">
            Your shelf is empty for now. When your plant reaches full bloom ({BLOOM_POINTS} points), choose{' '}
            <strong>Move to garden</strong> to keep it here and plant a new seed.
          </p>
        ) : (
          <ul className="shelf" aria-label="Collected plants">
            {plants.map((p) => (
              <li key={p.id} className="shelf-item">
                <div className="shelf-plant" style={backdropStyle(p)}>
                  <Plant stage={BLOOM_STAGE} look={p} decorative />
                </div>
                <h3 className="shelf-name">{p.name}</h3>
                <p className="shelf-species">{speciesName(p.species)}</p>
                <dl className="shelf-dates">
                  <div>
                    <dt>Planted</dt>
                    <dd>{formatDay(p.startedDate, true)}</dd>
                  </div>
                  <div>
                    <dt>Bloomed</dt>
                    <dd>{formatDay(p.bloomedDate, true)}</dd>
                  </div>
                  <div>
                    <dt>Collected</dt>
                    <dd>{formatDay(p.collectedDate, true)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
