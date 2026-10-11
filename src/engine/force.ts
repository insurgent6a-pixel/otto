// Force rule and the buttons around it, spec section 7.

import { timesLabel } from "./format";
import { addDays, addWorkingDays, diffDays, localDate } from "./time";
import type { Settings, Task } from "./types";

export const FORCE_POSTPONES = 3;
export const FORCE_OPEN_DAYS = 14;

export function daysOpen(task: Pick<Task, "created_at">, now: Date, settings: Settings): number {
  const tz = settings.timezone;
  return diffDays(localDate(task.created_at, tz), localDate(now, tz));
}

export function shouldForce(task: Task, now: Date, settings: Settings, hasUpcomingBlock: boolean): boolean {
  if (task.status !== "todo" || task.forced) return false;
  if (task.postpone_count >= FORCE_POSTPONES) return true;
  return daysOpen(task, now, settings) >= FORCE_OPEN_DAYS && task.scheduled_at === null && !hasUpcomingBlock;
}

export type PostponeKind = "tomorrow" | "not_today" | "later_today";

/** 'tomorrow' jumps to the next working day, 'not_today' to the next calendar day. */
export function postponePatch(
  task: Task,
  kind: PostponeKind,
  now: Date,
  settings: Settings,
  hasUpcomingBlock = false,
): Partial<Task> {
  if (kind === "later_today") return {};
  const today = localDate(now, settings.timezone);
  const patch: Partial<Task> = {
    postpone_count: task.postpone_count + 1,
    plan_for: kind === "tomorrow" ? addWorkingDays(today, 1, settings.work_days) : addDays(today, 1),
  };
  if (shouldForce({ ...task, ...patch }, now, settings, hasUpcomingBlock)) patch.forced = true;
  return patch;
}

export function shrinkPatch(firstStep: string): Partial<Task> {
  return { next_action: firstStep, estimate_min: 15, postpone_count: 1, forced: false };
}

export function handOffPatch(who: string, returnDate: string): Partial<Task> {
  return { status: "waiting", waiting_on: who, follow_up: returnDate, forced: false };
}

/** Pass the forced block's local 'HH:mm', or null before the scheduler has placed one. */
export function forcedMessage(task: Pick<Task, "postpone_count">, time: string | null): string {
  const why =
    task.postpone_count >= FORCE_POSTPONES
      ? `Postponed ${timesLabel(task.postpone_count)}.`
      : "Open 2 weeks with no plan.";
  return `${why} ${time ? `Locked in for ${time}.` : "Locked in for the next free slot."}`;
}
