// Phase 6 calendar feed (/cal/<secret>.ics). No VALARM: Electra turns Remove Alerts off when subscribing.
import type { ScheduleBlock, Task } from "./types";
import { addDays, addMinutes } from "./time";

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** RFC 5545 folding: lines over 75 octets continue on the next line after a single space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    // Continuation lines spend one octet on the leading space.
    if (bytes + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += len;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const utcStamp = (d: Date | string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateValue = (date: string) => date.replace(/-/g, "");

export function buildIcs(input: { tasks: Task[]; blocks: ScheduleBlock[]; tz: string; now: Date; name?: string }): string {
  const { tasks, blocks, tz, now } = input;
  const stamp = utcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Otto//Otto//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name ?? "Otto")}`,
    `X-WR-TIMEZONE:${tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  const event = (uid: string, summary: string, when: string[]) =>
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${escapeText(summary)}`, "END:VEVENT");
  const allDay = (date: string) => [`DTSTART;VALUE=DATE:${dateValue(date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(date, 1))}`];
  const timed = (start: Date | string, end: Date | string) => [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];

  const open = tasks.filter((t) => t.status === "todo" || t.status === "waiting");
  for (const t of open) {
    if (t.deadline) event(`${t.id}-due@otto`, `Due: ${t.title}${t.deadline_confirmed ? "" : " (unconfirmed)"}`, allDay(t.deadline));
    if (t.follow_up) event(`${t.id}-followup@otto`, `Follow up: ${t.title}`, allDay(t.follow_up));
    if (t.ready_by) event(`${t.id}-ready@otto`, `Ready: ${t.title}`, allDay(t.ready_by));
    if (t.scheduled_at)
      event(`${t.id}-at@otto`, t.title, timed(t.scheduled_at, addMinutes(t.scheduled_at, t.estimate_min ?? 30)));
  }
  const byId = new Map(open.map((t) => [t.id, t]));
  for (const b of blocks) {
    const t = byId.get(b.task_id);
    if (t) event(`${b.id}-block@otto`, t.title, timed(b.start_at, b.end_at));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
