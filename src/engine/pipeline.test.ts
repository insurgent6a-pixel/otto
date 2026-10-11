import { describe, expect, it } from "vitest";
import { expandPipeline, parsePipelineSteps } from "./pipeline";
import type { PipelineTemplate } from "./types";

describe("parsePipelineSteps", () => {
  it("parses day lines, plus offsets and estimates", () => {
    const text = ["day 0: Mix batch ~30m", "Day 7: Turn pile", "", "+21 Ready check", "day 3 - Water ~1h", "+2 drink water", "nonsense", "day 4:", "day 5 days: Check ~45"].join("\n");
    expect(parsePipelineSteps(text)).toEqual([
      { offset_days: 0, title: "Mix batch", kind: "task", estimate_min: 30 },
      { offset_days: 7, title: "Turn pile", kind: "task", estimate_min: null },
      { offset_days: 21, title: "Ready check", kind: "task", estimate_min: null },
      { offset_days: 3, title: "Water", kind: "task", estimate_min: 60 },
      { offset_days: 2, title: "drink water", kind: "task", estimate_min: null },
      { offset_days: 5, title: "Check", kind: "task", estimate_min: 45 },
    ]);
  });

  it("handles CRLF and an estimate-only title", () => {
    expect(parsePipelineSteps("day 1: A\r\nday 2: ~30m")).toEqual([{ offset_days: 1, title: "A", kind: "task", estimate_min: null }]);
  });
});

describe("expandPipeline", () => {
  const template: PipelineTemplate = {
    id: "p1",
    name: "Compost batch",
    steps: [
      { offset_days: 7, title: "Turn pile", kind: "task", estimate_min: null },
      { offset_days: 0, title: "Mix batch", kind: "task", estimate_min: 30 },
    ],
  };

  it("makes one ordered task per step with unconfirmed deadlines", () => {
    expect(expandPipeline(template, "2026-10-28", { project: "teba" })).toEqual([
      {
        title: "Mix batch",
        project: "teba",
        status: "todo",
        estimate_min: 30,
        deadline: "2026-10-28",
        deadline_confirmed: false,
        notes: "Step 1 of 2: Compost batch",
        depends_on: [],
      },
      {
        title: "Turn pile",
        project: "teba",
        status: "todo",
        estimate_min: null,
        deadline: "2026-11-04",
        deadline_confirmed: false,
        notes: "Step 2 of 2: Compost batch",
        depends_on: [],
      },
    ]);
  });

  it("defaults to no project", () => {
    expect(expandPipeline(template, "2026-10-28")[0].project).toBeNull();
    expect(expandPipeline({ ...template, steps: [] }, "2026-10-28")).toEqual([]);
  });
});
