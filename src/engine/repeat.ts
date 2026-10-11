// Phase 6 repeats: the next instance exists only once the current one is done or dropped.
import { RRule, type Options, type Weekday } from "rrule";
import type { Task } from "./types";
import { addDays, diffDays, localDate, localTime, parseDate, zonedInstant } from "./time";

// rrule works on floating dates: we feed it UTC midnights and read them back as local calendar dates.
const toUtc = (date: string) => {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

function parse(rrule: string): Partial<Options> | null {
  try {
    const opts = RRule.parseString(rrule.replace(/^RRULE:/i, "").trim());
    return opts.freq === undefined ? null : opts;
  } catch {
    return null;
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

/** Next occurrence after `anchor` that is not before `today`. Null when the rule has ended or is invalid. */
export function nextDate(rrule: string, anchor: string, today: string): string | null {
  const opts = parse(rrule);
  if (!opts) return null;
  const day = parseDate(anchor).d;
  // RFC 5545 skips months without the 31st; a repeating task should land on the month's last day instead.
  // ponytail: after a short month the series drifts to that day (31 -> 28 -> 28), store the original day if it matters.
  if (opts.freq === RRule.MONTHLY && day > 28 && isEmpty(opts.bymonthday) && isEmpty(opts.byweekday) && isEmpty(opts.bysetpos)) {
    opts.bymonthday = Array.from({ length: day - 27 }, (_, i) => 28 + i);
    opts.bysetpos = [-1];
  }
  const rule = new RRule({ ...opts, dtstart: toUtc(anchor) });
  // Catch up to today so finishing a stale repeat never spawns another overdue one.
  const floor = anchor >= today ? anchor : addDays(today, -1);
  const next = rule.after(toUtc(floor), false);
  return next ? fromUtc(next) : null;
}

/**
 * Payload for the next instance of a repeating task, or null when it does not repeat.
 * Anchor = scheduled_at local date, else deadline, else plan_for, else today. Every date field the
 * task has moves by the same number of days; scheduled_at keeps its local time of day.
 */
export function nextInstance(task: Task, now: Date, tz: string): Partial<Task> | null {
  if (!task.rrule) return null;
  const today = localDate(now, tz);
  const anchor = (task.scheduled_at && localDate(task.scheduled_at, tz)) ?? task.deadline ?? task.plan_for ?? today;
  const next = nextDate(task.rrule, anchor, today);
  if (!next) return null;
  const shift = diffDays(anchor, next);

  const payload: Partial<Task> = {
    title: task.title,
    project: task.project,
    priority: task.priority,
    estimate_min: task.estimate_min,
    energy: task.energy,
    rrule: task.rrule,
    value_idr: task.value_idr,
    next_action: task.next_action,
    series_id: task.series_id ?? task.id,
    status: "todo",
    postpone_count: 0,
    forced: false,
    depends_on: [],
  };
  if (task.scheduled_at)
    payload.scheduled_at = zonedInstant(next, localTime(task.scheduled_at, tz), tz).toISOString();
  if (task.deadline) {
    payload.deadline = addDays(task.deadline, shift);
    payload.deadline_confirmed = task.deadline_confirmed;
  }
  if (task.plan_for || (!task.scheduled_at && !task.deadline)) payload.plan_for = addDays(task.plan_for ?? anchor, shift);
  return payload;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNIT: Partial<Record<number, string>> = {
  [RRule.DAILY]: "day",
  [RRule.WEEKLY]: "week",
  [RRule.MONTHLY]: "month",
  [RRule.YEARLY]: "year",
};

/** 'Every Mon, Wed, Fri', 'Every weekday', 'Every 2 weeks'. */
export function describeRrule(rrule: string): string {
  const opts = parse(rrule);
  if (!opts) return "Repeats";
  const interval = opts.interval ?? 1;
  // parseString always yields Weekday objects (Monday = 0).
  const days = ((opts.byweekday ?? []) as Weekday[]).map((w) => w.weekday).sort((a, b) => a - b);
  const unit = UNIT[opts.freq as number];
  if (!unit) return "Repeats";
  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  if (days.length && (opts.freq === RRule.WEEKLY || opts.freq === RRule.DAILY)) {
    if (interval === 1 && days.join() === "0,1,2,3,4") return "Every weekday";
    const list = days.map((d) => DAY_SHORT[d]).join(", ");
    return interval === 1 ? `Every ${list}` : `${every} on ${list}`;
  }
  return every;
}
