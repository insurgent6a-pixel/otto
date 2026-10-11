// Nightly sweep, spec section 7: nothing open is left without a time, a start-by or a return date.

import { shouldForce } from "./force";
import { computeStartByAuto } from "./startby";
import { addDays, localDate } from "./time";
import type { ScheduleBlock, Settings, Task } from "./types";

export type SweepWhy = "start_by" | "follow_up_set" | "resumed" | "forced";

export interface SweepPatch {
  id: string;
  patch: Partial<Task>;
  why: SweepWhy;
}

export interface SweepResult {
  patches: SweepPatch[];
  needsSchedule: string[];
}

// Higher wins when one task gets several patches.
const WHY_RANK: Record<SweepWhy, number> = { start_by: 0, follow_up_set: 1, resumed: 2, forced: 3 };
const WEEK_MS = 7 * 86400000;

export function nightlySweep(tasks: Task[], blocks: ScheduleBlock[], now: Date, settings: Settings): SweepResult {
  const today = localDate(now, settings.timezone);
  const nowMs = now.getTime();
  const patches: SweepPatch[] = [];
  const needsSchedule: string[] = [];

  for (const task of tasks) {
    if (task.status !== "todo" && task.status !== "waiting") continue;
    const patch: Partial<Task> = {};
    const whys: SweepWhy[] = [];
    const note = (w: SweepWhy) => whys.push(w);

    const startByAuto = computeStartByAuto(task, settings);
    if (startByAuto !== task.start_by_auto) {
      patch.start_by_auto = startByAuto;
      note("start_by");
    }

    if (task.status === "waiting") {
      if (!task.follow_up) {
        patch.follow_up = addDays(today, settings.followup_days);
        note("follow_up_set");
      } else if (task.follow_up < today) {
        // Strictly past: on the return date itself it stays waiting and scores the +30 follow-up part.
        patch.status = "todo";
        note("resumed");
      }
    }

    const next = { ...task, ...patch };
    const own = blocks.filter((b) => b.task_id === task.id);
    const upcoming = own.some((b) => new Date(b.end_at).getTime() > nowMs);
    if (shouldForce(next, now, settings, upcoming)) {
      patch.forced = true;
      note("forced");
    }

    if (whys.length) {
      const why = whys.reduce((a, b) => (WHY_RANK[b] > WHY_RANK[a] ? b : a));
      patches.push({ id: task.id, patch, why });
    }

    if (next.status === "todo" && !next.scheduled_at && !next.start_by_manual && !next.start_by_auto) {
      const inWeek = own.some((b) => {
        const t = new Date(b.start_at).getTime();
        return t >= nowMs && t < nowMs + WEEK_MS;
      });
      if (!inWeek) needsSchedule.push(task.id);
    }
  }

  return { patches, needsSchedule };
}
