// Phase 5 learning: energy by hour, estimate accuracy, best hours, follow-up timing, weekly review.
import type { EnergyCheckin, EnergyLevel, Project, Task, TaskEvent, TimeWindow } from "./types";
import { addDays, isoWeekday, localDate, localParts } from "./time";
import { ENERGY_LABEL, spellStart } from "./messages";

export interface EnergyCell {
  avg: number;
  n: number;
}
/** grid[isoWeekday - 1][hour] */
export type EnergyGrid = EnergyCell[][];

const LEVEL_VALUE: Record<EnergyLevel, number> = { low: 0, ok: 1, high: 2 };
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PERIODS = [
  { name: "mornings", from: 5, to: 12 },
  { name: "afternoons", from: 12, to: 17 },
  { name: "evenings", from: 17, to: 22 },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pad = (n: number) => String(n).padStart(2, "0");

export function energyByHourWeekday(checkins: EnergyCheckin[], tz: string): EnergyGrid {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })));
  for (const c of checkins) {
    const p = localParts(c.at, tz);
    const cell = grid[p.weekday - 1][p.hour];
    cell.sum += LEVEL_VALUE[c.level];
    cell.n++;
  }
  return grid.map((row) => row.map(({ sum, n }) => ({ avg: n ? sum / n : 0, n })));
}

/** "You're usually Charged Tuesday mornings." Charged groups win over Low ones; Okay is not news. */
export function energyInsight(grid: EnergyGrid): string | null {
  let best: { text: string; rank: number } | null = null;
  for (let wd = 0; wd < grid.length; wd++) {
    for (const period of PERIODS) {
      const cells = grid[wd].slice(period.from, period.to);
      const n = cells.reduce((s, c) => s + c.n, 0);
      if (n < 2) continue;
      const avg = cells.reduce((s, c) => s + c.avg * c.n, 0) / n;
      const level: EnergyLevel | null = avg >= 1.5 ? "high" : avg <= 0.5 ? "low" : null;
      if (!level) continue;
      // Charged first, then the most extreme average, then the most data.
      const rank = (level === "high" ? 1000 : 0) + Math.abs(avg - 1) * 100 + n;
      if (!best || rank > best.rank)
        best = { text: `You're usually ${ENERGY_LABEL[level]} ${DAY_NAMES[wd]} ${period.name}.`, rank };
    }
  }
  return best?.text ?? null;
}

/** Contiguous true hours as 'HH:mm' windows. */
function windowsFromHours(on: boolean[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (let h = 0; h < 24; h++) {
    if (!on[h]) continue;
    const start = h;
    while (h + 1 < 24 && on[h + 1]) h++;
    out.push({ start: `${pad(start)}:00`, end: h === 23 ? "23:59" : `${pad(h + 1)}:00` });
  }
  return out;
}

/** Null until check-ins span minDays distinct local days; then hours averaging Charged-ish (>= 1.5). */
export function suggestEnergyWindows(checkins: EnergyCheckin[], tz: string, minDays = 14): TimeWindow[] | null {
  if (new Set(checkins.map((c) => localDate(c.at, tz))).size < minDays) return null;
  const grid = energyByHourWeekday(checkins, tz);
  const on = Array.from({ length: 24 }, (_, h) => {
    const n = grid.reduce((s, row) => s + row[h].n, 0);
    return n > 0 && grid.reduce((s, row) => s + row[h].avg * row[h].n, 0) / n >= 1.5;
  });
  return windowsFromHours(on);
}

/** Median actual/estimate over the last 20 samples (oldest first). */
export function estimateLearning(samples: { estimate_min: number; actual_min: number }[]): {
  ratio: number;
  n: number;
  suggest: boolean;
} {
  const ratios = samples
    .filter((s) => s.estimate_min > 0)
    .slice(-20)
    .map((s) => s.actual_min / s.estimate_min);
  if (ratios.length === 0) return { ratio: 1, n: 0, suggest: false };
  const ratio = Math.round(median(ratios) * 100) / 100;
  return { ratio, n: ratios.length, suggest: ratios.length >= 20 && (ratio < 0.8 || ratio > 1.2) };
}

/** Completions in the 30 days up to now, counted by local hour. */
export function bestHours(doneAts: string[], tz: string, now: Date): { hours: number[]; days: number } {
  const from = now.getTime() - 30 * 86400000;
  const recent = doneAts.filter((at) => {
    const t = new Date(at).getTime();
    return t > from && t <= now.getTime();
  });
  const hours = Array<number>(24).fill(0);
  for (const at of recent) hours[localParts(at, tz).hour]++;
  return { hours, days: new Set(recent.map((at) => localDate(at, tz))).size };
}

// ponytail: "best" = within 60% of the peak hour; swap for a proper density estimate if it feels noisy.
export function suggestFromBestHours(doneAts: string[], tz: string, now: Date, minDays = 14): TimeWindow[] | null {
  const { hours, days } = bestHours(doneAts, tz, now);
  if (days < minDays) return null;
  const peak = Math.max(...hours);
  return windowsFromHours(hours.map((c) => c >= 2 && c >= peak * 0.6));
}

export interface FollowUpTiming {
  contact: string;
  medianDays: number;
  n: number;
}

/**
 * Days from 'waiting_started' to the next 'resumed' or 'done' per contact. The contact is
 * event.meta.waiting_on when logged, else the task's current waiting_on.
 */
export function followUpTiming(events: TaskEvent[], tasks: Task[]): FollowUpTiming[] {
  const taskContact = new Map(tasks.map((t) => [t.id, t.waiting_on]));
  const byTask = new Map<string, TaskEvent[]>();
  for (const e of events) {
    if (!e.task_id) continue;
    byTask.set(e.task_id, [...(byTask.get(e.task_id) ?? []), e]);
  }
  const groups = new Map<string, { contact: string; days: number[] }>();
  for (const [taskId, list] of byTask) {
    list.sort((a, b) => (a.at < b.at ? -1 : 1));
    let open: TaskEvent | null = null;
    for (const e of list) {
      if (e.kind === "waiting_started") open = e;
      else if (open && (e.kind === "resumed" || e.kind === "done")) {
        const contact = (typeof open.meta?.waiting_on === "string" ? open.meta.waiting_on : taskContact.get(taskId))?.trim();
        if (contact) {
          const key = contact.toLowerCase();
          const g = groups.get(key) ?? { contact, days: [] };
          g.days.push((new Date(e.at).getTime() - new Date(open.at).getTime()) / 86400000);
          groups.set(key, g);
        }
        open = null;
      }
    }
  }
  return [...groups.values()]
    .map((g) => ({ contact: g.contact, medianDays: Math.round(median(g.days) * 10) / 10, n: g.days.length }))
    .sort((a, b) => a.contact.localeCompare(b.contact));
}

/** Learned days once a contact has 3 or more round trips, else the fallback (settings.followup_days). */
export function suggestFollowUpDays(contact: string, timings: FollowUpTiming[], fallback: number): number {
  const t = timings.find((x) => x.contact.toLowerCase() === contact.trim().toLowerCase());
  return t && t.n >= 3 ? Math.max(1, Math.round(t.medianDays)) : fallback;
}

export interface WeeklyReview {
  doneCount: number;
  avgScore: number | null;
  bestDay: { day: string; score: number } | null;
  energyInsight: string | null;
  topProject: Project | null;
  line: string;
}

/** Week = weekStart plus 6 days. Energy insight uses every check-in passed, since it is about habits. */
export function weeklyReview(input: {
  scores: { day: string; score: number }[];
  tasks: Task[];
  checkins: EnergyCheckin[];
  tz: string;
  weekStart: string;
}): WeeklyReview {
  const { scores, tasks, checkins, tz, weekStart } = input;
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;
  const done = tasks.filter((t) => t.status === "done" && t.done_at && inWeek(localDate(t.done_at, tz)));
  const weekScores = scores.filter((s) => inWeek(s.day));
  const avgScore = weekScores.length ? Math.round(weekScores.reduce((s, x) => s + x.score, 0) / weekScores.length) : null;
  const bestDay = weekScores.reduce<{ day: string; score: number } | null>((b, s) => (!b || s.score > b.score ? s : b), null);

  const perProject = new Map<Project, number>();
  for (const t of done) if (t.project) perProject.set(t.project, (perProject.get(t.project) ?? 0) + 1);
  const topProject = [...perProject].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const first =
    done.length === 0
      ? "Quiet week."
      : `${spellStart(done.length)} ${done.length === 1 ? "task" : "tasks"} done this week${avgScore === null ? "" : `, average score ${avgScore}`}.`;
  const second = bestDay
    ? `${DAY_NAMES[isoWeekday(bestDay.day) - 1]} was your best day at ${bestDay.score}.`
    : "Next week starts fresh.";

  return {
    doneCount: done.length,
    avgScore,
    bestDay: bestDay ? { day: bestDay.day, score: bestDay.score } : null,
    energyInsight: energyInsight(energyByHourWeekday(checkins, tz)),
    topProject,
    line: `${first} ${second}`,
  };
}
