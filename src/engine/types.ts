// Shared shapes for the engine and the app. Dates are 'YYYY-MM-DD' local to settings.timezone,
// instants are ISO strings (timestamptz).

export type Project = "omnisync" | "teba" | "content" | "personal";
export const PROJECTS: Project[] = ["omnisync", "teba", "content", "personal"];

export type Status = "todo" | "waiting" | "done" | "dropped";
export type TaskEnergy = "high" | "low";
export type EnergyLevel = "low" | "ok" | "high";
export type Source = "app" | "claude" | "siri";

export interface Task {
  id: string;
  user_id?: string;
  title: string;
  project: Project | null;
  priority: number | null;
  status: Status;
  estimate_min: number | null;
  energy: TaskEnergy | null;
  scheduled_at: string | null;
  deadline: string | null;
  deadline_confirmed: boolean;
  start_by_auto: string | null;
  start_by_manual: string | null;
  follow_up: string | null;
  ready_by: string | null;
  next_action: string | null;
  waiting_on: string | null;
  notes: string | null;
  plan_for: string | null;
  postpone_count: number;
  forced: boolean;
  depends_on: string[];
  rrule: string | null;
  series_id: string | null;
  value_idr: number | null;
  source: Source;
  raw_text: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeWindow {
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
}

export type Tone = "steady" | "hype";

export interface Settings {
  timezone: string; // IANA, e.g. 'Asia/Makassar'
  display_name: string;
  work_start: string; // 'HH:mm'
  work_end: string;
  work_days: number[]; // ISO weekdays, Monday = 1 ... Sunday = 7
  energy_windows: TimeWindow[]; // high-energy windows
  daily_goal: number;
  focus_cap_min: number; // daily focus cap for the scheduler and start-by math
  quiet_start: string; // 'HH:mm', quiet hours wrap past midnight
  quiet_end: string;
  tone: Tone;
  sound: boolean;
  haptics: boolean;
  speak: boolean;
  followup_days: number;
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: "Asia/Makassar",
  display_name: "Electra",
  work_start: "08:30",
  work_end: "16:30",
  work_days: [1, 2, 3, 4, 5, 6],
  energy_windows: [{ start: "08:30", end: "11:30" }],
  daily_goal: 3,
  focus_cap_min: 300,
  quiet_start: "21:00",
  quiet_end: "08:00",
  tone: "steady",
  sound: true,
  haptics: true,
  speak: true,
  followup_days: 3,
};

export type BlockSource = "auto" | "manual" | "force";

export interface ScheduleBlock {
  id: string;
  task_id: string;
  start_at: string;
  end_at: string;
  pinned: boolean;
  source: BlockSource;
}

export interface BusyBlock {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
}

export interface EnergyCheckin {
  id: string;
  level: EnergyLevel;
  source: "app" | "claude";
  at: string;
}

export interface Goal {
  id: string;
  name: string;
  target_idr: number | null;
  saved_idr: number;
  is_current: boolean;
  reached_at: string | null;
  created_at: string;
}

export type TaskEventKind =
  | "created"
  | "done"
  | "undone"
  | "postponed"
  | "dropped"
  | "waiting_started"
  | "resumed"
  | "focus_started"
  | "focus_ended"
  | "forced"
  | "rescheduled";

export interface TaskEvent {
  id: string;
  task_id: string | null;
  kind: TaskEventKind;
  at: string;
  meta: Record<string, unknown> | null;
}

export interface DailyScore {
  day: string;
  score: number;
  parts: ScoreParts;
  momentum: number;
}

export interface ScoreParts {
  plan: number;
  priority: number;
  onTime: number;
  cleanSlate: number;
  focus: number;
}

export interface PipelineStep {
  offset_days: number;
  title: string;
  kind: string;
  estimate_min: number | null;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  steps: PipelineStep[];
}

/** Builds a task with defaults. Handy for tests and optimistic inserts. */
export function makeTask(partial: Partial<Task> & { title: string }): Task {
  const stamp = partial.created_at ?? "2026-01-01T00:00:00.000Z";
  return {
    id: partial.id ?? `t-${partial.title.toLowerCase().replace(/\W+/g, "-")}`,
    project: null,
    priority: null,
    status: "todo",
    estimate_min: null,
    energy: null,
    scheduled_at: null,
    deadline: null,
    deadline_confirmed: false,
    start_by_auto: null,
    start_by_manual: null,
    follow_up: null,
    ready_by: null,
    next_action: null,
    waiting_on: null,
    notes: null,
    plan_for: null,
    postpone_count: 0,
    forced: false,
    depends_on: [],
    rrule: null,
    series_id: null,
    value_idr: null,
    source: "app",
    raw_text: null,
    done_at: null,
    created_at: stamp,
    updated_at: stamp,
    ...partial,
  };
}
