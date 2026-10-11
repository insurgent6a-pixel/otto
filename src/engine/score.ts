// Priority score, spec section 5.

import { dueLabel, timesLabel } from "./format";
import { effectiveStartBy } from "./startby";
import { diffDays, localDate } from "./time";
import type { Settings, Task } from "./types";

export interface ScoreContext {
  settings: Settings;
  tasksById?: Map<string, Task>;
}

export interface ScorePart {
  key: "priority" | "deadline" | "overdue" | "startBy" | "postponed" | "age" | "followUp";
  points: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  parts: ScorePart[];
  blocked: boolean;
}

const PRIORITY_POINTS = [50, 40, 25, 15, 5];

export function isBlocked(task: Task, tasksById: Map<string, Task>): boolean {
  return task.depends_on.some((id) => {
    const dep = tasksById.get(id);
    return dep !== undefined && dep.status !== "done" && dep.status !== "dropped";
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreTask(task: Task, now: Date, ctx: ScoreContext): ScoreResult {
  if (ctx.tasksById && isBlocked(task, ctx.tasksById)) {
    return { score: 0, reasons: [], parts: [], blocked: true };
  }
  const { settings } = ctx;
  const today = localDate(now, settings.timezone);
  const parts: ScorePart[] = [];

  const p = task.priority;
  parts.push(
    p === null
      ? { key: "priority", points: 20, reason: "unsorted" }
      : { key: "priority", points: PRIORITY_POINTS[p] ?? 5, reason: `P${p}` },
  );

  if (task.deadline) {
    const reason = dueLabel(task.deadline, today, task.deadline_confirmed);
    if (task.deadline < today) {
      parts.push({ key: "overdue", points: 45, reason });
    } else {
      const daysLeft = diffDays(today, task.deadline);
      const estimateDays = (task.estimate_min ?? 60) / settings.focus_cap_min;
      const urgency = 40 * Math.min(1, Math.max(0, 1 - (daysLeft - estimateDays) / 14));
      parts.push({ key: "deadline", points: round1(urgency * (task.deadline_confirmed ? 1 : 0.7)), reason });
    }
  }

  // Passed means strictly before today: the start-by day itself is still on time.
  const startBy = effectiveStartBy(task).date;
  if (startBy && startBy < today) parts.push({ key: "startBy", points: 15, reason: "start-by passed" });

  if (task.postpone_count > 0) {
    parts.push({
      key: "postponed",
      points: Math.min(32, 8 * task.postpone_count),
      reason: `postponed ${timesLabel(task.postpone_count)}`,
    });
  }

  const openDays = diffDays(localDate(task.created_at, settings.timezone), today);
  if (openDays >= 3) {
    parts.push({ key: "age", points: Math.min(10, Math.floor(openDays / 3)), reason: `open ${openDays} days` });
  }

  if (task.status === "waiting" && task.follow_up && task.follow_up <= today) {
    parts.push({ key: "followUp", points: 30, reason: "follow-up date reached" });
  }

  const scored = parts.filter((x) => x.points > 0);
  // Stable sort keeps priority ahead on ties since it was pushed first.
  const reasons = [...scored]
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((x) => x.reason);
  const score = round1(scored.reduce((sum, x) => sum + x.points, 0));
  return { score, reasons, parts: scored, blocked: false };
}

export function reasonLine(result: Pick<ScoreResult, "reasons">): string {
  const line = result.reasons.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
