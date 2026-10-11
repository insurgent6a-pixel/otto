import { describe, expect, it } from "vitest";
import { nightlySweep } from "./sweep";
import { DEFAULT_SETTINGS as s, makeTask, type ScheduleBlock, type Task } from "./types";

const now = new Date("2026-10-11T16:30:00Z"); // Mon 00:30 WITA, sweep time
const t = (p: Partial<Task> & { title: string }) => makeTask({ created_at: "2026-10-10T00:00:00Z", ...p });
const block = (task_id: string, start_at: string, end_at: string): ScheduleBlock => ({
  id: `b-${task_id}-${start_at}`,
  task_id,
  start_at,
  end_at,
  pinned: false,
  source: "auto",
});

describe("nightlySweep", () => {
  it("recomputes start_by_auto only when it changed", () => {
    const stale = t({ title: "stale", deadline: "2026-10-16", start_by_auto: "2026-10-01" });
    const ok = t({ title: "ok", deadline: "2026-10-16", start_by_auto: "2026-10-13" });
    const cleared = t({ title: "cleared", start_by_auto: "2026-10-13" });
    const done = t({ title: "done", status: "done", deadline: "2026-10-16" });
    const r = nightlySweep([stale, ok, cleared, done], [], now, s);
    expect(r.patches).toEqual([
      { id: stale.id, patch: { start_by_auto: "2026-10-13" }, why: "start_by" },
      { id: cleared.id, patch: { start_by_auto: null }, why: "start_by" },
    ]);
    expect(r.needsSchedule).toEqual([cleared.id]);
  });

  it("gives waiting items a return date and resumes ones past it", () => {
    const noDate = t({ title: "no date", status: "waiting" });
    const dueToday = t({ title: "today", status: "waiting", follow_up: "2026-10-12" });
    const past = t({ title: "past", status: "waiting", follow_up: "2026-10-11" });
    const r = nightlySweep([noDate, dueToday, past], [], now, s);
    expect(r.patches).toEqual([
      { id: noDate.id, patch: { follow_up: "2026-10-15" }, why: "follow_up_set" },
      { id: past.id, patch: { status: "todo" }, why: "resumed" },
    ]);
    // the resumed one is now an open todo with nothing planned
    expect(r.needsSchedule).toEqual([past.id]);
  });

  it("forces and merges patches into one entry", () => {
    const t1 = t({ title: "nagging", postpone_count: 3, deadline: "2026-10-30", deadline_confirmed: true });
    const r = nightlySweep([t1], [], now, s);
    expect(r.patches).toEqual([{ id: t1.id, patch: { start_by_auto: "2026-10-28", forced: true }, why: "forced" }]);
  });

  it("14 days open: forced only without an upcoming block", () => {
    const old = t({ title: "old", created_at: "2026-09-27T00:00:00Z" });
    expect(nightlySweep([old], [], now, s).patches[0]).toEqual({ id: old.id, patch: { forced: true }, why: "forced" });
    const future = block(old.id, "2026-10-12T02:00:00Z", "2026-10-12T03:00:00Z");
    const r = nightlySweep([old], [future], now, s);
    expect(r.patches).toEqual([]);
    expect(r.needsSchedule).toEqual([]);
    // a block that already ended does not count
    const ended = block(old.id, "2026-10-09T02:00:00Z", "2026-10-09T03:00:00Z");
    expect(nightlySweep([old], [ended], now, s).patches).toHaveLength(1);
  });

  it("needsSchedule skips timed, start-by and blocks within 7 days", () => {
    const timed = t({ title: "timed", scheduled_at: "2026-10-20T01:00:00Z" });
    const manual = t({ title: "manual", start_by_manual: "2026-10-14" });
    const later = t({ title: "later" });
    const soon = t({ title: "soon" });
    const blocks = [
      block(later.id, "2026-10-20T01:00:00Z", "2026-10-20T02:00:00Z"),
      block(soon.id, "2026-10-15T01:00:00Z", "2026-10-15T02:00:00Z"),
    ];
    expect(nightlySweep([timed, manual, later, soon], blocks, now, s).needsSchedule).toEqual([later.id]);
  });
});
