// Pure calendar helpers. Every date is 'YYYY-MM-DD' in settings.timezone; nothing reads the browser zone.

import { addDays, formatDate, hm, isoWeekday, localDate, localMinutes, parseDate } from "@/engine/time";
import type { Task } from "@/engine/types";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SLOT_MIN = 15;

export const isOpen = (t: Task) => t.status === "todo" || t.status === "waiting";

export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDays(date: string): string[] {
  const mon = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** Monday-first weeks covering the month of `date`, padded with days of the months around it. */
export function monthGrid(date: string): string[][] {
  const { y, m } = parseDate(date);
  const first = formatDate(y, m, 1);
  const last = formatDate(y, m + 1, 0);
  const weeks: string[][] = [];
  for (let d = mondayOf(first); d <= last; d = addDays(d, 7)) weeks.push(weekDays(d));
  return weeks;
}

/** Same day of month in the month `n` away, clamped to that month's length. */
export function shiftMonth(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const len = parseDate(formatDate(y, m + n + 1, 0)).d;
  return formatDate(y, m + n, Math.min(d, len));
}

export function monthLabel(date: string): string {
  const { y, m } = parseDate(date);
  return `${MONTHS[m - 1]} ${y}`;
}

export function weekLabel(days: string[]): string {
  const a = parseDate(days[0]);
  const b = parseDate(days[6]);
  const mon = (m: number) => MONTHS[m - 1].slice(0, 3);
  return a.m === b.m ? `${a.d} to ${b.d} ${mon(b.m)} ${b.y}` : `${a.d} ${mon(a.m)} to ${b.d} ${mon(b.m)} ${b.y}`;
}

/** Quick-add text that the parser reads as this date, like '14 oct' (year only when it differs). */
export function presetFor(date: string, today: string): string {
  const { y, m, d } = parseDate(date);
  const base = `${d} ${MONTHS[m - 1].slice(0, 3).toLowerCase()}`;
  return y === parseDate(today).y ? base : `${base} ${y}`;
}

export interface DayItems {
  timed: Task[];
  due: Task[];
  follow: Task[];
  ready: Task[];
}

/** Tasks grouped by the local day they land on, per kind. Timed items stay sorted by time. */
export function indexByDay(tasks: Task[], tz: string): Map<string, DayItems> {
  const map = new Map<string, DayItems>();
  const at = (day: string) => {
    let v = map.get(day);
    if (!v) map.set(day, (v = { timed: [], due: [], follow: [], ready: [] }));
    return v;
  };
  for (const t of tasks) {
    if (t.status === "dropped") continue;
    if (t.scheduled_at) at(localDate(t.scheduled_at, tz)).timed.push(t);
    if (!isOpen(t)) continue;
    if (t.deadline) at(t.deadline).due.push(t);
    if (t.follow_up) at(t.follow_up).follow.push(t);
    if (t.ready_by) at(t.ready_by).ready.push(t);
  }
  for (const v of map.values()) v.timed.sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  return map;
}

export interface Span {
  day: string;
  start: number; // minutes since local midnight
  end: number;
}

/** Local day and minute range of an instant range; anything past midnight is clipped to the day. */
export function spanOf(startIso: string, endIso: string, tz: string): Span {
  const day = localDate(startIso, tz);
  const start = localMinutes(startIso, tz);
  const end = localDate(endIso, tz) === day ? localMinutes(endIso, tz) : 1440;
  return { day, start, end: Math.max(end, start + SLOT_MIN) };
}

/** Visible hours: work hours stretched to fit every item, on whole hours. */
export function hourRange(workStart: string, workEnd: string, spans: Span[]): [number, number] {
  let lo = hm(workStart);
  let hi = hm(workEnd);
  for (const s of spans) {
    lo = Math.min(lo, s.start);
    hi = Math.max(hi, s.end);
  }
  return [Math.floor(lo / 60) * 60, Math.min(1440, Math.ceil(hi / 60) * 60)];
}

/** Where a dragged block lands: whole day columns sideways, 15-minute steps up and down, kept inside the grid. */
export function dropTarget(
  from: { day: number; min: number; dur: number },
  dx: number,
  dy: number,
  colW: number,
  pxPerMin: number,
  range: [number, number],
): { day: number; min: number } {
  const day = Math.max(0, Math.min(6, from.day + Math.round(dx / colW)));
  const raw = Math.round((from.min + dy / pxPerMin) / SLOT_MIN) * SLOT_MIN;
  const min = Math.max(range[0], Math.min(range[1] - from.dur, raw));
  return { day, min };
}
