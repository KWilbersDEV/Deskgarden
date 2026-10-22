import { Plant } from './Plant';
import { STAGES, type PlantLook } from './storage';

export function StageTrack({ stage, look }: { stage: number; look?: PlantLook }) {
  return (
    <ol className="stage-track" aria-label="Growth stages">
      {STAGES.map((s, i) => {
        const status = i < stage ? 'past' : i === stage ? 'current' : 'future';
        const description =
          status === 'past'
            ? 'reached'
            : status === 'current'
              ? 'current stage'
              : `unlocks at ${s.min} points`;
        return (
          <li key={s.name} className={`stage-step ${status}`} aria-current={status === 'current' ? 'step' : undefined}>
            <span className="stage-thumb">
              <Plant stage={i} look={look} decorative />
            </span>
            <span className="stage-step-name">{s.name}</span>
            <span className="stage-step-meta" aria-hidden="true">
              {status === 'past' ? '✓' : status === 'current' ? 'Now' : `${s.min} pts`}
            </span>
            <span className="visually-hidden">, {description}</span>
          </li>
        );
      })}
    </ol>
  );
}
