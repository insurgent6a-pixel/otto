import { describe, expect, it } from "vitest";
import { describeRrule, nextDate, nextInstance } from "./repeat";
import { makeTask } from "./types";

const TZ = "Asia/Makassar";
// 10:00 WITA on Monday 2026-10-12
const now = new Date("2026-10-12T02:00:00Z");

describe("nextInstance", () => {
  it("returns null for non-repeating or ended rules", () => {
    expect(nextInstance(makeTask({ title: "Once" }), now, TZ)).toBeNull();
    expect(nextInstance(makeTask({ title: "Bad", rrule: "nonsense" }), now, TZ)).toBeNull();
    expect(nextInstance(makeTask({ title: "No freq", rrule: "INTERVAL=2" }), now, TZ)).toBeNull();
    expect(nextInstance(makeTask({ title: "Ended", rrule: "FREQ=DAILY;COUNT=1", plan_for: "2026-10-12" }), now, TZ)).toBeNull();
  });

  it("copies the payload and starts fresh", () => {
    const task = makeTask({
      id: "w1",
      title: "Workouts",
      project: "personal",
      priority: 4,
      estimate_min: 45,
      energy: "high",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      value_idr: 1000,
      next_action: "Shoes on",
      plan_for: "2026-10-12",
      status: "done",
      postpone_count: 3,
      forced: true,
      depends_on: ["x"],
    });
    expect(nextInstance(task, now, TZ)).toEqual({
      title: "Workouts",
      project: "personal",
      priority: 4,
      estimate_min: 45,
      energy: "high",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      value_idr: 1000,
      next_action: "Shoes on",
      series_id: "w1",
      status: "todo",
      postpone_count: 0,
      forced: false,
      depends_on: [],
      plan_for: "2026-10-14",
    });
    expect(nextInstance({ ...task, series_id: "s1", plan_for: "2026-10-16" }, now, TZ)).toMatchObject({ series_id: "s1", plan_for: "2026-10-19" });
  });

  it("keeps the local time of day for scheduled tasks and shifts the deadline too", () => {
    // 09:00 WITA on Friday 2026-10-30
    const task = makeTask({ title: "Standup", rrule: "RRULE:FREQ=WEEKLY", scheduled_at: "2026-10-30T01:00:00Z", deadline: "2026-10-31", deadline_confirmed: true });
    const next = nextInstance(task, new Date("2026-10-30T03:00:00Z"), TZ);
    expect(next?.scheduled_at).toBe("2026-11-06T01:00:00.000Z");
    expect(next?.deadline).toBe("2026-11-07");
    expect(next?.deadline_confirmed).toBe(true);
    expect(next?.plan_for).toBeUndefined();
  });

  it("handles month ends", () => {
    const due = (deadline: string, rrule = "FREQ=MONTHLY") => nextInstance(makeTask({ title: "Rent", rrule, deadline }), new Date(`${deadline}T00:00:00Z`), TZ)?.deadline;
    expect(due("2026-01-31")).toBe("2026-02-28");
    expect(due("2028-01-31")).toBe("2028-02-29");
    expect(due("2026-03-31")).toBe("2026-04-30");
    expect(due("2026-01-30")).toBe("2026-02-28");
    expect(due("2026-01-15")).toBe("2026-02-15");
    expect(due("2026-12-31", "FREQ=DAILY")).toBe("2027-01-01");
    // an explicit day of month follows RFC 5545 and skips short months
    expect(due("2026-01-31", "FREQ=MONTHLY;BYMONTHDAY=31")).toBe("2026-03-31");
  });

  it("catches up instead of spawning an overdue repeat", () => {
    const stale = makeTask({ title: "Water plants", rrule: "FREQ=DAILY", deadline: "2026-10-01" });
    expect(nextInstance(stale, now, TZ)?.deadline).toBe("2026-10-12");
    const early = makeTask({ title: "Water plants", rrule: "FREQ=DAILY", plan_for: "2026-10-20" });
    expect(nextInstance(early, now, TZ)?.plan_for).toBe("2026-10-21");
  });

  it("uses today in the configured zone when there is no anchor", () => {
    // 16:30Z is 00:30 on the 13th in WITA, 23:30 on the 12th in WIB
    const task = makeTask({ title: "Journal", rrule: "FREQ=DAILY" });
    const at = new Date("2026-10-12T16:30:00Z");
    expect(nextInstance(task, at, "Asia/Makassar")?.plan_for).toBe("2026-10-14");
    expect(nextInstance(task, at, "Asia/Jakarta")?.plan_for).toBe("2026-10-13");
  });

  it("nextDate rejects garbage", () => {
    expect(nextDate("FREQ=SOMETIMES", "2026-10-12", "2026-10-12")).toBeNull();
  });
});

describe("describeRrule", () => {
  it.each([
    ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "Every Mon, Wed, Fri"],
    ["FREQ=WEEKLY;BYDAY=FR,MO", "Every Mon, Fri"],
    ["FREQ=DAILY", "Every day"],
    ["FREQ=DAILY;INTERVAL=3", "Every 3 days"],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
    ["FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
    ["FREQ=WEEKLY", "Every week"],
    ["FREQ=WEEKLY;INTERVAL=2", "Every 2 weeks"],
    ["FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", "Every 2 weeks on Tue"],
    ["FREQ=MONTHLY", "Every month"],
    ["RRULE:FREQ=YEARLY", "Every year"],
    ["FREQ=HOURLY", "Repeats"],
    ["nonsense", "Repeats"],
  ])("%s", (rule, text) => {
    expect(describeRrule(rule)).toBe(text);
  });
});
