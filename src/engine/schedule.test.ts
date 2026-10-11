import { describe, expect, it } from "vitest";
import {
  blocksForDay,
  buildSchedule,
  fallbackScore,
  knockOnMessage,
  nextFreeSlot,
  type ScheduleInput,
} from "./schedule";
import { localDate, localMinutes, localTime } from "./time";
import { makeTask, type BusyBlock, type Settings, type Task } from "./types";
import {
  at,
  block,
  filler,
  followUp,
  FRI,
  iso,
  MIDNIGHT_NOW,
  MON,
  navaho,
  overloadedWeek,
  SAT,
  SETTINGS,
  sultan,
  SUN,
  THU,
  TUE,
  WED,
  WIB,
  WITA,
} from "./fixtures/scheduleFixtures";

const run = (over: Partial<ScheduleInput> & { tasks: Task[] }) =>
  buildSchedule({ blocks: [], busy: [], settings: SETTINGS, now: MIDNIGHT_NOW, ...over });
const firstStart = (r: ReturnType<typeof run>, id: string) => r.blocks.find((b) => b.task_id === id)?.start_at;
const busy = (start: string, end: string): BusyBlock => ({
  id: `busy-${start}`,
  title: "Call",
  start_at: start,
  end_at: end,
});
const t = (id: string, extra: Partial<Task> = {}) => makeTask({ id, title: id, estimate_min: 60, ...extra });

describe("buildSchedule basics", () => {
  it("places a task in the first working slot", () => {
    const r = run({ tasks: [t("a")] });
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]).toMatchObject({
      task_id: "a",
      start_at: iso(MON, "08:30"),
      end_at: iso(MON, "09:30"),
      pinned: false,
      source: "auto",
    });
    expect(r.moved).toEqual([{ taskId: "a", from: null, to: iso(MON, "08:30") }]);
  });

  it("defaults the duration to 60 minutes and skips waiting, done and timed tasks", () => {
    const r = run({
      tasks: [
        t("a", { estimate_min: null }),
        t("w", { status: "waiting" }),
        t("d", { status: "done" }),
        t("x", { status: "dropped" }),
        t("m", { scheduled_at: iso(MON, "13:00") }),
      ],
    });
    expect(r.blocks.map((b) => b.task_id)).toEqual(["a"]);
    expect(r.blocks[0].end_at).toBe(iso(MON, "09:30"));
  });

  it("respects busy blocks and timed items", () => {
    const r = run({
      tasks: [t("a"), t("call", { scheduled_at: iso(MON, "10:00"), estimate_min: null })],
      busy: [busy(iso(MON, "08:30"), iso(MON, "10:00"))],
    });
    // 10:00 to 10:30 is the timed call (default 30 min)
    expect(firstStart(r, "a")).toBe(iso(MON, "10:30"));
  });

  it("respects the daily focus cap", () => {
    const settings: Settings = { ...SETTINGS, focus_cap_min: 120 };
    const r = run({ tasks: [t("a"), t("b"), t("c")], settings });
    expect(blocksForDay(r.blocks, MON, WITA)).toHaveLength(2);
    expect(localDate(firstStart(r, "c") as string, WITA)).toBe(TUE);
  });

  it("counts pinned manual blocks toward the cap without moving them", () => {
    const settings: Settings = { ...SETTINGS, focus_cap_min: 120 };
    const pin = block("p", iso(MON, "14:00"), iso(MON, "15:30"), { pinned: true, source: "manual" });
    const r = run({ tasks: [t("p", { estimate_min: 90 }), t("a")], blocks: [pin], settings });
    expect(r.blocks.find((b) => b.task_id === "p")).toBe(pin);
    expect(localDate(firstStart(r, "a") as string, WITA)).toBe(TUE);
  });

  it("keeps pinned blocks even when they clash with busy time", () => {
    const pin = block("p", iso(MON, "09:00"), iso(MON, "10:00"), { pinned: true, source: "manual" });
    const r = run({ tasks: [t("p")], blocks: [pin], busy: [busy(iso(MON, "08:30"), iso(MON, "12:00"))] });
    expect(r.blocks).toEqual([pin]);
    expect(r.moved).toEqual([]);
  });

  it("does not plan before plan_for, and ignores plan_for past the horizon", () => {
    const r = run({ tasks: [t("a", { plan_for: WED }), t("far", { plan_for: "2026-12-01" })] });
    expect(localDate(firstStart(r, "a") as string, WITA)).toBe(WED);
    expect(firstStart(r, "far")).toBeUndefined();
    expect(r.unplaced).toEqual([]);
  });

  it("removes the block of a task that is now done, and stays quiet about it", () => {
    const old = block("navaho", iso(TUE, "09:00"), iso(TUE, "09:45"));
    const tasks = [{ ...navaho, status: "done" as const }];
    const r = run({ tasks, blocks: [old] });
    expect(r.blocks).toEqual([]);
    expect(r.moved).toEqual([{ taskId: "navaho", from: old.start_at, to: null }]);
    expect(knockOnMessage(r.moved, tasks, WITA)).toBeNull();
  });

  it("leaves past blocks alone and keeps a running block", () => {
    const now = at(MON, "10:00");
    const past = block("d", iso(MON, "08:30"), iso(MON, "09:00"));
    const running = block("r", iso(MON, "09:30"), iso(MON, "10:30"));
    const r = run({ tasks: [t("d", { status: "done" }), t("r")], blocks: [past, running], now });
    expect(r.blocks).toEqual([past, running]);
  });

  it("re-places a future block whose length no longer matches the estimate", () => {
    const old = block("a", iso(TUE, "09:00"), iso(TUE, "10:00"));
    const r = run({ tasks: [t("a", { estimate_min: 30 })], blocks: [old] });
    expect(r.blocks[0].end_at).toBe(iso(MON, "09:00"));
  });

  it("splits a task longer than the daily cap into chunks of 30+ minutes", () => {
    const r = run({ tasks: [t("long", { estimate_min: 420 })] });
    expect(r.blocks.map((b) => [b.start_at, b.end_at])).toEqual([
      [iso(MON, "08:30"), iso(MON, "13:30")],
      [iso(TUE, "08:30"), iso(TUE, "10:30")],
    ]);
  });

  it("does not split into a sliver shorter than 30 minutes", () => {
    // Only 45 free minutes on Monday: a 30 chunk would leave 15, so the chunk shrinks or skips
    const settings: Settings = { ...SETTINGS, focus_cap_min: 45, work_days: [1, 2] };
    const r = run({ tasks: [t("a", { estimate_min: 60 })], settings, horizonDays: 2 });
    expect(r.blocks.map((b) => (Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000)).toEqual([30, 30]);
  });

  it("lists a task that fits nowhere as unplaced", () => {
    const r = run({ tasks: [t("huge", { estimate_min: 20 * 60 })], horizonDays: 2 });
    expect(r.unplaced).toEqual(["huge"]);
    expect(knockOnMessage([{ taskId: "huge", from: null, to: null }], [t("huge")], WITA)).toBe(
      "No free slot for huge yet.",
    );
  });

  it("orders by latest feasible start, then score, and honours scoreOf", () => {
    const tasks = [t("late"), t("soon", { deadline: TUE }), t("hi")];
    const scoreOf = (x: Task) => (x.id === "hi" ? 100 : 1);
    const r = run({ tasks, scoreOf });
    expect(r.blocks.map((b) => b.task_id)).toEqual(["soon", "hi", "late"]);
  });

  it("fallback score: priority points plus the overdue bump", () => {
    expect(fallbackScore(t("a", { priority: 0 }), MIDNIGHT_NOW, WITA)).toBe(50);
    expect(fallbackScore(t("a", { priority: 4 }), MIDNIGHT_NOW, WITA)).toBe(5);
    expect(fallbackScore(t("a", { priority: null }), MIDNIGHT_NOW, WITA)).toBe(20);
    expect(fallbackScore(t("a", { priority: 9 }), MIDNIGHT_NOW, WITA)).toBe(20);
    expect(fallbackScore(t("a", { priority: 1, deadline: "2026-10-10" }), MIDNIGHT_NOW, WITA)).toBe(85);
  });

  it("places an overdue task without warning about the past", () => {
    const r = run({ tasks: [t("o", { deadline: "2026-10-01" })] });
    expect(firstStart(r, "o")).toBe(iso(MON, "08:30"));
    expect(r.warnings).toEqual([]);
  });
});

describe("overloaded week", () => {
  it("spills the last job past Thursday and warns about Thursday", () => {
    const r = run({ tasks: overloadedWeek });
    const thursdayEnd = Date.parse(iso(FRI, "00:00"));
    const late = r.blocks.filter((b) => Date.parse(b.end_at) > thursdayEnd);
    expect(late.map((b) => b.task_id)).toEqual(["big-5"]);
    expect(r.warnings).toEqual([
      {
        day: THU,
        plannedMin: 540,
        freeMin: 300,
        taskIds: ["big-5"],
        message: "Thursday is overloaded: 9h planned, 5h free. Move 1 task or drop 1.",
      },
    ]);
    for (const day of [MON, TUE, WED, THU]) {
      const mins = blocksForDay(r.blocks, day, WITA).reduce(
        (a, b) => a + (Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000,
        0,
      );
      expect(mins).toBeLessThanOrEqual(300);
    }
  });

  it("merges several late tasks into one warning and counts moves", () => {
    const tasks = [...overloadedWeek, t("big-6", { estimate_min: 240, deadline: THU, priority: 4 })];
    const r = run({ tasks });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].taskIds).toEqual(["big-5", "big-6"]);
    expect(r.warnings[0].message).toBe("Thursday is overloaded: 13h planned, 5h free. Move 2 tasks or drop 1.");
  });

  it("warns when a deadline task cannot be placed at all", () => {
    const r = run({ tasks: [t("x", { estimate_min: 20 * 60, deadline: TUE })], horizonDays: 2 });
    expect(r.unplaced).toEqual(["x"]);
    expect(r.warnings[0].message).toBe("Tuesday is overloaded: 20h planned, 5h free. Move 1 task or drop 1.");
  });
});

describe("deadline on a non-working day", () => {
  it("plans a Sunday deadline by Saturday", () => {
    const r = run({ tasks: [t("a", { deadline: SUN })] });
    expect(localDate(firstStart(r, "a") as string, WITA)).toBe(MON);
  });

  it("warns about Saturday when a Sunday deadline overflows", () => {
    const tasks = Array.from({ length: 9 }, (_, i) => t(`s${i}`, { estimate_min: 240, deadline: SUN, priority: 1 }));
    const r = run({ tasks });
    expect(r.warnings.map((w) => w.day)).toEqual([SAT]);
    expect(r.warnings[0].message).toMatch(
      /^Saturday is overloaded: \d+h( \d+m)? planned, 5h free\. Move \d tasks? or drop 1\.$/,
    );
    expect(blocksForDay(r.blocks, SUN, WITA)).toEqual([]);
  });
});

describe("dependency chain", () => {
  it("puts the agreement after the follow-up even if it scores higher", () => {
    const scoreOf = (x: Task) => (x.id === "sultan" ? 99 : 1);
    const r = run({ tasks: [sultan, followUp], scoreOf });
    expect(firstStart(r, "arief")).toBe(iso(MON, "08:30"));
    expect(firstStart(r, "sultan")).toBe(iso(MON, "09:00"));
  });

  it("pinning the follow-up later moves the agreement after it", () => {
    const tasks = [followUp, sultan];
    const first = run({ tasks });
    const pinned = block("arief", iso(WED, "10:00"), iso(WED, "10:30"), { pinned: true, source: "manual" });
    const blocks = [...first.blocks.filter((b) => b.task_id !== "arief"), pinned];
    const r = run({ tasks, blocks: first.blocks });
    expect(r.moved).toEqual([]);
    const second = buildSchedule({ tasks, blocks, busy: [], settings: SETTINGS, now: MIDNIGHT_NOW });
    expect(firstStart(second, "sultan")).toBe(iso(WED, "10:30"));
    // The pin is already in the input, so only the knock-on shows as moved
    expect(second.moved).toEqual([{ taskId: "sultan", from: iso(MON, "09:00"), to: iso(WED, "10:30") }]);
    expect(knockOnMessage(second.moved, tasks, WITA, "arief")).toBe(
      "Moved 1 task after Follow up Pak Arief on Sultan down payment.",
    );
  });

  it("re-placing the follow-up drags a kept agreement along", () => {
    const tasks = [followUp, sultan];
    const first = run({ tasks });
    // Monday morning fills up, so the follow-up has to move and the agreement must follow it
    const r = run({ tasks, blocks: first.blocks, busy: [busy(iso(MON, "08:00"), iso(MON, "16:30"))] });
    expect(firstStart(r, "arief")).toBe(iso(TUE, "08:30"));
    expect(firstStart(r, "sultan")).toBe(iso(TUE, "09:00"));
  });

  it("holds the agreement while the follow-up is waiting", () => {
    const tasks = [{ ...followUp, status: "waiting" as const }, sultan];
    const r = run({ tasks });
    expect(r.blocks).toEqual([]);
    expect(r.unplaced).toEqual(["sultan"]);
  });

  it("drops a kept agreement when its dependency has no block any more", () => {
    const tasks = [followUp, sultan];
    const first = run({ tasks });
    const waiting = [{ ...followUp, status: "waiting" as const }, sultan];
    const r = run({ tasks: waiting, blocks: first.blocks });
    expect(r.blocks).toEqual([]);
    expect(r.unplaced).toEqual(["sultan"]);
    expect(knockOnMessage(r.moved, waiting, WITA)).toBe("No free slot for Sultan agreement yet.");
  });

  it("frees the agreement once the follow-up is done", () => {
    const r = run({ tasks: [{ ...followUp, status: "done" as const }, sultan] });
    expect(firstStart(r, "sultan")).toBe(iso(MON, "08:30"));
  });

  it("waits for a timed dependency to end", () => {
    const r = run({ tasks: [{ ...followUp, scheduled_at: iso(MON, "13:00") }, sultan] });
    expect(firstStart(r, "sultan")).toBe(iso(MON, "13:30"));
  });

  it("gives up on a dependency cycle", () => {
    const r = run({ tasks: [t("a", { depends_on: ["b"] }), t("b", { depends_on: ["a"] })] });
    expect(r.unplaced.sort()).toEqual(["a", "b"]);
  });
});

describe("forced tasks", () => {
  it("pins the next free high-energy slot", () => {
    const now = at(MON, "12:00");
    const r = run({ tasks: [t("normal"), t("f", { forced: true, estimate_min: 30 })], now });
    const f = r.blocks.find((b) => b.task_id === "f");
    expect(f).toMatchObject({ start_at: iso(TUE, "08:30"), pinned: true, source: "force" });
    expect(firstStart(r, "normal")).toBe(iso(MON, "12:00"));
  });

  it("falls back to the next free slot without high-energy windows", () => {
    const settings: Settings = { ...SETTINGS, energy_windows: [] };
    const r = run({ tasks: [t("f", { forced: true })], now: at(MON, "12:00"), settings });
    expect(r.blocks[0]).toMatchObject({ start_at: iso(MON, "12:00"), pinned: true, source: "force" });
  });

  it("goes before everything else", () => {
    const tasks = [t("urgent", { deadline: MON, priority: 0, estimate_min: 180 }), t("f", { forced: true })];
    const r = run({ tasks });
    expect(firstStart(r, "f")).toBe(iso(MON, "08:30"));
    expect(firstStart(r, "urgent")).toBe(iso(MON, "09:30"));
  });
});

describe("quiet hours", () => {
  it("never places anything inside quiet hours even when work hours overlap them", () => {
    const settings: Settings = { ...SETTINGS, work_start: "06:00", work_end: "23:00", focus_cap_min: 2000 };
    const r = run({ tasks: filler(40), settings, horizonDays: 2 });
    expect(r.blocks.length).toBeGreaterThan(0);
    for (const b of r.blocks) {
      expect(localMinutes(b.start_at, WITA)).toBeGreaterThanOrEqual(8 * 60);
      expect(localMinutes(b.end_at, WITA)).toBeLessThanOrEqual(21 * 60);
    }
    expect(r.blocks[0].start_at).toBe(iso(MON, "08:00"));
  });
});

describe("midnight in the configured zone", () => {
  it("reads 'today' in settings.timezone", () => {
    const wita = run({ tasks: [t("a")] });
    const wib = run({ tasks: [t("a")], settings: { ...SETTINGS, timezone: WIB } });
    expect(firstStart(wita, "a")).toBe(iso(MON, "08:30", WITA));
    expect(firstStart(wib, "a")).toBe(iso(MON, "08:30", WIB));
  });

  it("places the first block on a different local day per zone", () => {
    const allDay: Settings = {
      ...SETTINGS,
      work_start: "00:00",
      work_end: "24:00",
      quiet_start: "00:00",
      quiet_end: "00:00",
      work_days: [1, 2, 3, 4, 5, 6, 7],
    };
    const wita = run({ tasks: [t("a")], settings: allDay });
    const wib = run({ tasks: [t("a")], settings: { ...allDay, timezone: WIB } });
    expect(localDate(firstStart(wita, "a") as string, WITA)).toBe(MON);
    expect(localDate(firstStart(wib, "a") as string, WIB)).toBe(SUN.replace("18", "11"));
    expect(localTime(firstStart(wib, "a") as string, WIB)).toBe("23:30");
  });
});

describe("energy", () => {
  it("puts high tasks in high-energy windows and low tasks outside them", () => {
    const now = at(MON, "12:00");
    const r = run({ tasks: [t("hi", { energy: "high" }), t("lo", { energy: "low" })], now });
    expect(firstStart(r, "hi")).toBe(iso(TUE, "08:30"));
    expect(firstStart(r, "lo")).toBe(iso(MON, "12:00"));
    const r2 = run({ tasks: [t("lo", { energy: "low" })] });
    expect(firstStart(r2, "lo")).toBe(iso(MON, "11:30"));
  });

  it("lets a low task take a high slot when nothing else fits", () => {
    const settings: Settings = { ...SETTINGS, energy_windows: [{ start: "00:00", end: "23:59" }] };
    const r = run({ tasks: [t("lo", { energy: "low" })], settings });
    expect(firstStart(r, "lo")).toBe(iso(MON, "08:30"));
  });

  it("low check-in keeps high tasks out of the next 2 hours, including kept blocks", () => {
    const now = at(MON, "08:30");
    const tasks = [t("hi", { energy: "high" })];
    expect(firstStart(run({ tasks, now }), "hi")).toBe(iso(MON, "08:30"));
    const kept = block("hi", iso(MON, "08:30"), iso(MON, "09:30"));
    const r = run({ tasks, now: at(MON, "08:29"), blocks: [kept], energyToday: "low" });
    expect(firstStart(r, "hi")).toBe(iso(MON, "10:30"));
    expect(knockOnMessage(r.moved, tasks, WITA)).toBe("Moved hi to Mon 10:30.");
  });

  it("high check-in pulls high tasks into the next 3 hours", () => {
    const now = at(MON, "13:00");
    const tasks = [t("hi", { energy: "high" }), t("plain")];
    const kept = block("hi", iso(TUE, "08:30"), iso(TUE, "09:30"));
    expect(firstStart(run({ tasks, now, blocks: [kept] }), "hi")).toBe(iso(TUE, "08:30"));
    const r = run({ tasks, now, blocks: [kept], energyToday: "high" });
    expect(firstStart(r, "hi")).toBe(iso(MON, "13:00"));
    expect(firstStart(r, "plain")).toBe(iso(MON, "14:00"));
  });
});

describe("plan stability", () => {
  const mixed = [
    followUp,
    sultan,
    navaho,
    ...overloadedWeek,
    t("f", { forced: true, estimate_min: 45 }),
    t("hi", { energy: "high", estimate_min: 90 }),
    t("lo", { energy: "low", estimate_min: 30 }),
    t("later", { plan_for: WED }),
    t("long", { estimate_min: 400, deadline: "2026-10-23" }),
    t("call", { scheduled_at: iso(TUE, "14:00") }),
  ];

  it("re-running on its own output keeps every block identical", () => {
    const busyList = [busy(iso(WED, "13:00"), iso(WED, "15:00"))];
    const first = run({ tasks: mixed, busy: busyList });
    const second = run({ tasks: mixed, busy: busyList, blocks: first.blocks });
    expect(second.blocks).toEqual(first.blocks);
    expect(second.moved).toEqual([]);
    expect(second.warnings).toEqual(first.warnings);
    expect(knockOnMessage(second.moved, mixed, WITA)).toBeNull();
  });

  it("adding a task does not shuffle kept blocks", () => {
    const first = run({ tasks: mixed });
    const more = [...mixed, t("new", { priority: 0 })];
    const second = run({ tasks: more, blocks: first.blocks });
    expect(second.moved.map((m) => m.taskId)).toEqual(["new"]);
  });
});

describe("knockOnMessage", () => {
  const tasks = [navaho, followUp, sultan];
  it("names the single move with day and time in the given zone", () => {
    const moved = [{ taskId: "navaho", from: null, to: iso(THU, "09:00") }];
    expect(knockOnMessage(moved, tasks, WITA)).toBe("Moved Navaho payments to Thu 09:00.");
    expect(knockOnMessage(moved, tasks, WIB)).toBe("Moved Navaho payments to Thu 08:00.");
  });
  it("counts several moves", () => {
    const moved = [
      { taskId: "navaho", from: null, to: iso(THU, "09:00") },
      { taskId: "sultan", from: null, to: iso(THU, "10:00") },
    ];
    expect(knockOnMessage(moved, tasks, WITA)).toBe("Moved 2 tasks.");
    expect(knockOnMessage(moved, tasks, WITA, "arief")).toBe(
      "Moved 2 tasks after Follow up Pak Arief on Sultan down payment.",
    );
  });
  it("is null when nothing moved", () => {
    expect(knockOnMessage([], tasks, WITA)).toBeNull();
  });
});

describe("nextFreeSlot and blocksForDay", () => {
  const now = at(MON, "12:00");
  const base = { tasks: [], busy: [busy(iso(MON, "12:00"), iso(MON, "13:00"))], settings: SETTINGS, now };
  it("finds the next gap, preferring high energy when asked", () => {
    const blocks = [block("x", iso(MON, "13:00"), iso(MON, "13:30"))];
    expect(nextFreeSlot({ ...base, blocks }, 30, { highEnergy: false })).toEqual({
      start_at: iso(MON, "13:30"),
      end_at: iso(MON, "14:00"),
    });
    expect(nextFreeSlot({ ...base, blocks }, 30, { highEnergy: true })?.start_at).toBe(iso(TUE, "08:30"));
  });
  it("returns null with no room", () => {
    expect(nextFreeSlot({ ...base, blocks: [], horizonDays: 0 }, 30, { highEnergy: true })).toBeNull();
  });
  it("filters blocks by local day in time order", () => {
    const b1 = block("a", iso(MON, "10:00"), iso(MON, "11:00"));
    const b2 = block("b", iso(MON, "08:30"), iso(MON, "09:00"));
    const b3 = block("c", iso(TUE, "08:30"), iso(TUE, "09:00"));
    expect(blocksForDay([b1, b3, b2], MON, WITA)).toEqual([b2, b1]);
  });
});

describe("performance", () => {
  it("plans 100 tasks over 14 days in well under 50ms", () => {
    const tasks = filler(100, 45).map((x, i) => ({
      ...x,
      deadline: i % 3 === 0 ? `2026-10-${String(13 + (i % 12)).padStart(2, "0")}` : null,
      energy: i % 4 === 0 ? ("high" as const) : i % 4 === 1 ? ("low" as const) : null,
      depends_on: i % 10 === 5 ? [`fill-${String(i - 1).padStart(3, "0")}`] : [],
    }));
    const settings: Settings = { ...SETTINGS, focus_cap_min: 480 };
    run({ tasks, settings }); // warm up Intl caches
    const t0 = performance.now();
    const r = run({ tasks, settings });
    const second = run({ tasks, settings, blocks: r.blocks });
    const ms = (performance.now() - t0) / 2;
    expect(second.moved).toEqual([]);
    expect(ms).toBeLessThan(50);
  });
});
