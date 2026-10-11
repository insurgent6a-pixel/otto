import { describe, expect, it } from "vitest";
import {
  dueLabel,
  durationLabel,
  estimateLabel,
  projectName,
  relativeDayLabel,
  timeLeftLabel,
  timesLabel,
} from "./format";

const today = "2026-10-12";

describe("format", () => {
  it("dueLabel counts days in plain words", () => {
    expect(dueLabel("2026-10-12", today, true)).toBe("due today");
    expect(dueLabel("2026-10-13", today, true)).toBe("due tomorrow");
    expect(dueLabel("2026-10-14", today, true)).toBe("due in 2 days");
    expect(dueLabel("2026-10-11", today, true)).toBe("1 day late");
    expect(dueLabel("2026-10-09", today, true)).toBe("3 days late");
    expect(dueLabel("2026-10-14", today, false)).toBe("due in 2 days, unconfirmed");
  });

  it("durations", () => {
    expect(durationLabel(15)).toBe("15 min");
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1h 30m");
    expect(estimateLabel({ estimate_min: 15 })).toBe("~15 min");
    expect(estimateLabel({ estimate_min: null })).toBe("~1h");
    expect(timeLeftLabel(380)).toBe("6h 20m");
    expect(timeLeftLabel(45)).toBe("45m");
    expect(timeLeftLabel(120)).toBe("2h");
    expect(timeLeftLabel(-5)).toBe("0m");
  });

  it("timesLabel and projectName", () => {
    expect([1, 2, 3].map(timesLabel)).toEqual(["once", "twice", "3 times"]);
    expect(projectName("omnisync")).toBe("OmniSync");
    expect(projectName("teba")).toBe("Teba");
    expect(projectName(null)).toBe("Unsorted");
  });

  it("relativeDayLabel", () => {
    expect(relativeDayLabel("2026-10-12", today)).toBe("Today");
    expect(relativeDayLabel("2026-10-13", today)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-10-11", today)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-15", today)).toBe("Thu 15 Oct");
    expect(relativeDayLabel("2027-01-03", today)).toBe("Sun 3 Jan");
  });
});
