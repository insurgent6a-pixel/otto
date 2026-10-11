// Copy helpers shared by the engine and the UI. Plain English, no locale lookups.

import { diffDays, isoWeekday, parseDate } from "./time";
import type { Project, Task } from "./types";

export function dueLabel(deadline: string, today: string, confirmed: boolean): string {
  const d = diffDays(today, deadline);
  const base =
    d === 0
      ? "due today"
      : d === 1
        ? "due tomorrow"
        : d > 1
          ? `due in ${d} days`
          : d === -1
            ? "1 day late"
            : `${-d} days late`;
  return confirmed ? base : `${base}, unconfirmed`;
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function estimateLabel(task: Pick<Task, "estimate_min">): string {
  return `~${durationLabel(task.estimate_min ?? 60)}`;
}

export function timeLeftLabel(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function timesLabel(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

const PROJECT_NAMES: Record<Project, string> = {
  omnisync: "OmniSync",
  teba: "Teba",
  content: "Content",
  personal: "Personal",
};

export function projectName(p: Project | null): string {
  return p ? PROJECT_NAMES[p] : "Unsorted";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function relativeDayLabel(date: string, today: string): string {
  const d = diffDays(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  const { m, d: day } = parseDate(date);
  return `${WEEKDAYS[isoWeekday(date) - 1]} ${day} ${MONTHS[m - 1]}`;
}

/** relativeDayLabel for mid-sentence use: "back tomorrow", "back Thu 15 Oct". */
export function relativeDayInline(date: string, today: string): string {
  const label = relativeDayLabel(date, today);
  return label === "Today" || label === "Tomorrow" || label === "Yesterday" ? label.toLowerCase() : label;
}
