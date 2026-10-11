// Daily score, momentum and streaks (section 9). Every "day" is a 'YYYY-MM-DD' in settings.timezone.
import type { EnergyLevel, ScoreParts, Settings, Task, TaskEvent } from "./types";
import { addDays, isWorkingDay, localDate } from "./time";

export interface DayStats {
  day: string;
  plannedAt8am: number | null;
  doneFromPlan: number;
  dailyGoal: number;
  doneCount: number;
  p01Total: number;
  p01Done: number;
  wentOverdueUntriaged: number;
  untriagedOverdueAtEnd: number;
  focusMinutes: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function dailyScore(s: DayStats): { score: number; parts: ScoreParts } {
  const planRatio = s.plannedAt8am ? s.doneFromPlan / s.plannedAt8am : s.doneCount / Math.max(1, s.dailyGoal);
  const raw = {
    plan: 40 * Math.min(1, planRatio),
    priority: s.p01Total === 0 ? 20 : 20 * Math.min(1, s.p01Done / s.p01Total),
    onTime: Math.max(0, 20 - 5 * s.wentOverdueUntriaged),
    cleanSlate: s.untriagedOverdueAtEnd === 0 ? 10 : 0,
    focus: 10 * Math.min(1, s.focusMinutes / 90),
  };
  const score = Math.round(raw.plan + raw.priority + raw.onTime + raw.cleanSlate + raw.focus);
  return {
    score,
    parts: {
      plan: r1(raw.plan),
      priority: r1(raw.priority),
      onTime: raw.onTime,
      cleanSlate: raw.cleanSlate,
      focus: r1(raw.focus),
    },
  };
}

/**
 * Stats for `day`, meant to run at 23:59 local (the snapshot).
 * Overdue rules: a task "went overdue today" when its deadline was yesterday and it is still a plain
 * todo with no plan_for of today or later. "Untriaged overdue at end" is any todo with a deadline
 * before `day` and no plan_for after `day`. Tasks due today that are still open count tomorrow, so
 * nothing is penalized twice. Waiting counts as triaged.
 */
export function computeDayStats(input: {
  tasks: Task[];
  events: TaskEvent[];
  day: string;
  settings: Settings;
  dailyGoal: number;
  plannedIdsAt8am: string[] | null;
}): DayStats {
  const { tasks, events, day, settings, dailyGoal, plannedIdsAt8am } = input;
  const tz = settings.timezone;
  const doneOn = (t: Task) => t.status === "done" && t.done_at !== null && localDate(t.done_at, tz) === day;
  const yesterday = addDays(day, -1);

  const planned = plannedIdsAt8am ? new Set(plannedIdsAt8am) : null;
  const p01 = tasks.filter(
    (t) =>
      (t.priority === 0 || t.priority === 1) &&
      (t.status === "todo" || t.status === "waiting" || doneOn(t)) &&
      (t.deadline === day || t.plan_for === day || (t.scheduled_at !== null && localDate(t.scheduled_at, tz) === day)),
  );

  return {
    day,
    plannedAt8am: planned ? planned.size : null,
    doneFromPlan: planned ? tasks.filter((t) => planned.has(t.id) && doneOn(t)).length : 0,
    dailyGoal,
    doneCount: tasks.filter(doneOn).length,
    p01Total: p01.length,
    p01Done: p01.filter(doneOn).length,
    wentOverdueUntriaged: tasks.filter(
      (t) => t.status === "todo" && t.deadline === yesterday && !(t.plan_for && t.plan_for >= day),
    ).length,
    untriagedOverdueAtEnd: tasks.filter(
      (t) => t.status === "todo" && t.deadline !== null && t.deadline < day && !(t.plan_for && t.plan_for > day),
    ).length,
    focusMinutes: events
      .filter((e) => e.kind === "focus_ended" && localDate(e.at, tz) === day)
      .reduce((sum, e) => sum + (Number(e.meta?.minutes) || 0), 0),
  };
}

/** EMA over the last 7 scores, oldest first. */
export function momentum(scores: number[], alpha = 0.3): number {
  const last = scores.slice(-7);
  if (last.length === 0) return 0;
  const ema = last.slice(1).reduce((acc, x) => alpha * x + (1 - alpha) * acc, last[0]);
  return r1(ema);
}

export function trend(prevMomentum: number | null, cur: number): "up" | "down" | "flat" {
  if (prevMomentum === null || Math.abs(cur - prevMomentum) <= 1) return "flat";
  return cur > prevMomentum ? "up" : "down";
}

/**
 * Consecutive goal-hit days back from today. Today counts only once hit, so a fresh morning never
 * shows a broken streak. Non-working days are skipped unless the goal was hit on them.
 */
export function goalStreak(days: { day: string; doneCount: number; goal: number }[], today: string, workDays: number[]): number {
  if (days.length === 0) return 0;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const earliest = days.reduce((min, d) => (d.day < min ? d.day : min), today);
  const hit = (day: string) => {
    const d = byDay.get(day);
    return d !== undefined && d.doneCount >= d.goal;
  };
  let streak = hit(today) ? 1 : 0;
  for (let cur = addDays(today, -1); cur >= earliest; cur = addDays(cur, -1)) {
    if (hit(cur)) streak++;
    else if (isWorkingDay(cur, workDays)) break;
  }
  return streak;
}

/** Consecutive most recent calendar days scoring at or above threshold (70 counts as above). */
export function scoreStreakAbove(scores: { day: string; score: number }[], threshold = 70): number {
  const sorted = [...scores].sort((a, b) => (a.day < b.day ? 1 : -1));
  let streak = 0;
  for (const s of sorted) {
    if (s.score < threshold) break;
    if (streak > 0 && addDays(s.day, 1) !== sorted[streak - 1].day) break;
    streak++;
  }
  return streak;
}

export function adjustedDailyGoal(base: number, energy: EnergyLevel | null): number {
  return energy === "low" ? Math.max(1, base - 1) : base;
}
