import { describe, expect, it } from "vitest";
import {
  BIG_PRAISE,
  completionGoalLine,
  energyCheckLines,
  focusEndLine,
  GOAL_HIT_LINE,
  goalReachedLine,
  greeting,
  morningLine,
  pickScoreMessage,
  PRAISE,
  praiseLine,
  progressLine,
  spellStart,
  tzChangedLine,
  wrapUpLine,
  type ScoreMessageInput,
} from "./messages";

const zero = () => 0;
const GOAL = "Trip to Japan";

describe("greeting", () => {
  it("uses the local hour in the given zone", () => {
    // 03:30Z is 11:30 WITA and 10:30 WIB
    expect(greeting(new Date("2026-10-12T03:30:00Z"), "Asia/Makassar", "Electra")).toBe("Morning, Electra.");
    expect(greeting(new Date("2026-10-12T04:00:00Z"), "Asia/Makassar", "Electra")).toBe("Afternoon, Electra.");
    expect(greeting(new Date("2026-10-12T04:00:00Z"), "Asia/Jakarta", "Electra")).toBe("Morning, Electra.");
    expect(greeting(new Date("2026-10-12T09:00:00Z"), "Asia/Makassar", "Electra")).toBe("Evening, Electra.");
  });
});

describe("praise and progress", () => {
  it("gives big praise to P0 and P1", () => {
    expect(praiseLine(0, zero)).toBe(BIG_PRAISE);
    expect(praiseLine(1, zero)).toBe("Big one, done.");
  });

  it("rotates without repeating the last line", () => {
    expect(praiseLine(2, zero)).toBe(PRAISE[0]);
    expect(praiseLine(null, zero, ["Handled.", PRAISE[0]])).toBe(PRAISE[1]);
    expect(praiseLine(3, () => 0.999, [])).toBe(PRAISE[3]);
    for (let i = 0; i < 10; i++) expect(praiseLine(4, () => i / 10, ["Handled."])).not.toBe("Handled.");
  });

  it("goal lines", () => {
    expect(GOAL_HIT_LINE).toBe("Daily goal hit. Everything else today is bonus.");
    expect(goalReachedLine).toBe("You did it. Pick the next one from your bucket list.");
    expect(completionGoalLine(GOAL)).toBe("Nice. One step closer to Trip to Japan.");
    expect(completionGoalLine(null)).toBe("Keep the momentum.");
  });

  it("progress spells small numbers", () => {
    expect(progressLine(1, 3)).toBe("Two more and today counts as a win.");
    expect(progressLine(2, 3)).toBe("One more and today counts as a win.");
    expect(progressLine(3, 3)).toBe("Today counts as a win. Everything else is bonus.");
    expect(progressLine(4, 3)).toBe("Nice. That's 4. Everything else today is bonus.");
    expect(spellStart(10)).toBe("Ten");
    expect(spellStart(12)).toBe("12");
  });
});

describe("pickScoreMessage", () => {
  const input = (over: Partial<ScoreMessageInput>): ScoreMessageInput => ({
    score: 50,
    delta: 0,
    streakDays: 0,
    goal: GOAL,
    tone: "steady",
    recent: [],
    toughLoveUsedToday: false,
    justCompleted: false,
    lastDayLow: false,
    rand: zero,
    ...over,
  });

  it("picks bands", () => {
    expect(pickScoreMessage(input({ score: 82 }))).toEqual({
      text: "Score 82. Keep this pace and Trip to Japan stops being a someday.",
      band: "high",
      toughLove: false,
    });
    expect(pickScoreMessage(input({ score: 82, streakDays: 4, rand: () => 0.9 })).text).toBe("4 days above 70. This is how Trip to Japan happens.");
    // a one-day streak is not worth announcing
    expect(pickScoreMessage(input({ score: 82, streakDays: 1, rand: () => 0.9 })).text).toContain("Score 82.");
    expect(pickScoreMessage(input({ score: 55, delta: 12 }))).toMatchObject({
      text: "Up 12 from yesterday. That's the direction Trip to Japan is in.",
      band: "rising",
    });
    expect(pickScoreMessage(input({ score: 55, delta: 9 }))).toMatchObject({
      text: "Score 55. Solid. One more P1 today and Trip to Japan gets closer.",
      band: "middle",
    });
    expect(pickScoreMessage(input({ score: 34 }))).toEqual({
      text: "Score 34. At this rate Trip to Japan stays a phone wallpaper. Start the green card.",
      band: "low",
      toughLove: true,
    });
    expect(pickScoreMessage(input({ score: 34, rand: () => 0.9 })).text).toBe(
      "If you keep this score low, Trip to Japan isn't coming soon. One task now still counts.",
    );
  });

  it("tough love at most once a day", () => {
    const r = pickScoreMessage(input({ score: 34, toughLoveUsedToday: true }));
    expect(r.toughLove).toBe(false);
    expect(r.text).toBe("Trip to Japan is still on the table. One task now still counts.");
  });

  it("never tough love right after a completion", () => {
    const r = pickScoreMessage(input({ score: 34, justCompleted: true }));
    expect(r).toEqual({ text: "Nice. One step closer to Trip to Japan.", band: "none", toughLove: false });
  });

  it("is off in hype tone", () => {
    const r = pickScoreMessage(input({ score: 20, tone: "hype" }));
    expect(r.toughLove).toBe(false);
    expect(r.band).toBe("none");
  });

  it("after a low day the next completion gets a hype line", () => {
    const r = pickScoreMessage(input({ score: 55, lastDayLow: true, justCompleted: true }));
    expect(r).toEqual({ text: "Nice. One step closer to Trip to Japan.", band: "none", toughLove: false });
    // a low day without a completion keeps the normal band
    expect(pickScoreMessage(input({ score: 55, lastDayLow: true })).band).toBe("middle");
  });

  it("never repeats the last 5 messages", () => {
    const low1 = "Score 34. At this rate Trip to Japan stays a phone wallpaper. Start the green card.";
    const low2 = "If you keep this score low, Trip to Japan isn't coming soon. One task now still counts.";
    expect(pickScoreMessage(input({ score: 34, recent: [low1] })).text).toBe(low2);
    // both low lines used: falls through to the gentle line
    expect(pickScoreMessage(input({ score: 34, recent: [low1, low2] })).toughLove).toBe(false);
    // older than the last 5 is allowed again
    expect(pickScoreMessage(input({ score: 34, recent: [low1, "a", "b", "c", "d", "e"] })).text).toBe(low1);
  });

  it("stays quiet when everything was said recently", () => {
    const r = pickScoreMessage(
      input({ score: 34, goal: null, toughLoveUsedToday: true, recent: ["One task now still counts.", "Keep the momentum.", "Everything else is bonus."] }),
    );
    expect(r).toEqual({ text: "", band: "none", toughLove: false });
  });

  it("uses goal-free lines with no goal", () => {
    expect(pickScoreMessage(input({ score: 34, goal: null })).text).toBe("Score 34. One task now still counts.");
    expect(pickScoreMessage(input({ score: 82, goal: null })).text).toBe("Score 82. Keep the momentum.");
    expect(pickScoreMessage(input({ score: 50, delta: 15, goal: null })).text).toBe("Up 15 from yesterday. Keep the momentum.");
    expect(pickScoreMessage(input({ score: 50, goal: null })).text).toBe("Score 50. Solid. One more P1 today.");
    expect(pickScoreMessage(input({ score: 50, goal: null, justCompleted: true, lastDayLow: true })).text).toBe(
      "Back in motion. Keep the momentum.",
    );
    expect(pickScoreMessage(input({ score: 50, goal: null, recent: ["Score 50. Solid. One more P1 today.", "Back in motion. Keep the momentum.", "Keep the momentum."] })).text).toBe(
      "Everything else is bonus.",
    );
  });

  it("never uses em dashes", () => {
    for (const score of [10, 50, 90]) {
      for (const goal of [GOAL, null]) expect(pickScoreMessage(input({ score, goal, streakDays: 3 })).text).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    }
  });
});

describe("energy, focus and summary lines", () => {
  it("energy lines", () => {
    expect(energyCheckLines.question).toBe("How's your energy right now?");
    expect(energyCheckLines.afternoon("ok")).toBe("Afternoon check. Still Okay?");
    expect(energyCheckLines.collapsed("high")).toBe("Energy: Charged. Otto picked a task to match.");
    expect(energyCheckLines.answer("low")).toBe("Low battery is fine. Here's a 5 minute one. Finish it and you're already moving.");
    expect(energyCheckLines.answer("high")).toBe("Charged. Let's use it on the big one before lunch.");
    expect(energyCheckLines.answer("ok", "Navaho payments", "due tomorrow")).toBe("Good. Start with Navaho payments, due tomorrow.");
    expect(energyCheckLines.answer("ok", "Navaho payments")).toBe("Good. Start with Navaho payments.");
    expect(energyCheckLines.answer("ok")).toBe("Good. Normal order today.");
    expect(energyCheckLines.lowGoal(2)).toBe("Goal's 2 today. That's plenty.");
  });

  it("focus end", () => {
    expect(focusEndLine(5)).toBe("5 minutes done. Starting was the hard part.");
    expect(focusEndLine(25)).toBe("Time's up. Done, or another round?");
  });

  it("morning line", () => {
    expect(morningLine({ doneYesterday: 3, overdue: 2, nextTitle: "IVG post", goal: null })).toBe("Two overdue. First up: IVG post.");
    expect(morningLine({ doneYesterday: 0, overdue: 1, nextTitle: null, goal: null })).toBe("One overdue. Give each one a new day.");
    expect(morningLine({ doneYesterday: 0, overdue: 0, nextTitle: null, goal: GOAL })).toBe("Nothing planned yet. Add one thing that matters.");
    expect(morningLine({ doneYesterday: 4, overdue: 0, nextTitle: "IVG post", goal: GOAL })).toBe("Four done yesterday. First up: IVG post.");
    expect(morningLine({ doneYesterday: 0, overdue: 0, nextTitle: "IVG post", goal: GOAL })).toBe("First up: IVG post. That's a step toward Trip to Japan.");
    expect(morningLine({ doneYesterday: 0, overdue: 0, nextTitle: "IVG post", goal: null })).toBe("First up: IVG post. Five minutes is enough to begin.");
  });

  it("wrap-up line", () => {
    expect(wrapUpLine({ doneCount: 3, dailyGoal: 3, overdue: 1 })).toBe("Three done today. Goal hit, the rest can wait for tomorrow.");
    expect(wrapUpLine({ doneCount: 1, dailyGoal: 3, overdue: 2 })).toBe("One done today. Give the 2 overdue a new day before you stop.");
    expect(wrapUpLine({ doneCount: 0, dailyGoal: 2, overdue: 0 })).toBe("Nothing done yet today. Two more and today counts as a win.");
  });

  it("timezone change", () => {
    expect(tzChangedLine("WITA")).toBe("Switched to WITA. Your day now runs on WITA time.");
  });
});
