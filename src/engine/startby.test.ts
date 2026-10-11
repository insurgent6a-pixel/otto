import { describe, expect, it } from "vitest";
import { computeStartByAuto, effectiveStartBy } from "./startby";
import { DEFAULT_SETTINGS, makeTask } from "./types";

const s = DEFAULT_SETTINGS; // Mon to Sat, 300 min cap

describe("computeStartByAuto", () => {
  it("is null without a deadline", () => {
    expect(computeStartByAuto(makeTask({ title: "a" }), s)).toBeNull();
  });

  it("subtracts estimate days plus a 1 day buffer when confirmed", () => {
    // Fri 16 Oct, 1 work day + 1 buffer = Wed 14 Oct
    const t = makeTask({ title: "a", deadline: "2026-10-16", deadline_confirmed: true, estimate_min: 120 });
    expect(computeStartByAuto(t, s)).toBe("2026-10-14");
  });

  it("uses a 2 day buffer when unconfirmed and 60 min when no estimate", () => {
    const t = makeTask({ title: "a", deadline: "2026-10-16" });
    expect(computeStartByAuto(t, s)).toBe("2026-10-13");
  });

  it("rounds big estimates up to whole working days and skips Sundays", () => {
    // Tue 20 Oct, ceil(700/300)=3 + 1 = 4 working days back: Mon 19, Sat 17, Fri 16, Thu 15
    const t = makeTask({ title: "a", deadline: "2026-10-20", deadline_confirmed: true, estimate_min: 700 });
    expect(computeStartByAuto(t, s)).toBe("2026-10-15");
  });

  it("handles a deadline on a non-working day (Sunday)", () => {
    const t = makeTask({ title: "a", deadline: "2026-10-18", deadline_confirmed: true });
    // Sun 18 Oct: 2 working days back is Fri 16 Oct
    expect(computeStartByAuto(t, s)).toBe("2026-10-16");
    // Mon to Fri only: Sat and Sun are skipped too
    expect(computeStartByAuto(t, { ...s, work_days: [1, 2, 3, 4, 5] })).toBe("2026-10-15");
  });
});

describe("effectiveStartBy", () => {
  it("manual wins, auto is tagged", () => {
    expect(effectiveStartBy({ start_by_manual: "2026-10-10", start_by_auto: "2026-10-12" })).toEqual({
      date: "2026-10-10",
      auto: false,
    });
    expect(effectiveStartBy({ start_by_manual: null, start_by_auto: "2026-10-12" })).toEqual({
      date: "2026-10-12",
      auto: true,
    });
    expect(effectiveStartBy({ start_by_manual: null, start_by_auto: null })).toEqual({ date: null, auto: false });
  });
});
