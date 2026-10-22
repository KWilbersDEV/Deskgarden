export type Priority = 'low' | 'medium' | 'high';

export type ChecklistItem = { id: string; text: string; done: boolean };

/** Weekdays are 0 = Sunday … 6 = Saturday. "weekly" has one day, "weekdays" one or more. */
export type RepeatRule =
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'weekdays'; days: number[] };

/** The fields edited in the task details panel. */
export type TaskDetails = {
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  priority?: Priority;
  checklist?: ChecklistItem[];
  /** Local 'YYYY-MM-DDTHH:mm'. Recurring occurrences get theirs from the series' remindTime. */
  remindAt?: string;
};

export type Task = TaskDetails & {
  id: string;
  done: boolean;
  /** Local date the task was added; for a recurring occurrence, the day it is for. */
  createdDate: string;
  /** Local date the task was completed. Only set while `done` is true. */
  completedDate?: string;
  /** Set on occurrences of a recurring task. */
  seriesId?: string;
  occurrenceDate?: string;
};

/** A recurring task. Each day it's due gets its own Task (an occurrence). */
export type Series = {
  id: string;
  title: string;
  description?: string;
  priority?: Priority;
  /** Subtasks copied, unticked, into each new occurrence. */
  checklist?: ChecklistItem[];
  repeat: RepeatRule;
  /** Local 'HH:mm' reminder for each occurrence. */
  remindTime?: string;
  startDate: string;
  /** Occurrences are created for due days up to and including this date, once each. */
  generatedThrough: string;
  /** Outcome of past occurrences, newest last. */
  history: { date: string; status: 'done' | 'missed' }[];
};

/** Number of tasks completed per local date (YYYY-MM-DD). */
export type CompletionLog = Record<string, number>;

export type PlantLook = { species: string; pot: string; background: string };

export type ActivePlant = PlantLook & {
  id: string;
  name: string;
  startedDate: string;
  /** Set while the plant is in full bloom: the day it got there. */
  bloomedDate?: string;
  /**
   * Growth points of this plant. It can dip below zero when a task whose point went into a plant
   * that's already in the garden is unchecked: the point is owed, never taken from the garden.
   */
  points: number;
};

export type CollectedPlant = PlantLook & {
  id: string;
  name: string;
  startedDate: string;
  bloomedDate: string;
  collectedDate: string;
  /** Always the bloom threshold: points beyond it stayed with the next plant. */
  points: number;
};

export type Priorities = { date: string; ids: string[] };

export type TimerState = {
  taskId: string;
  taskTitle: string;
  phase: 'focus' | 'break';
  durationMs: number;
  breakMs: number;
  /** Epoch ms when the current run started; null while paused. */
  startedAt: number | null;
  /** Time already run before `startedAt`. */
  elapsedMs: number;
};

export type Settings = { focusMinutes: number; breakMinutes: number };

export type GardenState = {
  version: number;
  tasks: Task[];
  series: Series[];
  log: CompletionLog;
  /** Every growth point ever earned (net of unchecks). Equals collected points + plant points. */
  lifetimePoints: number;
  plant: ActivePlant;
  collection: CollectedPlant[];
  /** Customization options unlocked so far, as 'kind:id'. Unlocks are never taken away. */
  unlocked: string[];
  priorities: Priorities;
  timer: TimerState | null;
  settings: Settings;
};
