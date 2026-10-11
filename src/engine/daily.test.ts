import { describe, expect, it } from "vitest";
import {
  adjustedDailyGoal,
  computeDayStats,
  dailyScore,
  goalStreak,
  momentum,
  scoreStreakAbove,
  trend,
  type DayStats,
} from "./daily";
import { DEFAULT_SETTINGS, makeTask, type TaskEvent } from "./types";

const base: DayStats = {
  day: "2026-10-12",
  plannedAt8am: 4,
  doneFromPlan: 4,
  dailyGoal: 3,
  doneCount: 4,
  p01Total: 2,
  p01Done: 2,
  wentOverdueUntriaged: 0,
  untriagedOverdueAtEnd: 0,
  focusMinutes: 90,
};

describe("dailyScore", () => {
  it("gives 100 for a perfect day", () => {
    expect(dailyScore(base)).toEqual({ score: 100, parts: { plan: 40, priority: 20, onTime: 20, cleanSlate: 10, focus: 10 } });
  });

  it("scores plan share and caps at 1", () => {
    expect(dailyScore({ ...base, doneFromPlan: 1 }).parts.plan).toBe(10);
    expect(dailyScore({ ...base, doneFromPlan: 9 }).parts.plan).toBe(40);
  });

  it("falls back to the daily goal with no plan (null or 0)", () => {
    expect(dailyScore({ ...base, plannedAt8am: null, doneCount: 1 }).parts.plan).toBe(13.3);
    expect(dailyScore({ ...base, plannedAt8am: 0, doneCount: 3 }).parts.plan).toBe(40);
    // a Low day's smaller goal is already passed in, so 2 of 2 is full marks
    expect(dailyScore({ ...base, plannedAt8am: null, doneCount: 2, dailyGoal: 2 }).parts.plan).toBe(40);
    expect(dailyScore({ ...base, plannedAt8am: null, doneCount: 0, dailyGoal: 0 }).parts.plan).toBe(0);
  });

  it("gives full priority marks when there are no P0/P1 tasks", () => {
    expect(dailyScore({ ...base, p01Total: 0, p01Done: 0 }).parts.priority).toBe(20);
    expect(dailyScore({ ...base, p01Total: 4, p01Done: 1 }).parts.priority).toBe(5);
  });

  it("takes 5 per untriaged overdue, never below 0", () => {
    expect(dailyScore({ ...base, wentOverdueUntriaged: 1 }).parts.onTime).toBe(15);
    expect(dailyScore({ ...base, wentOverdueUntriaged: 7 }).parts.onTime).toBe(0);
  });

  it("clean slate and focus", () => {
    const s = dailyScore({ ...base, untriagedOverdueAtEnd: 1, focusMinutes: 45 });
    expect(s.parts.cleanSlate).toBe(0);
    expect(s.parts.focus).toBe(5);
    expect(s.score).toBe(85);
  });

  it("rounds the total to an integer", () => {
    const s = dailyScore({ ...base, plannedAt8am: 3, doneFromPlan: 1, focusMinutes: 10 });
    expect(s.score).toBe(Math.round(40 / 3 + 20 + 20 + 10 + 10 / 9));
    expect(Number.isInteger(s.score)).toBe(true);
  });
});

describe("computeDayStats", () => {
  const day = "2026-10-11";
  // 16:30Z is 00:30 on the 12th in WITA but 23:30 on the 11th in WIB
  const lateDone = makeTask({ id: "late", title: "Late", status: "done", done_at: "2026-10-11T16:30:00Z" });
  const ev = (at: string, minutes: unknown, kind: TaskEvent["kind"] = "focus_ended"): TaskEvent => ({
    id: at,
    task_id: null,
    kind,
    at,
    meta: minutes === undefined ? null : { minutes },
  });

  it("uses the configured zone for midnight", () => {
    const input = { tasks: [lateDone], events: [ev("2026-10-11T16:10:00Z", 25)], day, dailyGoal: 3, plannedIdsAt8am: null };
    const wita = computeDayStats({ ...input, settings: DEFAULT_SETTINGS });
    const wib = computeDayStats({ ...input, settings: { ...DEFAULT_SETTINGS, timezone: "Asia/Jakarta" } });
    expect(wita.doneCount).toBe(0);
    expect(wita.focusMinutes).toBe(0);
    expect(wib.doneCount).toBe(1);
    expect(wib.focusMinutes).toBe(25);
    expect(computeDayStats({ ...input, day: "2026-10-12", settings: DEFAULT_SETTINGS }).doneCount).toBe(1);
  });

  it("derives every field", () => {
    const tasks = [
      makeTask({ id: "a", title: "A", priority: 0, deadline: day, status: "done", done_at: "2026-10-11T02:00:00Z" }),
      makeTask({ id: "b", title: "B", priority: 1, scheduled_at: "2026-10-11T03:00:00Z" }),
      makeTask({ id: "c", title: "C", priority: 1, plan_for: day, status: "waiting" }),
      makeTask({ id: "d", title: "D", priority: 1, deadline: day, status: "dropped" }),
      makeTask({ id: "e", title: "E", priority: 0, deadline: day, status: "done", done_at: "2026-10-09T02:00:00Z" }),
      makeTask({ id: "f", title: "F", priority: 2, status: "done", done_at: "2026-10-11T05:00:00Z" }),
      // went overdue today, untriaged
      makeTask({ id: "g", title: "G", deadline: "2026-10-10" }),
      // went overdue today but planned for today: triaged
      makeTask({ id: "h", title: "H", deadline: "2026-10-10", plan_for: day }),
      // older overdue, moved to tomorrow: triaged at end of day
      makeTask({ id: "i", title: "I", deadline: "2026-10-01", plan_for: "2026-10-12" }),
      // older overdue, untouched
      makeTask({ id: "j", title: "J", deadline: "2026-10-01" }),
      // waiting counts as triaged
      makeTask({ id: "k", title: "K", deadline: "2026-10-10", status: "waiting" }),
    ];
    const events = [ev("2026-10-11T01:00:00Z", 25), ev("2026-10-11T02:00:00Z", "15"), ev("2026-10-11T03:00:00Z", undefined), ev("2026-10-11T04:00:00Z", 50, "focus_started")];
    const s = computeDayStats({ tasks, events, day, settings: DEFAULT_SETTINGS, dailyGoal: 3, plannedIdsAt8am: ["a", "b", "f", "a"] });
    expect(s).toEqual({
      day,
      plannedAt8am: 3,
      doneFromPlan: 2,
      dailyGoal: 3,
      doneCount: 2,
      p01Total: 3,
      p01Done: 1,
      wentOverdueUntriaged: 1,
      untriagedOverdueAtEnd: 3,
      focusMinutes: 40,
    });
  });

  it("reports no plan as null", () => {
    const s = computeDayStats({ tasks: [], events: [], day, settings: DEFAULT_SETTINGS, dailyGoal: 2, plannedIdsAt8am: null });
    expect(s.plannedAt8am).toBeNull();
    expect(s.doneFromPlan).toBe(0);
  });
});

describe("momentum and trend", () => {
  it("is an EMA with alpha 0.3", () => {
    expect(momentum([])).toBe(0);
    expect(momentum([50])).toBe(50);
    expect(momentum([100, 0])).toBe(70);
    expect(momentum([10, 20, 30])).toBe(18.1);
    expect(momentum([10, 20, 30], 0.5)).toBe(22.5);
  });

  it("only looks at the last 7 days", () => {
    expect(momentum([0, 0, 0, 80, 80, 80, 80, 80, 80, 80])).toBe(80);
  });

  it("trend is flat within 1", () => {
    expect(trend(null, 50)).toBe("flat");
    expect(trend(50, 51)).toBe("flat");
    expect(trend(50, 49)).toBe("flat");
    expect(trend(50, 51.1)).toBe("up");
    expect(trend(50, 48.9)).toBe("down");
  });
});

describe("goalStreak", () => {
  const work = [1, 2, 3, 4, 5, 6]; // Sunday off
  const d = (day: string, doneCount: number, goal = 3) => ({ day, doneCount, goal });

  it("counts today only once hit", () => {
    // 2026-10-14 is a Wednesday
    const days = [d("2026-10-12", 3), d("2026-10-13", 4), d("2026-10-14", 1)];
    expect(goalStreak(days, "2026-10-14", work)).toBe(2);
    expect(goalStreak([...days.slice(0, 2), d("2026-10-14", 3)], "2026-10-14", work)).toBe(3);
  });

  it("skips non-working days unless hit", () => {
    // Sat 10-10 hit, Sun 10-11 nothing, Mon 10-12 hit
    expect(goalStreak([d("2026-10-10", 3), d("2026-10-12", 3)], "2026-10-12", work)).toBe(2);
    expect(goalStreak([d("2026-10-10", 3), d("2026-10-11", 5), d("2026-10-12", 3)], "2026-10-12", work)).toBe(3);
  });

  it("breaks on a missed working day", () => {
    expect(goalStreak([d("2026-10-09", 3), d("2026-10-10", 1), d("2026-10-12", 3)], "2026-10-12", work)).toBe(1);
    expect(goalStreak([d("2026-10-09", 3)], "2026-10-12", work)).toBe(0);
    expect(goalStreak([], "2026-10-12", work)).toBe(0);
  });
});

describe("scoreStreakAbove and adjustedDailyGoal", () => {
  it("counts recent consecutive days at or above the threshold", () => {
    const s = [
      { day: "2026-10-12", score: 70 },
      { day: "2026-10-10", score: 90 },
      { day: "2026-10-11", score: 85 },
      { day: "2026-10-09", score: 40 },
    ];
    expect(scoreStreakAbove(s)).toBe(3);
    expect(scoreStreakAbove(s, 80)).toBe(0);
    expect(scoreStreakAbove([{ day: "2026-10-12", score: 90 }, { day: "2026-10-09", score: 90 }])).toBe(1);
    expect(scoreStreakAbove([])).toBe(0);
  });

  it("drops the goal by one on a Low day, minimum 1", () => {
    expect(adjustedDailyGoal(3, "low")).toBe(2);
    expect(adjustedDailyGoal(1, "low")).toBe(1);
    expect(adjustedDailyGoal(3, "high")).toBe(3);
    expect(adjustedDailyGoal(3, null)).toBe(3);
  });
});
