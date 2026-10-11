// Otto's voice. Calm, direct, two sentences max, no emoji, no apologies.
import type { EnergyLevel, Tone } from "./types";
import { localParts } from "./time";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Number for the start of a sentence: 'Two', 'Ten', '14'. */
export function spellStart(n: number): string {
  const w = WORDS[n];
  return w ? w[0].toUpperCase() + w.slice(1) : String(n);
}

const pick = <T>(list: T[], rand: () => number): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

export function greeting(now: Date, tz: string, name: string): string {
  const h = localParts(now, tz).hour;
  return `${h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"}, ${name}.`;
}

export const PRAISE = ["Off your plate.", "One less thing in your head.", "Handled.", "Crossed off. Next."];
export const BIG_PRAISE = "Big one, done.";

/** `recent` is oldest first; only the newest entry is avoided. */
export function praiseLine(priority: number | null, rand: () => number, recent: string[] = []): string {
  if (priority === 0 || priority === 1) return BIG_PRAISE;
  const last = recent[recent.length - 1];
  return pick(
    PRAISE.filter((p) => p !== last),
    rand,
  );
}

export const GOAL_HIT_LINE = "Daily goal hit. Everything else today is bonus.";
export const goalReachedLine = "You did it. Pick the next one from your bucket list.";

export function completionGoalLine(goal: string | null): string {
  return goal ? `Nice. One step closer to ${goal}.` : "Keep the momentum.";
}

export function progressLine(doneCount: number, goal: number): string {
  if (doneCount < goal) return `${spellStart(goal - doneCount)} more and today counts as a win.`;
  if (doneCount === goal) return "Today counts as a win. Everything else is bonus.";
  return `Nice. That's ${doneCount}. Everything else today is bonus.`;
}

export type ScoreBand = "high" | "rising" | "middle" | "low" | "none";

const T = {
  high: ["Score {score}. Keep this pace and {goal} stops being a someday.", "{streakDays} days above 70. This is how {goal} happens."],
  highFree: ["Score {score}. Keep the momentum.", "{streakDays} days above 70. Keep the momentum."],
  rising: ["Up {delta} from yesterday. That's the direction {goal} is in."],
  risingFree: ["Up {delta} from yesterday. Keep the momentum."],
  middle: ["Score {score}. Solid. One more P1 today and {goal} gets closer."],
  middleFree: ["Score {score}. Solid. One more P1 today."],
  low: [
    "Score {score}. At this rate {goal} stays a phone wallpaper. Start the green card.",
    "If you keep this score low, {goal} isn't coming soon. One task now still counts.",
  ],
  lowFree: ["Score {score}. One task now still counts.", "Score {score}. Start the green card."],
  hype: ["Nice. One step closer to {goal}.", "Back in motion. That's how {goal} happens."],
  hypeFree: ["Back in motion. Keep the momentum.", "Keep the momentum."],
  gentle: ["{goal} is still on the table. One task now still counts."],
  gentleFree: ["One task now still counts."],
  free: ["Keep the momentum.", "Everything else is bonus."],
};

export interface ScoreMessageInput {
  score: number;
  delta: number | null;
  streakDays: number;
  goal: string | null;
  tone: Tone;
  /** Messages already shown, oldest first. The last 5 are never repeated. */
  recent: string[];
  toughLoveUsedToday: boolean;
  justCompleted: boolean;
  lastDayLow: boolean;
  rand: () => number;
}

/**
 * Picks one score message. Low-band lines are tough love: once a day, never right after a
 * completion, never in hype tone; blocked cases fall back to a hype line, or a gentle nudge when
 * nothing was just completed. Returns text '' with band
 * 'none' when every candidate was shown recently, so Otto stays quiet instead of repeating itself.
 */
export function pickScoreMessage(input: ScoreMessageInput): { text: string; band: ScoreBand; toughLove: boolean } {
  const { score, delta, streakDays, goal, recent, rand } = input;
  const fill = (tpl: string) =>
    tpl
      .replace("{score}", String(score))
      .replace("{delta}", String(delta ?? 0))
      .replace("{streakDays}", String(streakDays))
      .replace("{goal}", goal ?? "");
  const seen = new Set(recent.slice(-5));
  const g = (withGoal: string[], free: string[]) => (goal ? withGoal : free);

  const band: Exclude<ScoreBand, "none"> =
    score >= 70 ? "high" : delta !== null && delta >= 10 ? "rising" : score >= 40 ? "middle" : "low";
  const hypeFirst = input.lastDayLow && input.justCompleted;
  const toughBlocked = input.toughLoveUsedToday || input.justCompleted || input.tone === "hype";

  const pools: { band: ScoreBand; lines: string[]; tough: boolean }[] = [];
  if (!hypeFirst && band === "low" && !toughBlocked) pools.push({ band, lines: g(T.low, T.lowFree), tough: true });
  if (!hypeFirst && band !== "low") {
    const lines =
      band === "high"
        ? g(T.high, T.highFree).filter((l) => streakDays >= 2 || !l.startsWith("{streakDays}"))
        : band === "rising"
          ? g(T.rising, T.risingFree)
          : g(T.middle, T.middleFree);
    pools.push({ band, lines, tough: false });
  }
  const lift = input.justCompleted || band !== "low" ? g(T.hype, T.hypeFree) : g(T.gentle, T.gentleFree);
  pools.push({ band: "none", lines: lift, tough: false });
  pools.push({ band: "none", lines: T.free, tough: false });

  for (const pool of pools) {
    const fresh = pool.lines.map(fill).filter((l) => !seen.has(l));
    if (fresh.length) return { text: pick(fresh, rand), band: pool.band, toughLove: pool.tough };
  }
  return { text: "", band: "none", toughLove: false };
}

export const ENERGY_LABEL: Record<EnergyLevel, string> = { low: "Low", ok: "Okay", high: "Charged" };

export const energyCheckLines = {
  question: "How's your energy right now?",
  afternoon: (level: EnergyLevel) => `Afternoon check. Still ${ENERGY_LABEL[level]}?`,
  collapsed: (level: EnergyLevel) => `Energy: ${ENERGY_LABEL[level]}. Otto picked a task to match.`,
  answer: (level: EnergyLevel, task?: string, reason?: string): string =>
    level === "low"
      ? "Low battery is fine. Here's a 5 minute one. Finish it and you're already moving."
      : level === "high"
        ? "Charged. Let's use it on the big one before lunch."
        : task
          ? `Good. Start with ${task}${reason ? `, ${reason}` : ""}.`
          : "Good. Normal order today.",
  lowGoal: (goal: number) => `Goal's ${goal} today. That's plenty.`,
};

export function focusEndLine(minutes: number): string {
  return minutes <= 5 ? "5 minutes done. Starting was the hard part." : "Time's up. Done, or another round?";
}

/** App open and the 08:00 summary. */
export function morningLine(input: { doneYesterday: number; overdue: number; nextTitle: string | null; goal: string | null }): string {
  const { doneYesterday, overdue, nextTitle, goal } = input;
  const next = nextTitle ? `First up: ${nextTitle}.` : null;
  if (overdue > 0) return `${spellStart(overdue)} overdue. ${next ?? "Give each one a new day."}`;
  if (!next) return "Nothing planned yet. Add one thing that matters.";
  if (doneYesterday > 0) return `${spellStart(doneYesterday)} done yesterday. ${next}`;
  return goal ? `${next} That's a step toward ${goal}.` : `${next} Five minutes is enough to begin.`;
}

/** The 17:00 wrap-up. */
export function wrapUpLine(input: { doneCount: number; dailyGoal: number; overdue: number }): string {
  const { doneCount, dailyGoal, overdue } = input;
  const done = doneCount === 0 ? "Nothing done yet today." : `${spellStart(doneCount)} done today.`;
  if (doneCount >= dailyGoal) return `${done} Goal hit, the rest can wait for tomorrow.`;
  if (overdue > 0) return `${done} Give the ${overdue} overdue a new day before you stop.`;
  return `${done} ${spellStart(dailyGoal - doneCount)} more and today counts as a win.`;
}

export function tzChangedLine(label: string): string {
  return `Switched to ${label}. Your day now runs on ${label} time.`;
}
