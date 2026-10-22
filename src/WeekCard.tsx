import { POINTS_PER_TASK, parseDateKey, weekDays, type CompletionLog } from './storage';

type Props = { log: CompletionLog; today: string };

export function WeekCard({ log, today }: Props) {
  const days = weekDays(today);
  const counts = days.map((d) => log[d] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);

  const range = `${parseDateKey(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseDateKey(days[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <section className="card week-card" aria-labelledby="week-heading">
      <div className="week-head">
        <div>
          <h2 id="week-heading">This week</h2>
          <p className="week-range">{range}</p>
        </div>
        <p className="week-total">
          <strong>{total * POINTS_PER_TASK}</strong>
          <span>growth {total * POINTS_PER_TASK === 1 ? 'point' : 'points'}</span>
        </p>
      </div>

      <ol className="week-chart">
        {days.map((day, i) => {
          const date = parseDateKey(day);
          const isToday = day === today;
          const isFuture = day > today;
          const count = counts[i];
          return (
            <li
              key={day}
              className={`week-day${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
              aria-current={isToday ? 'date' : undefined}
            >
              <span className="week-count" aria-hidden="true">
                {isFuture ? '' : count}
              </span>
              <span className="week-track" aria-hidden="true">
                <span className="week-bar" style={{ height: `${(count / max) * 100}%` }} />
              </span>
              <span className="week-label" aria-hidden="true">
                {date.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span className="visually-hidden">
                {date.toLocaleDateString(undefined, { weekday: 'long' })}
                {isToday ? ' (today)' : ''}:{' '}
                {isFuture ? 'upcoming' : `${count} ${count === 1 ? 'task' : 'tasks'} completed`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
