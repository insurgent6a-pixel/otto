import { addWorkingDays } from "./time";
import type { Settings, Task } from "./types";

/** deadline - ceil(estimate / focus cap) working days - buffer (1, or 2 when unconfirmed). */
export function computeStartByAuto(
  task: Pick<Task, "deadline" | "deadline_confirmed" | "estimate_min">,
  settings: Settings,
): string | null {
  if (!task.deadline) return null;
  const workDays = Math.ceil((task.estimate_min ?? 60) / settings.focus_cap_min);
  const buffer = task.deadline_confirmed ? 1 : 2;
  return addWorkingDays(task.deadline, -(workDays + buffer), settings.work_days);
}

export function effectiveStartBy(task: Pick<Task, "start_by_manual" | "start_by_auto">): {
  date: string | null;
  auto: boolean;
} {
  if (task.start_by_manual) return { date: task.start_by_manual, auto: false };
  return { date: task.start_by_auto, auto: task.start_by_auto !== null };
}
