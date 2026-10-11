import { describe, expect, it } from "vitest";
import {
  bestHours,
  energyByHourWeekday,
  energyInsight,
  estimateLearning,
  followUpTiming,
  suggestEnergyWindows,
  suggestFollowUpDays,
  suggestFromBestHours,
  weeklyReview,
} from "./learning";
import { makeTask, type EnergyCheckin, type EnergyLevel, type TaskEvent } from "./types";
import { addDays, zonedInstant } from "./time";

const TZ = "Asia/Makassar";
let seq = 0;
const ci = (date: string, time: string, level: EnergyLevel, tz = TZ): EnergyCheckin => ({
  id: `c${seq++}`,
  level,
  source: "app",
  at: zonedInstant(date, time, tz).toISOString(),
});

describe("energy grid and insight", () => {
  it("buckets by local weekday and hour", () => {
    // 2026-10-13 is a Tuesday
    const grid = energyByHourWeekday([ci("2026-10-13", "09:10", "high"), ci("2026-10-13", "09:40", "ok")], TZ);
    expect(grid[1][9]).toEqual({ avg: 1.5, n: 2 });
    expect(grid[1][10]).toEqual({ avg: 0, n: 0 });
    // the same instants read in WIB land an hour earlier
    expect(energyByHourWeekday([ci("2026-10-13", "09:10", "high")], "Asia/Jakarta")[1][8].n).toBe(1);
  });

  it("names the strongest pattern, Charged first", () => {
    const tueMorning = [ci("2026-10-13", "09:00", "high"), ci("2026-10-20", "10:00", "high")];
    const friAfternoon = [ci("2026-10-16", "14:00", "low"), ci("2026-10-23", "15:00", "low"), ci("2026-10-30", "13:00", "low")];
    expect(energyInsight(energyByHourWeekday([...tueMorning, ...friAfternoon], TZ))).toBe("You're usually Charged Tuesday mornings.");
    expect(energyInsight(energyByHourWeekday(friAfternoon, TZ))).toBe("You're usually Low Friday afternoons.");
    expect(energyInsight(energyByHourWeekday([ci("2026-10-13", "09:00", "high")], TZ))).toBeNull();
    expect(energyInsight(energyByHourWeekday([ci("2026-10-14", "19:00", "ok"), ci("2026-10-14", "20:00", "ok")], TZ))).toBeNull();
  });

  it("suggests windows only after 14 days", () => {
    const checkins = Array.from({ length: 14 }, (_, i) => {
      const day = addDays("2026-10-01", i);
      return [ci(day, "09:05", "high"), ci(day, "10:30", "high"), ci(day, "14:00", "low"), ci(day, "23:15", "high")];
    }).flat();
    expect(suggestEnergyWindows(checkins.slice(0, 13 * 4), TZ)).toBeNull();
    expect(suggestEnergyWindows(checkins, TZ)).toEqual([
      { start: "09:00", end: "11:00" },
      { start: "23:00", end: "23:59" },
    ]);
    expect(suggestEnergyWindows(checkins, TZ, 15)).toBeNull();
  });
});

describe("estimateLearning", () => {
  const s = (estimate_min: number, actual_min: number) => ({ estimate_min, actual_min });

  it("suggests only with 20 samples outside 0.8 to 1.2", () => {
    expect(estimateLearning(Array(20).fill(s(20, 30)))).toEqual({ ratio: 1.5, n: 20, suggest: true });
    expect(estimateLearning(Array(19).fill(s(20, 30)))).toEqual({ ratio: 1.5, n: 19, suggest: false });
    expect(estimateLearning(Array(20).fill(s(20, 22)))).toEqual({ ratio: 1.1, n: 20, suggest: false });
    expect(estimateLearning(Array(20).fill(s(20, 10))).suggest).toBe(true);
  });

  it("uses the median of the last 20", () => {
    expect(estimateLearning([s(10, 10), s(10, 20)]).ratio).toBe(1.5);
    expect(estimateLearning([...Array(5).fill(s(10, 100)), ...Array(20).fill(s(10, 10))]).ratio).toBe(1);
    expect(estimateLearning([s(0, 10)])).toEqual({ ratio: 1, n: 0, suggest: false });
  });
});

describe("best hours", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const doneAts = Array.from({ length: 14 }, (_, i) => {
    const day = addDays("2026-10-01", i);
    return [zonedInstant(day, "09:10", TZ), zonedInstant(day, "09:50", TZ), zonedInstant(day, "15:00", TZ)].map((d) => d.toISOString());
  }).flat();
  const noise = ["2026-08-01T01:00:00Z", "2026-10-20T01:00:00Z"];

  it("counts the last 30 days by local hour", () => {
    const b = bestHours([...doneAts, ...noise], TZ, now);
    expect(b.hours[9]).toBe(28);
    expect(b.hours[15]).toBe(14);
    expect(b.days).toBe(14);
  });

  it("suggests the peak hours after 14 days", () => {
    expect(suggestFromBestHours(doneAts, TZ, now)).toEqual([{ start: "09:00", end: "10:00" }]);
    expect(suggestFromBestHours(doneAts.slice(0, 13 * 3), TZ, now)).toBeNull();
  });
});

describe("follow-up timing", () => {
  const ev = (task_id: string | null, kind: TaskEvent["kind"], at: string, meta: TaskEvent["meta"] = null): TaskEvent => ({
    id: `${task_id}-${kind}-${at}`,
    task_id,
    kind,
    at,
    meta,
  });
  const tasks = [
    makeTask({ id: "t1", title: "Sultan DP", waiting_on: "Pak Arief" }),
    makeTask({ id: "t2", title: "Agreement", waiting_on: "Sultan" }),
    makeTask({ id: "t3", title: "Nobody" }),
  ];
  const events = [
    ev("t1", "resumed", "2026-10-03T00:00:00Z"),
    ev("t1", "waiting_started", "2026-10-01T00:00:00Z"),
    ev("t1", "waiting_started", "2026-10-04T00:00:00Z", { waiting_on: "pak arief " }),
    ev("t1", "done", "2026-10-08T00:00:00Z"),
    ev("t2", "resumed", "2026-10-01T00:00:00Z"),
    ev("t2", "waiting_started", "2026-10-02T00:00:00Z"),
    ev("t2", "postponed", "2026-10-02T12:00:00Z"),
    ev("t2", "resumed", "2026-10-03T00:00:00Z"),
    ev("t3", "waiting_started", "2026-10-02T00:00:00Z"),
    ev("t3", "resumed", "2026-10-03T00:00:00Z"),
    ev(null, "focus_ended", "2026-10-03T00:00:00Z"),
  ];

  it("takes the median per contact", () => {
    expect(followUpTiming(events, tasks)).toEqual([
      { contact: "Pak Arief", medianDays: 3, n: 2 },
      { contact: "Sultan", medianDays: 1, n: 1 },
    ]);
  });

  it("suggests learned days after 3 round trips", () => {
    const more = [...events, ev("t1", "waiting_started", "2026-10-10T00:00:00Z"), ev("t1", "resumed", "2026-10-15T00:00:00Z")];
    const timings = followUpTiming(more, tasks);
    expect(suggestFollowUpDays("PAK ARIEF", timings, 3)).toBe(4);
    expect(suggestFollowUpDays("Sultan", timings, 3)).toBe(3);
    expect(suggestFollowUpDays("Demian", timings, 5)).toBe(5);
  });
});

describe("weeklyReview", () => {
  const scores = [
    { day: "2026-10-05", score: 60 },
    { day: "2026-10-06", score: 80 },
    { day: "2026-10-11", score: 70 },
    { day: "2026-10-12", score: 99 },
  ];
  const done = (id: string, at: string, project: "omnisync" | "teba" | null = "omnisync") =>
    makeTask({ id, title: id, status: "done", done_at: at, project });

  it("summarises the week in two sentences", () => {
    const tasks = [
      done("a", "2026-10-05T02:00:00Z"),
      done("b", "2026-10-07T02:00:00Z"),
      done("c", "2026-10-08T02:00:00Z", "teba"),
      done("d", "2026-10-08T03:00:00Z", null),
      // 16:30Z on the 11th is the 12th in WITA, outside the week
      done("e", "2026-10-11T16:30:00Z", "teba"),
      makeTask({ id: "f", title: "f" }),
    ];
    const checkins = [ci("2026-10-06", "09:00", "high"), ci("2026-10-13", "10:00", "high")];
    expect(weeklyReview({ scores, tasks, checkins, tz: TZ, weekStart: "2026-10-05" })).toEqual({
      doneCount: 4,
      avgScore: 70,
      bestDay: { day: "2026-10-06", score: 80 },
      energyInsight: "You're usually Charged Tuesday mornings.",
      topProject: "omnisync",
      line: "Four tasks done this week, average score 70. Tuesday was your best day at 80.",
    });
  });

  it("handles a quiet week", () => {
    const r = weeklyReview({ scores: [], tasks: [], checkins: [], tz: TZ, weekStart: "2026-10-05" });
    expect(r).toMatchObject({ doneCount: 0, avgScore: null, bestDay: null, energyInsight: null, topProject: null });
    expect(r.line).toBe("Quiet week. Next week starts fresh.");
    const one = weeklyReview({ scores: [], tasks: [done("a", "2026-10-05T02:00:00Z", null)], checkins: [], tz: TZ, weekStart: "2026-10-05" });
    expect(one.line).toBe("One task done this week. Next week starts fresh.");
  });
});
