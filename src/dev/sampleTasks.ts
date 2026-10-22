import type { RepeatRule } from '../storage';

export type SampleTask = { title: string; repeat?: RepeatRule };

/**
 * Development-only sample tasks. They're added through the normal add-task action, unfinished,
 * so they never change points or the week chart.
 */
export function sampleTasks(): SampleTask[] {
  return [
    { title: 'Sample: Follow up on the quarterly report draft' },
    { title: 'Sample: Plan the team offsite agenda' },
    { title: 'Sample: Water the desk plant', repeat: { kind: 'daily' } },
    { title: 'Sample: Weekly review', repeat: { kind: 'weekly', days: [5] } },
  ];
}
