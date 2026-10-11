import { describe, expect, it } from "vitest";
import { forcedMessage, handOffPatch, postponePatch, shouldForce, shrinkPatch } from "./force";
import { DEFAULT_SETTINGS as s, makeTask, type Task } from "./types";

const now = new Date("2026-10-12T01:00:00Z"); // Mon 09:00 WITA
const t = (p: Partial<Task>) => makeTask({ title: "x", created_at: "2026-10-10T00:00:00Z", ...p });

describe("shouldForce", () => {
  it("forces at 3 postpones", () => {
    expect(shouldForce(t({ postpone_count: 2 }), now, s, false)).toBe(false);
    expect(shouldForce(t({ postpone_count: 3 }), now, s, true)).toBe(true);
  });

  it("forces after 14 days open with nothing scheduled", () => {
    const old = t({ created_at: "2026-09-28T01:00:00Z" }); // 14 local days
    expect(shouldForce(old, now, s, false)).toBe(true);
    expect(shouldForce(old, now, s, true)).toBe(false);
    expect(shouldForce({ ...old, scheduled_at: "2026-10-20T01:00:00Z" }, now, s, false)).toBe(false);
    expect(shouldForce(t({ created_at: "2026-09-29T01:00:00Z" }), now, s, false)).toBe(false);
  });

  it("skips non-todo and already forced tasks", () => {
    expect(shouldForce(t({ postpone_count: 5, status: "waiting" }), now, s, false)).toBe(false);
    expect(shouldForce(t({ postpone_count: 5, forced: true }), now, s, false)).toBe(false);
  });
});

describe("postponePatch", () => {
  it("tomorrow moves to the next working day and counts", () => {
    // Sat 17 Oct 09:00 WITA, Sunday is off
    const sat = new Date("2026-10-17T01:00:00Z");
    expect(postponePatch(t({}), "tomorrow", sat, s)).toEqual({ postpone_count: 1, plan_for: "2026-10-19" });
  });

  it("not today moves to the next calendar day and counts", () => {
    const sat = new Date("2026-10-17T01:00:00Z");
    expect(postponePatch(t({}), "not_today", sat, s)).toEqual({ postpone_count: 1, plan_for: "2026-10-18" });
  });

  it("later today changes nothing", () => {
    expect(postponePatch(t({ postpone_count: 2 }), "later_today", now, s)).toEqual({});
  });

  it("the third postpone forces", () => {
    expect(postponePatch(t({ postpone_count: 2 }), "tomorrow", now, s)).toEqual({
      postpone_count: 3,
      plan_for: "2026-10-13",
      forced: true,
    });
  });
});

describe("forced buttons and copy", () => {
  it("shrink, hand off", () => {
    expect(shrinkPatch("Open the file")).toEqual({
      next_action: "Open the file",
      estimate_min: 15,
      postpone_count: 1,
      forced: false,
    });
    expect(handOffPatch("Pak Arief", "2026-10-15")).toEqual({
      status: "waiting",
      waiting_on: "Pak Arief",
      follow_up: "2026-10-15",
      forced: false,
    });
  });

  it("forcedMessage", () => {
    expect(forcedMessage({ postpone_count: 3 }, "09:00")).toBe("Postponed 3 times. Locked in for 09:00.");
    expect(forcedMessage({ postpone_count: 0 }, "09:00")).toBe("Open 2 weeks with no plan. Locked in for 09:00.");
    expect(forcedMessage({ postpone_count: 4 }, null)).toBe("Postponed 4 times. Locked in for the next free slot.");
  });
});
