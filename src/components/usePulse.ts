"use client";

import { useMemo } from "react";
import { store, useOtto } from "@/lib/store";
import { buildToday } from "@/engine/today";
import { computeDayStats, dailyScore, goalStreak, momentum, trend, adjustedDailyGoal } from "@/engine/daily";
import { addDays, hm, localDate, localMinutes, isWorkingDay } from "@/engine/time";
import type { EnergyLevel } from "@/engine/types";

/** Today's latest check-in, or null. Minute precision is enough, so it keys on the local date only. */
export function useEnergy(): { level: EnergyLevel | null; at: string | null } {
  const checkins = useOtto((s) => s.checkins);
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const today = localDate(now, tz);
  return useMemo(() => {
    const todays = checkins.filter((c) => localDate(c.at, tz) === today);
    const last = todays[todays.length - 1];
    return { level: last?.level ?? null, at: last?.at ?? null };
  }, [checkins, tz, today]);
}

export function useToday() {
  const tasks = useOtto((s) => s.tasks);
  const blocks = useOtto((s) => s.blocks);
  const settings = useOtto((s) => s.settings);
  const now = useOtto((s) => s.now);
  const snoozed = useOtto((s) => s.snoozed);
  const energy = useEnergy();
  return useMemo(() => {
    const at = new Date(now);
    const hidden = new Set(Object.entries(snoozed).filter(([, until]) => until > now).map(([id]) => id));
    if (!hidden.size) return buildToday(tasks, blocks, at, settings, energy.level);
    // Snoozed tasks drop out of the top spots; if nothing else is left they come back.
    const model = buildToday(tasks.filter((t) => !hidden.has(t.id)), blocks, at, settings, energy.level);
    return model.next ? model : buildToday(tasks, blocks, at, settings, energy.level);
  }, [tasks, blocks, settings, now, energy.level, snoozed]);
}

export interface Pulse {
  score: number;
  parts: Record<string, number>;
  doneCount: number;
  dailyGoal: number;
  streak: number;
  momentum: number;
  trend: "up" | "down" | "flat";
  timeLeftMin: number;
  yesterdayScore: number | null;
}

export function usePulse(): Pulse {
  const tasks = useOtto((s) => s.tasks);
  const events = useOtto((s) => s.events);
  const scores = useOtto((s) => s.scores);
  const settings = useOtto((s) => s.settings);
  const now = useOtto((s) => s.now);
  const energy = useEnergy();
  const tz = settings.timezone;
  const today = localDate(now, tz);
  const nowMin = localMinutes(now, tz);

  return useMemo(() => {
    const goal = adjustedDailyGoal(settings.daily_goal, energy.level);
    const todayRow = scores.find((r) => r.day === today);
    const stats = computeDayStats({
      tasks,
      events,
      day: today,
      settings,
      dailyGoal: goal,
      plannedIdsAt8am: todayRow?.planned_ids ?? null,
    });
    const live = dailyScore(stats);

    const doneByDay = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "done" && t.done_at) {
        const d = localDate(t.done_at, tz);
        doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1);
      }
    }
    const goalByDay = new Map(scores.map((r) => [r.day, r.daily_goal ?? settings.daily_goal]));
    const days: { day: string; doneCount: number; goal: number }[] = [];
    for (let i = 59; i >= 0; i--) {
      const d = addDays(today, -i);
      days.push({ day: d, doneCount: doneByDay.get(d) ?? 0, goal: d === today ? goal : goalByDay.get(d) ?? settings.daily_goal });
    }
    const streak = goalStreak(days, today, settings.work_days);

    const history = scores.filter((r) => r.day < today && r.score != null).map((r) => r.score as number);
    const prevMomentum = history.length ? momentum(history) : null;
    const mom = momentum([...history, live.score]);
    const yRow = scores.find((r) => r.day === addDays(today, -1));

    // Before work starts it shows the whole work day, so midnight never reads as 16 hours.
    const timeLeftMin = isWorkingDay(today, settings.work_days) ? Math.max(0, hm(settings.work_end) - Math.max(nowMin, hm(settings.work_start))) : 0;

    return {
      score: live.score,
      parts: live.parts as unknown as Record<string, number>,
      doneCount: stats.doneCount,
      dailyGoal: goal,
      streak,
      momentum: mom,
      trend: trend(prevMomentum, mom),
      timeLeftMin,
      yesterdayScore: yRow?.score ?? null,
    };
  }, [tasks, events, scores, settings, energy.level, today, nowMin, tz]);
}

export function useTask(id: string | null) {
  const tasks = useOtto((s) => s.tasks);
  return useMemo(() => (id ? tasks.find((t) => t.id === id) ?? null : null), [tasks, id]);
}

export { store };
