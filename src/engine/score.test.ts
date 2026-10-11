import { describe, expect, it } from "vitest";
import { isBlocked, reasonLine, scoreTask } from "./score";
import { DEFAULT_SETTINGS, makeTask, type Task } from "./types";

const now = new Date("2026-10-12T01:00:00Z"); // Mon 09:00 WITA
const ctx = { settings: DEFAULT_SETTINGS };
const fresh = "2026-10-12T00:00:00Z";
const t = (p: Partial<Task>) => makeTask({ title: "x", created_at: fresh, ...p });

describe("scoreTask", () => {
  it("priority table", () => {
    const pts = [0, 1, 2, 3, 4, null].map((priority) => scoreTask(t({ priority }), now, ctx).score);
    expect(pts).toEqual([50, 40, 25, 15, 5, 20]);
    expect(scoreTask(t({ priority: null }), now, ctx).reasons).toEqual(["unsorted"]);
  });

  it("deadline urgency, confirmed and unconfirmed", () => {
    // daysLeft 2, estimateDays 0.2: 40 * (1 - 1.8/14) = 34.857
    const c = scoreTask(t({ priority: 1, deadline: "2026-10-14", deadline_confirmed: true }), now, ctx);
    expect(c.score).toBe(74.9);
    expect(c.reasons).toEqual(["P1", "due in 2 days"]);
    expect(reasonLine(c)).toBe("P1, due in 2 days");
    const u = scoreTask(t({ priority: 1, deadline: "2026-10-14" }), now, ctx);
    expect(u.parts.find((p) => p.key === "deadline")?.points).toBe(24.4);
    expect(u.reasons[1]).toBe("due in 2 days, unconfirmed");
    // Far deadlines add nothing and are skipped
    const far = scoreTask(t({ priority: 1, deadline: "2026-12-30", deadline_confirmed: true }), now, ctx);
    expect(far.parts.map((p) => p.key)).toEqual(["priority"]);
  });

  it("overdue deadline is +45 with no urgency part", () => {
    const r = scoreTask(t({ priority: 2, deadline: "2026-10-09", deadline_confirmed: true }), now, ctx);
    expect(r.score).toBe(70);
    expect(r.reasons).toEqual(["3 days late", "P2"]);
    expect(r.parts.some((p) => p.key === "deadline")).toBe(false);
  });

  it("start-by passed only after the start-by day", () => {
    expect(scoreTask(t({ priority: 4, start_by_auto: "2026-10-12" }), now, ctx).score).toBe(5);
    const r = scoreTask(t({ priority: 4, start_by_auto: "2026-10-11" }), now, ctx);
    expect(r.score).toBe(20);
    expect(r.reasons).toEqual(["start-by passed", "P4"]);
    // manual wins over auto
    expect(scoreTask(t({ priority: 4, start_by_auto: "2026-10-11", start_by_manual: "2026-10-20" }), now, ctx).score).toBe(5);
  });

  it("postponed +8 each up to +32", () => {
    expect(scoreTask(t({ priority: 4, postpone_count: 2 }), now, ctx).reasons).toEqual(["postponed twice", "P4"]);
    expect(scoreTask(t({ priority: 4, postpone_count: 6 }), now, ctx).score).toBe(37);
  });

  it("age +1 per 3 days, max 10", () => {
    const r = scoreTask(t({ priority: 4, created_at: "2026-09-30T02:00:00Z" }), now, ctx);
    expect(r.score).toBe(9);
    expect(r.reasons).toEqual(["P4", "open 12 days"]);
    expect(scoreTask(t({ priority: 4, created_at: "2026-01-01T00:00:00Z" }), now, ctx).score).toBe(15);
  });

  it("waiting item whose follow-up date is reached", () => {
    const r = scoreTask(t({ priority: 3, status: "waiting", follow_up: "2026-10-12" }), now, ctx);
    expect(r.score).toBe(45);
    expect(r.reasons[0]).toBe("follow-up date reached");
    expect(scoreTask(t({ priority: 3, status: "waiting", follow_up: "2026-10-13" }), now, ctx).score).toBe(15);
  });

  it("ties keep priority first", () => {
    // P3 15, postponed 16, start-by 15: priority beats start-by on the tie
    const r = scoreTask(t({ priority: 3, postpone_count: 2, start_by_auto: "2026-10-01" }), now, ctx);
    expect(r.reasons).toEqual(["postponed twice", "P3"]);
  });

  it("blocked by an unfinished dependency scores 0", () => {
    const dep = t({ id: "dep", title: "dep" });
    const child = t({ id: "child", priority: 0, depends_on: ["dep"] });
    const map = new Map([dep, child].map((x) => [x.id, x]));
    expect(scoreTask(child, now, { ...ctx, tasksById: map })).toEqual({
      score: 0,
      reasons: [],
      parts: [],
      blocked: true,
    });
    map.set("dep", { ...dep, status: "done" });
    expect(scoreTask(child, now, { ...ctx, tasksById: map }).score).toBe(50);
  });

  it("uses the configured timezone for today", () => {
    // 16:30Z: Monday in WITA, still Sunday in WIB
    const at = new Date("2026-10-11T16:30:00Z");
    const task = t({ priority: 4, deadline: "2026-10-11", deadline_confirmed: true, created_at: "2026-10-11T10:00:00Z" });
    expect(scoreTask(task, at, ctx).reasons[0]).toBe("1 day late");
    expect(scoreTask(task, at, { settings: { ...DEFAULT_SETTINGS, timezone: "Asia/Jakarta" } }).reasons[0]).toBe("due today");
  });
});

describe("isBlocked", () => {
  it("ignores missing, done and dropped dependencies", () => {
    const a = t({ id: "a", status: "dropped" });
    const b = t({ id: "b", status: "waiting" });
    const map = new Map([a, b].map((x) => [x.id, x]));
    expect(isBlocked(t({ depends_on: ["a", "zzz"] }), map)).toBe(false);
    expect(isBlocked(t({ depends_on: ["a", "b"] }), map)).toBe(true);
  });

  it("reasonLine of nothing is empty", () => {
    expect(reasonLine({ reasons: [] })).toBe("");
  });
});
