"use client";

import { store } from "./store";
import { chime, confetti, haptic, speak } from "./rewards";
import { localDate, addDays } from "@/engine/time";
import { praiseLine, GOAL_HIT_LINE, completionGoalLine, focusEndLine } from "@/engine/messages";
import { adjustedDailyGoal } from "@/engine/daily";
import { postponePatch, shrinkPatch, handOffPatch } from "@/engine/force";
import type { Task } from "@/engine/types";

export function currentGoalName(): string | null {
  return store.state.goals.find((g) => g.is_current)?.name ?? null;
}

function doneTodayCount(): number {
  const tz = store.tz;
  const today = store.today();
  return store.state.tasks.filter((t) => t.status === "done" && t.done_at && localDate(t.done_at, tz) === today).length;
}

export function dailyGoalToday(): number {
  return adjustedDailyGoal(store.state.settings.daily_goal, store.todayEnergy());
}

let recentPraise: string[] = [];

/** The whole completion moment: feedback first, then the optimistic write. */
export function completeWithReward(task: Task, from?: Element | null) {
  const { settings } = store.state;
  const before = doneTodayCount();
  const goal = dailyGoalToday();
  const hitGoal = before + 1 === goal;
  const surprise = !hitGoal && Math.random() < 1 / 8;

  if (settings.haptics) haptic(hitGoal ? [12, 40, 18] : 12);
  if (settings.sound) chime(hitGoal ? "goal" : surprise ? "big" : "done");
  confetti(from, hitGoal || surprise ? "big" : "small");

  const praise = hitGoal ? GOAL_HIT_LINE : praiseLine(task.priority, Math.random, recentPraise);
  recentPraise = [...recentPraise, praise].slice(-3);
  if (settings.speak) speak(praise);

  if (store.state.timer?.taskId === task.id) stopTimer();

  void store.completeTask(task.id).then((handle) => {
    if (!handle) return;
    store.toast(praise, {
      otto: true,
      undo: () => void handle.undo(),
      ms: 5000,
    });
    const goalName = currentGoalName();
    if (!hitGoal && goalName && Math.random() < 0.35) {
      setTimeout(() => store.toast(completionGoalLine(goalName), { otto: true }), 5200);
    }
  });
}

export function postpone(task: Task, kind: "tomorrow" | "not_today" | "later_today") {
  const now = new Date();
  if (kind === "later_today") {
    store.snooze(task.id, now.getTime() + 2 * 3600000);
    store.toast("Later today. It comes back in 2 hours.", { otto: true, undo: () => store.snooze(task.id, null) });
    return;
  }
  const patch = postponePatch(task, kind, now, store.state.settings);
  void store.updateTask(task.id, patch).then((ok) => {
    if (!ok) return;
    store.toast(kind === "tomorrow" ? "Moved to tomorrow." : "Not today. It's on tomorrow's list.", {
        otto: true,
        undo: () => void store.updateTask(task.id, { plan_for: task.plan_for, postpone_count: task.postpone_count, forced: task.forced }),
      });
  });
}

export function shrink(task: Task, firstStep: string) {
  void store.updateTask(task.id, shrinkPatch(firstStep)).then((ok) => {
    if (ok) store.toast(`Shrunk to 15 minutes. First step: ${firstStep}.`, { otto: true });
  });
}

export function handOff(task: Task, who: string, returnDate: string) {
  void store.updateTask(task.id, handOffPatch(who, returnDate)).then((ok) => {
    if (ok) store.toast(`Waiting on ${who}. Back on your list ${returnDate === addDays(store.today(), 1) ? "tomorrow" : returnDate}.`, { otto: true });
  });
}

export function planToday(task: Task) {
  void store.updateTask(task.id, { plan_for: store.today() }).then((ok) => {
    if (ok) store.toast("On today's list.", { otto: true });
  });
}

// ---------- focus timer ----------

let timerHandle: ReturnType<typeof setInterval> | null = null;
let baseTitle = "";

export function startTimer(task: Task | null, minutes: number) {
  const now = Date.now();
  store.setTimer({ taskId: task?.id ?? null, startedAt: now, minutes, endsAt: now + minutes * 60000 });
  void store.logEvent("focus_started", task?.id ?? null, { minutes });
  ensureTimerLoop();
}

export function ensureTimerLoop() {
  if (timerHandle || typeof window === "undefined") return;
  baseTitle = document.title.replace(/^\d+:\d{2} · /, "");
  timerHandle = setInterval(tick, 1000);
  tick();
}

function tick() {
  const t = store.state.timer;
  if (!t) {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    document.title = baseTitle || "Otto";
    return;
  }
  const left = Math.max(0, t.endsAt - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  document.title = `${m}:${String(s).padStart(2, "0")} · ${baseTitle || "Otto"}`;
  if (left <= 0) finishTimer();
}

function finishTimer() {
  const t = store.state.timer;
  if (!t) return;
  const { settings } = store.state;
  if (settings.sound) chime("timer");
  if (settings.haptics) haptic([20, 60, 20]);
  const line = focusEndLine(t.minutes);
  if (settings.speak) speak(line);
  store.toast(line, { otto: true, ms: 8000 });
  void store.logEvent("focus_ended", t.taskId, { minutes: t.minutes });
  store.setTimer(null);
}

/** Stops early and logs the minutes actually spent. */
export function stopTimer(log = true) {
  const t = store.state.timer;
  if (!t) return;
  const spent = Math.round((Date.now() - t.startedAt) / 60000);
  if (log && spent > 0) void store.logEvent("focus_ended", t.taskId, { minutes: spent, early: true });
  store.setTimer(null);
}
