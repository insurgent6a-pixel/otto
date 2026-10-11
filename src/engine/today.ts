// Today screen model: spec sections 5 (order), 8a (energy) and 16 (layout).

import { isBlocked, reasonLine, scoreTask } from "./score";
import { localDate, localTime } from "./time";
import type { EnergyLevel, ScheduleBlock, Settings, Task } from "./types";

export interface RankedTask {
  task: Task;
  score: number;
  reasons: string[];
  reasonLine: string;
  /** 'HH:mm' local, when the task is timed today or has a schedule block today. */
  time: string | null;
  fiveMin: boolean;
  displayTitle: string;
}

export interface TodayModel {
  next: RankedTask | null;
  upNext: RankedTask[];
  ordered: RankedTask[];
  triage: Task[];
  waiting: Task[];
  doneToday: Task[];
  dailyGoal: number;
  doneCount: number;
  energyLine: string | null;
}

export const LOW_REASON = "Low energy pick: 5 minutes, easy win";
export const HIGH_REASON = "You're charged. Spend it on deep work";
const TIMED_LEAD_MS = 60 * 60000;

export function lowGoalLine(goal: number): string {
  return `Goal's ${goal} today. That's plenty.`;
}

interface Ranked extends RankedTask {
  /** Instant that places the task in tier 2, or null for score order. */
  slotMs: number | null;
}

function byScore(a: Ranked, b: Ranked): number {
  if (b.score !== a.score) return b.score - a.score;
  const pa = a.task.priority ?? 99;
  const pb = b.task.priority ?? 99;
  if (pa !== pb) return pa - pb;
  return a.task.created_at < b.task.created_at ? -1 : a.task.created_at > b.task.created_at ? 1 : 0;
}

export function buildToday(
  tasks: Task[],
  blocks: ScheduleBlock[],
  now: Date,
  settings: Settings,
  energy: EnergyLevel | null,
): TodayModel {
  const tz = settings.timezone;
  const today = localDate(now, tz);
  const nowMs = now.getTime();
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const isToday = (iso: string) => localDate(iso, tz) === today;

  // Forced tasks are locked in and blocked ones are hidden, so neither lands in triage.
  const triage = tasks.filter(
    (t) =>
      t.status === "todo" &&
      !t.forced &&
      !isBlocked(t, tasksById) &&
      ((t.deadline !== null && t.deadline < today && (t.plan_for === null || t.plan_for < today)) ||
        (t.scheduled_at !== null && localDate(t.scheduled_at, tz) < today)),
  );
  const triageIds = new Set(triage.map((t) => t.id));

  const pool = tasks.filter(
    (t) =>
      t.status === "todo" &&
      !triageIds.has(t.id) &&
      !isBlocked(t, tasksById) &&
      (t.plan_for === null || t.plan_for <= today) &&
      (t.scheduled_at === null || isToday(t.scheduled_at)),
  );

  const ranked: Ranked[] = pool.map((task) => {
    const s = scoreTask(task, now, { settings, tasksById });
    let time: string | null = null;
    let slotMs: number | null = null;
    if (task.scheduled_at) {
      const at = new Date(task.scheduled_at).getTime();
      time = localTime(task.scheduled_at, tz);
      if (at - nowMs <= TIMED_LEAD_MS) slotMs = at;
    } else {
      const todays = blocks
        .filter((b) => b.task_id === task.id && isToday(b.start_at))
        .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
      // Show the block still ahead or running; once all ended, keep the first one's slot.
      const block = todays.find((b) => Date.parse(b.end_at) > nowMs) ?? todays[0];
      if (block) {
        time = localTime(block.start_at, tz);
        slotMs = Date.parse(block.start_at);
      }
    }
    return {
      task,
      score: s.score,
      reasons: s.reasons,
      reasonLine: reasonLine(s),
      time,
      fiveMin: false,
      displayTitle: task.title,
      slotMs,
    };
  });

  const forced = ranked.filter((r) => r.task.forced).sort(byScore);
  const slotted = ranked
    .filter((r) => !r.task.forced && r.slotMs !== null)
    .sort((a, b) => a.slotMs! - b.slotMs! || byScore(a, b));
  const rest = ranked.filter((r) => !r.task.forced && r.slotMs === null).sort(byScore);
  let flexible = [...slotted, ...rest];

  // Energy picks skip timed items: a meeting is never the "easy win" or the "deep work".
  const candidates = flexible.filter((r) => !r.task.scheduled_at).sort(byScore);
  let pick: Ranked | undefined;
  if (energy === "low") {
    const small = candidates.find((r) => (r.task.estimate_min ?? 60) <= 15 || r.task.energy === "low");
    pick = small ?? flexible.find((r) => !r.task.scheduled_at);
    if (pick) {
      pick.reasonLine = LOW_REASON;
      if (!small) {
        pick.fiveMin = true;
        pick.displayTitle = pick.task.next_action ?? pick.task.title;
      }
    }
  } else if (energy === "high") {
    pick = candidates.find((r) => r.task.energy === "high" || (r.task.estimate_min ?? 60) >= 50);
    if (pick) pick.reasonLine = HIGH_REASON;
  }
  if (pick) flexible = [pick, ...flexible.filter((r) => r !== pick)];

  const ordered: RankedTask[] = [...forced, ...flexible];
  const next = ordered[0] ?? null;

  const waiting = tasks
    .filter((t) => t.status === "waiting")
    .sort((a, b) => (a.follow_up ?? "9999").localeCompare(b.follow_up ?? "9999"));
  const doneToday = tasks
    .filter((t) => t.status === "done" && t.done_at !== null && isToday(t.done_at))
    .sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!));

  let energyLine: string | null = null;
  if (energy === "low") energyLine = "Low battery is fine. Here's a 5 minute one. Finish it and you're already moving.";
  else if (energy === "high") energyLine = "Charged. Let's use it on the big one before lunch.";
  else if (energy === "ok") {
    energyLine = !next
      ? "Good. The list is clear."
      : next.reasons.length
        ? `Good. Start with ${next.displayTitle}, ${next.reasons.join(", ")}.`
        : `Good. Start with ${next.displayTitle}.`;
  }

  return {
    next,
    upNext: ordered.slice(1, 3),
    ordered,
    triage,
    waiting,
    doneToday,
    dailyGoal: energy === "low" ? Math.max(1, settings.daily_goal - 1) : settings.daily_goal,
    doneCount: doneToday.length,
    energyLine,
  };
}
