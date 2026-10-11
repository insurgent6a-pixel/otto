import { describe, expect, it } from "vitest";
import { HIGH_REASON, LOW_REASON, buildToday, lowGoalLine } from "./today";
import { DEFAULT_SETTINGS as s, makeTask, type Project, type ScheduleBlock, type Task } from "./types";

const now = new Date("2026-10-12T01:00:00Z"); // Mon 09:00 WITA
const created = "2026-10-12T00:00:00Z";
const t = (p: Partial<Task> & { title: string }) => makeTask({ created_at: created, ...p });
const block = (task_id: string, start_at: string, end_at: string): ScheduleBlock => ({
  id: `b-${task_id}`,
  task_id,
  start_at,
  end_at,
  pinned: false,
  source: "auto",
});

// Spec section 20 / Appendix A part 4.
const SEED: [string, Project, number][] = [
  ["Publish the IVG post", "content", 1],
  ["Follow up Pak Arief on the Sultan down payment", "omnisync", 1],
  ["Sultan agreement", "omnisync", 1],
  ["Navaho payments", "omnisync", 1],
  ["Send the Sundari live link", "omnisync", 1],
  ["Demian invoice module", "omnisync", 1],
  ["Start the next compost batch", "teba", 0],
  ["Send client outreach", "omnisync", 0],
  ["Send feedback requests", "omnisync", 0],
  ["Build the Sundari system", "omnisync", 2],
  ["Rumahati project", "omnisync", 2],
  ["Build the mailing list", "content", 3],
  ["Set up hour tracking", "omnisync", 3],
  ["Teba business development", "teba", 3],
  ["Website redesign", "omnisync", 4],
  ["Workouts", "personal", 4],
];
function seed(): Task[] {
  const tasks = SEED.map(([title, project, priority], i) =>
    makeTask({ id: `s${i}`, title, project, priority, created_at: `2026-10-12T00:00:${String(i).padStart(2, "0")}Z` }),
  );
  tasks[2].depends_on = [tasks[1].id];
  return tasks;
}

describe("buildToday with the seed tasks", () => {
  it("orders by score, hides the blocked Sultan agreement", () => {
    const m = buildToday(seed(), [], now, s, null);
    expect(m.ordered).toHaveLength(15);
    expect(m.ordered.map((r) => r.task.title)).not.toContain("Sultan agreement");
    // P0 ties break on created_at
    expect(m.next?.task.title).toBe("Start the next compost batch");
    expect(m.upNext.map((r) => r.task.title)).toEqual(["Send client outreach", "Send feedback requests"]);
    expect(m.next?.reasonLine).toBe("P0");
    expect(m.energyLine).toBeNull();
    expect(m.dailyGoal).toBe(3);
  });

  it("finishing the dependency unblocks it", () => {
    const tasks = seed();
    tasks[1].status = "done";
    tasks[1].done_at = "2026-10-12T00:30:00Z";
    const m = buildToday(tasks, [], now, s, null);
    expect(m.ordered.map((r) => r.task.title)).toContain("Sultan agreement");
    expect(m.doneToday.map((x) => x.id)).toEqual(["s1"]);
    expect(m.doneCount).toBe(1);
  });

  it("Low energy picks a 15 minute task", () => {
    const tasks = [...seed(), t({ id: "small", title: "Reply to Navaho", priority: 3, estimate_min: 15 })];
    const m = buildToday(tasks, [], now, s, "low");
    expect(m.next?.task.id).toBe("small");
    expect(m.next?.task.estimate_min).toBeLessThanOrEqual(15);
    expect(m.next?.fiveMin).toBe(false);
    expect(m.next?.reasonLine).toBe(LOW_REASON);
    expect(m.ordered).toHaveLength(16);
    expect(m.dailyGoal).toBe(2);
    expect(m.energyLine).toBe("Low battery is fine. Here's a 5 minute one. Finish it and you're already moving.");
  });

  it("Low energy without a small task shows a 5 minute version of the top task", () => {
    const tasks = seed();
    tasks[6].next_action = "Fill one bucket";
    const m = buildToday(tasks, [], now, { ...s, daily_goal: 1 }, "low");
    expect(m.next?.task.title).toBe("Start the next compost batch");
    expect(m.next?.fiveMin).toBe(true);
    expect(m.next?.displayTitle).toBe("Fill one bucket");
    expect(m.dailyGoal).toBe(1);
  });

  it("Charged picks a high energy or 50+ minute task", () => {
    const tasks = [
      t({ title: "Quick", priority: 0, estimate_min: 10 }),
      t({ title: "Deep", priority: 2, energy: "high", estimate_min: 30 }),
    ];
    const m = buildToday(tasks, [], now, s, "high");
    expect(m.next?.task.title).toBe("Deep");
    expect(m.next?.reasonLine).toBe(HIGH_REASON);
    expect(m.energyLine).toBe("Charged. Let's use it on the big one before lunch.");
    // nothing deep: normal order
    expect(buildToday([tasks[0]], [], now, s, "high").next?.reasonLine).toBe("P0");
  });

  it("Okay names the task and its reason", () => {
    const tasks = [t({ title: "Navaho payments", priority: 1, deadline: "2026-10-14", deadline_confirmed: true })];
    expect(buildToday(tasks, [], now, s, "ok").energyLine).toBe("Good. Start with Navaho payments, P1, due in 2 days.");
    expect(buildToday([], [], now, s, "ok").energyLine).toBe("Good. The list is clear.");
    expect(buildToday([], [], now, s, "ok").next).toBeNull();
    expect(lowGoalLine(2)).toBe("Goal's 2 today. That's plenty.");
  });
});

describe("tiers", () => {
  it("forced first, then timed and blocked in time order, then score", () => {
    const forced = t({ title: "Forced", priority: 4, forced: true });
    const meetingSoon = t({ title: "Call", priority: 4, scheduled_at: "2026-10-12T01:45:00Z" }); // 09:45
    const meetingLater = t({ title: "Late call", priority: 4, scheduled_at: "2026-10-12T06:00:00Z" }); // 14:00
    const meetingNextWeek = t({ title: "Next week", priority: 0, scheduled_at: "2026-10-19T01:00:00Z" });
    const blocked = t({ title: "Block", priority: 4 });
    const ended = t({ title: "Ended", priority: 4 });
    const top = t({ title: "Top", priority: 0 });
    const blocks = [
      block(blocked.id, "2026-10-12T05:00:00Z", "2026-10-12T06:00:00Z"), // 13:00
      block(ended.id, "2026-10-12T00:30:00Z", "2026-10-12T00:45:00Z"), // 08:30, ended
      block(top.id, "2026-10-14T01:00:00Z", "2026-10-14T02:00:00Z"), // not today
    ];
    const m = buildToday([top, ended, blocked, meetingLater, meetingSoon, forced, meetingNextWeek], blocks, now, s, "low");
    expect(m.ordered.map((r) => r.task.title)).toEqual(["Forced", "Ended", "Call", "Block", "Top", "Late call"]);
    expect(m.ordered.map((r) => r.time)).toEqual([null, "08:30", "09:45", "13:00", null, "14:00"]);
    // forced stays first even on a Low day, and no small task means the top flexible one gets the 5 minute version
    expect(m.next?.task.title).toBe("Forced");
    expect(m.ordered[1].fiveMin).toBe(true);
  });

  it("triage holds untriaged overdue and past timed items", () => {
    const overdue = t({ title: "Overdue", deadline: "2026-10-10" });
    const triaged = t({ title: "Moved to today", deadline: "2026-10-10", plan_for: "2026-10-12" });
    const later = t({ title: "Moved to tomorrow", deadline: "2026-10-10", plan_for: "2026-10-13" });
    const pastCall = t({ title: "Missed call", scheduled_at: "2026-10-09T01:00:00Z" });
    const forcedOverdue = t({ title: "Forced overdue", deadline: "2026-10-10", forced: true });
    const m = buildToday([overdue, triaged, later, pastCall, forcedOverdue], [], now, s, null);
    expect(m.triage.map((x) => x.title)).toEqual(["Overdue", "Missed call"]);
    expect(m.ordered.map((r) => r.task.title)).toEqual(["Forced overdue", "Moved to today"]);
  });

  it("waiting sorted by follow-up, nulls last; done today newest first", () => {
    const w1 = t({ title: "w1", status: "waiting" });
    const w2 = t({ title: "w2", status: "waiting", follow_up: "2026-10-15" });
    const w3 = t({ title: "w3", status: "waiting", follow_up: "2026-10-13" });
    const d1 = t({ title: "d1", status: "done", done_at: "2026-10-12T00:10:00Z" });
    const d2 = t({ title: "d2", status: "done", done_at: "2026-10-12T00:50:00Z" });
    const d3 = t({ title: "yesterday", status: "done", done_at: "2026-10-11T15:00:00Z" }); // Sun 23:00 WITA
    const m = buildToday([w1, w2, w3, d1, d2, d3], [], now, s, null);
    expect(m.waiting.map((x) => x.title)).toEqual(["w3", "w2", "w1"]);
    expect(m.doneToday.map((x) => x.title)).toEqual(["d2", "d1"]);
  });
});

describe("midnight in the configured zone", () => {
  // 16:30Z is Monday 00:30 in WITA but Sunday 23:30 in WIB.
  const at = new Date("2026-10-11T16:30:00Z");
  const tasks = () => [
    t({ title: "Due Sunday", priority: 2, deadline: "2026-10-11", deadline_confirmed: true, created_at: "2026-10-10T00:00:00Z" }),
    t({ title: "Done Sunday night", status: "done", done_at: "2026-10-11T15:45:00Z", created_at: "2026-10-10T00:00:00Z" }),
  ];

  it("WITA: already Monday, the deadline is overdue", () => {
    const m = buildToday(tasks(), [], at, s, null);
    expect(m.triage.map((x) => x.title)).toEqual(["Due Sunday"]);
    expect(m.next).toBeNull();
    expect(m.doneToday).toEqual([]);
  });

  it("WIB: still Sunday, due today", () => {
    const m = buildToday(tasks(), [], at, { ...s, timezone: "Asia/Jakarta" }, null);
    expect(m.triage).toEqual([]);
    expect(m.next?.reasons).toEqual(["due today", "P2"]);
    expect(m.doneCount).toBe(1);
  });
});
