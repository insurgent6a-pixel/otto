import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutes,
  addWorkingDays,
  diffDays,
  hm,
  hmString,
  inWindow,
  isoWeekday,
  isoWithOffset,
  isWorkingDay,
  localDate,
  localMinutes,
  localParts,
  localTime,
  startOfLocalDay,
  tzLabel,
  tzOffsetMinutes,
  zonedInstant,
} from "./time";

const WITA = "Asia/Makassar";
const WIB = "Asia/Jakarta";

describe("time", () => {
  it("reads local date and time in WITA", () => {
    // 16:30 UTC is 00:30 the next day in WITA (midnight edge)
    const at = "2026-10-11T16:30:00Z";
    expect(localDate(at, WITA)).toBe("2026-10-12");
    expect(localTime(at, WITA)).toBe("00:30");
    expect(localDate(at, WIB)).toBe("2026-10-11");
    expect(localTime(at, WIB)).toBe("23:30");
    expect(localMinutes(at, WITA)).toBe(30);
    expect(localParts(at, WITA).weekday).toBe(1);
  });

  it("builds instants from wall clock", () => {
    expect(zonedInstant("2026-10-12", "14:00", WITA).toISOString()).toBe("2026-10-12T06:00:00.000Z");
    expect(zonedInstant("2026-10-12", "14:00", WIB).toISOString()).toBe("2026-10-12T07:00:00.000Z");
    expect(startOfLocalDay("2026-10-12", WITA).toISOString()).toBe("2026-10-11T16:00:00.000Z");
  });

  it("handles DST zones", () => {
    // New York spring forward 2026-03-08
    expect(zonedInstant("2026-03-09", "09:00", "America/New_York").toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(zonedInstant("2026-03-06", "09:00", "America/New_York").toISOString()).toBe("2026-03-06T14:00:00.000Z");
    expect(zonedInstant("2026-03-08", "03:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("offsets and labels", () => {
    expect(tzOffsetMinutes("2026-10-11T00:00:00Z", WITA)).toBe(480);
    expect(tzLabel(WITA)).toBe("WITA");
    expect(tzLabel(WIB)).toBe("WIB");
    expect(tzLabel("Asia/Kolkata", new Date("2026-01-01T00:00:00Z"))).toBe("GMT+5:30");
    expect(tzLabel("America/New_York", new Date("2026-01-01T12:00:00Z"))).toBe("GMT-5");
    expect(isoWithOffset("2026-10-12T06:00:00Z", WITA)).toBe("2026-10-12T14:00:00+08:00");
    expect(isoWithOffset("2026-01-01T12:00:00Z", "America/New_York")).toBe("2026-01-01T07:00:00-05:00");
  });

  it("does calendar math", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-11", "2026-10-20")).toBe(9);
    expect(diffDays("2026-10-20", "2026-10-11")).toBe(-9);
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(isoWeekday("2026-10-12")).toBe(1);
  });

  it("does working day math", () => {
    const monSat = [1, 2, 3, 4, 5, 6];
    expect(isWorkingDay("2026-10-11", monSat)).toBe(false);
    expect(addWorkingDays("2026-10-12", -1, monSat)).toBe("2026-10-10"); // Mon minus 1 skips Sunday
    expect(addWorkingDays("2026-10-10", 1, monSat)).toBe("2026-10-12");
    expect(addWorkingDays("2026-10-10", 0, monSat)).toBe("2026-10-10");
    expect(addWorkingDays("2026-10-10", 2, [])).toBe("2026-10-12");
  });

  it("handles clock strings and windows", () => {
    expect(hm("08:30")).toBe(510);
    expect(hm("9")).toBe(540);
    expect(hmString(510)).toBe("08:30");
    expect(hmString(-30)).toBe("23:30");
    expect(inWindow(hm("22:00"), "21:00", "08:00")).toBe(true);
    expect(inWindow(hm("07:59"), "21:00", "08:00")).toBe(true);
    expect(inWindow(hm("08:00"), "21:00", "08:00")).toBe(false);
    expect(inWindow(hm("09:00"), "08:30", "11:30")).toBe(true);
    expect(inWindow(hm("09:00"), "09:00", "09:00")).toBe(false);
    expect(addMinutes("2026-10-12T06:00:00Z", 15).toISOString()).toBe("2026-10-12T06:15:00.000Z");
    expect(localDate(1760000000000, WITA)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
