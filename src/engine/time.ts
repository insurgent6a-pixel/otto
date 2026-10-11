// Timezone math on top of Intl only. Every local date/time is relative to an IANA zone passed in,
// so changing settings.timezone moves the whole app with no other code changes.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday, Monday = 1 ... Sunday = 7 */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toDate(instant: Date | string | number): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

export function localParts(instant: Date | string | number, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(toDate(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD' of the instant in tz. */
export function localDate(instant: Date | string | number, tz: string): string {
  const p = localParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'HH:mm' of the instant in tz. */
export function localTime(instant: Date | string | number, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since local midnight. */
export function localMinutes(instant: Date | string | number, tz: string): number {
  const p = localParts(instant, tz);
  return p.hour * 60 + p.minute;
}

/** Offset of tz from UTC at the instant, in minutes (WITA = +480). */
export function tzOffsetMinutes(instant: Date | string | number, tz: string): number {
  const d = toDate(instant);
  const p = localParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** The instant at which the wall clock in tz reads `date time`. */
export function zonedInstant(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle DST edges: the offset at the guess can differ from the offset at the answer.
  let offset = tzOffsetMinutes(guess, tz);
  let result = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(result, tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** Instant of local midnight starting `date`. */
export function startOfLocalDay(date: string, tz: string): Date {
  return zonedInstant(date, "00:00", tz);
}

export function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function formatDate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  return formatDate(y, m, d + n);
}

/** b - a in whole calendar days. */
export function diffDays(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** ISO weekday of a calendar date, Monday = 1. */
export function isoWeekday(date: string): number {
  const { y, m, d } = parseDate(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isWorkingDay(date: string, workDays: number[]): boolean {
  return workDays.includes(isoWeekday(date));
}

/** Moves n working days from date. n may be negative. Lands on a working day when n != 0. */
export function addWorkingDays(date: string, n: number, workDays: number[]): string {
  if (workDays.length === 0) return addDays(date, n);
  let cur = date;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkingDay(cur, workDays)) left--;
  }
  return cur;
}

/** 'HH:mm' to minutes since midnight. */
export function hm(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function hmString(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** True when minute-of-day falls inside a window that may wrap midnight (21:00 to 08:00). */
export function inWindow(minuteOfDay: number, start: string, end: string): boolean {
  const s = hm(start);
  const e = hm(end);
  if (s === e) return false;
  return s < e ? minuteOfDay >= s && minuteOfDay < e : minuteOfDay >= s || minuteOfDay < e;
}

export function addMinutes(instant: Date | string, minutes: number): Date {
  return new Date(toDate(instant).getTime() + minutes * 60000);
}

/** Short label for a timezone, e.g. 'WITA' or 'GMT+8'. */
export const TZ_SHORT: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function tzLabel(tz: string, at: Date = new Date()): string {
  if (TZ_SHORT[tz]) return TZ_SHORT[tz];
  const off = tzOffsetMinutes(at, tz);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `GMT${sign}${Math.floor(a / 60)}${a % 60 ? ":" + pad(a % 60) : ""}`;
}

/** ISO string with the zone's offset, e.g. '2026-10-12T14:00:00+08:00'. */
export function isoWithOffset(instant: Date | string, tz: string): string {
  const d = toDate(instant);
  const p = localParts(d, tz);
  const off = tzOffsetMinutes(d, tz);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
