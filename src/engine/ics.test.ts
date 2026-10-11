import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "./ics";
import { makeTask, type ScheduleBlock } from "./types";

const now = new Date("2026-10-12T02:00:00.123Z");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("escaping and folding", () => {
  it("escapes text values", () => {
    expect(escapeText("a, b; c\\d\nnext\r\nline")).toBe("a\\, b\\; c\\\\d\\nnext\\nline");
  });

  it("folds at 75 octets with a leading space", () => {
    const line = `SUMMARY:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    for (const p of parts.slice(1)) {
      expect(p.startsWith(" ")).toBe(true);
      expect(p.length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("short")).toBe("short");
  });

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const parts = foldLine(line).split("\r\n");
    const enc = new TextEncoder();
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
  });
});

describe("buildIcs", () => {
  const tasks = [
    makeTask({ id: "t1", title: "Navaho payments, part 2; final", deadline: "2026-10-15" }),
    makeTask({ id: "t2", title: "Sultan agreement", deadline: "2026-10-20", deadline_confirmed: true, status: "waiting", follow_up: "2026-10-14" }),
    makeTask({ id: "t3", title: "Compost batch", ready_by: "2026-11-01" }),
    makeTask({ id: "t4", title: "Call Pak Arief", scheduled_at: "2026-10-13T01:00:00Z", estimate_min: 45 }),
    makeTask({ id: "t5", title: "Quick call", scheduled_at: "2026-10-13T03:00:00Z" }),
    makeTask({ id: "t6", title: "Done thing", deadline: "2026-10-15", status: "done" }),
    makeTask({ id: "t7", title: "Dropped thing", scheduled_at: "2026-10-13T03:00:00Z", status: "dropped" }),
  ];
  const blocks: ScheduleBlock[] = [
    { id: "b1", task_id: "t1", start_at: "2026-10-14T00:30:00Z", end_at: "2026-10-14T01:30:00Z", pinned: false, source: "auto" },
    { id: "b2", task_id: "t6", start_at: "2026-10-14T02:00:00Z", end_at: "2026-10-14T03:00:00Z", pinned: false, source: "auto" },
  ];
  const ics = buildIcs({ tasks, blocks, tz: "Asia/Makassar", now });
  const text = unfold(ics);

  it("is a CRLF calendar with feed headers", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(text).toContain("X-WR-CALNAME:Otto\r\n");
    expect(text).toContain("X-WR-TIMEZONE:Asia/Makassar\r\n");
    expect(text).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n");
    expect(text).toContain("X-PUBLISHED-TTL:PT15M\r\n");
    expect(text).toContain("DTSTAMP:20261012T020000Z\r\n");
    expect(text).not.toContain("VALARM");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("writes deadlines, follow-ups and ready dates as all-day events", () => {
    expect(text).toContain(
      "UID:t1-due@otto\r\nDTSTAMP:20261012T020000Z\r\nDTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261016\r\nSUMMARY:Due: Navaho payments\\, part 2\\; final (unconfirmed)\r\n",
    );
    expect(text).toContain("SUMMARY:Due: Sultan agreement\r\n");
    expect(text).toContain("UID:t2-followup@otto\r\nDTSTAMP:20261012T020000Z\r\nDTSTART;VALUE=DATE:20261014\r\nDTEND;VALUE=DATE:20261015\r\nSUMMARY:Follow up: Sultan agreement\r\n");
    expect(text).toContain("UID:t3-ready@otto\r\nDTSTAMP:20261012T020000Z\r\nDTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102\r\nSUMMARY:Ready: Compost batch\r\n");
  });

  it("writes timed tasks and blocks in UTC", () => {
    expect(text).toContain("UID:t4-at@otto\r\nDTSTAMP:20261012T020000Z\r\nDTSTART:20261013T010000Z\r\nDTEND:20261013T014500Z\r\nSUMMARY:Call Pak Arief\r\n");
    expect(text).toContain("DTSTART:20261013T030000Z\r\nDTEND:20261013T033000Z\r\nSUMMARY:Quick call\r\n");
    expect(text).toContain("UID:b1-block@otto\r\nDTSTAMP:20261012T020000Z\r\nDTSTART:20261014T003000Z\r\nDTEND:20261014T013000Z\r\n");
  });

  it("skips done and dropped tasks and their blocks", () => {
    expect(text).not.toContain("Done thing");
    expect(text).not.toContain("Dropped thing");
    expect(text).not.toContain("b2-block");
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(7);
  });

  it("takes a custom name", () => {
    expect(buildIcs({ tasks: [], blocks: [], tz: "Asia/Jakarta", now, name: "Otto, work" })).toContain("X-WR-CALNAME:Otto\\, work\r\n");
  });
});
