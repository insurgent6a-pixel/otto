import { describe, expect, it } from "vitest";
import { makeTask } from "@/engine/types";
import { dropTarget, hourRange, indexByDay, monthGrid, presetFor, shiftMonth, spanOf, weekDays, weekLabel } from "./model";

describe("calendar model", () => {
  it("builds Monday-first month and week grids", () => {
    const grid = monthGrid("2026-10-14");
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(grid).toHaveLength(5);
    expect(weekDays("2026-10-18")[0]).toBe("2026-10-12");
    expect(weekLabel(weekDays("2026-10-01"))).toBe("28 Sep to 4 Oct 2026");
  });

  it("shifts months and clamps the day", () => {
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("writes quick-add presets the parser reads", () => {
    expect(presetFor("2026-10-14", "2026-10-12")).toBe("14 oct");
    expect(presetFor("2027-01-03", "2026-10-12")).toBe("3 jan 2027");
  });

  it("groups tasks by local day in the configured zone", () => {
    const timed = makeTask({ title: "Call", scheduled_at: "2026-10-12T17:00:00Z" }); // 01:00 next day in WITA
    const due = makeTask({ title: "Due", deadline: "2026-10-14" });
    const done = makeTask({ title: "Old", deadline: "2026-10-14", status: "done" });
    const idx = indexByDay([timed, due, done], "Asia/Makassar");
    expect(idx.get("2026-10-13")!.timed).toEqual([timed]);
    expect(idx.get("2026-10-14")!.due).toEqual([due]);
    expect(indexByDay([timed], "Europe/London").get("2026-10-12")!.timed).toHaveLength(1);
  });

  it("spans, hour range and drop target stay in the grid", () => {
    const s = spanOf("2026-10-12T15:00:00Z", "2026-10-12T17:00:00Z", "Asia/Makassar"); // 23:00 to 01:00
    expect(s).toEqual({ day: "2026-10-12", start: 1380, end: 1440 });
    expect(hourRange("08:30", "16:30", [{ day: "x", start: 7 * 60 + 10, end: 1000 }])).toEqual([420, 1020]);
    const range: [number, number] = [480, 1020];
    expect(dropTarget({ day: 2, min: 600, dur: 60 }, 95, 37, 100, 1, range)).toEqual({ day: 3, min: 630 });
    expect(dropTarget({ day: 6, min: 600, dur: 60 }, 500, 9999, 100, 1, range)).toEqual({ day: 6, min: 960 });
    expect(dropTarget({ day: 0, min: 600, dur: 60 }, -500, -9999, 100, 1, range)).toEqual({ day: 0, min: 480 });
  });
});
