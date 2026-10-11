// Fixed instants and task sets for the scheduler tests (spec section 19). Monday is 2026-10-12.

import { zonedInstant } from "../time";
import { DEFAULT_SETTINGS, makeTask, type ScheduleBlock, type Settings, type Task } from "../types";

export const WITA = "Asia/Makassar";
export const WIB = "Asia/Jakarta";
export const SETTINGS: Settings = DEFAULT_SETTINGS;

/** Instant for a local wall time in tz, e.g. at('2026-10-12', '08:30'). */
export const at = (date: string, time: string, tz = WITA) => zonedInstant(date, time, tz);
export const iso = (date: string, time: string, tz = WITA) => at(date, time, tz).toISOString();

/** Mon 00:30 WITA, Sun 23:30 WIB. */
export const MIDNIGHT_NOW = new Date("2026-10-11T16:30:00Z");
export const MON = "2026-10-12";
export const TUE = "2026-10-13";
export const WED = "2026-10-14";
export const THU = "2026-10-15";
export const FRI = "2026-10-16";
export const SAT = "2026-10-17";
export const SUN = "2026-10-18";

export const block = (
  task_id: string,
  start: string,
  end: string,
  extra: Partial<ScheduleBlock> = {},
): ScheduleBlock => ({
  id: `b-${task_id}-${start}`,
  task_id,
  start_at: start,
  end_at: end,
  pinned: false,
  source: "auto",
  ...extra,
});

export const followUp = makeTask({
  id: "arief",
  title: "Follow up Pak Arief on Sultan down payment",
  project: "omnisync",
  priority: 1,
  estimate_min: 30,
});
export const sultan = makeTask({
  id: "sultan",
  title: "Sultan agreement",
  project: "omnisync",
  priority: 1,
  estimate_min: 60,
  depends_on: ["arief"],
});
export const navaho = makeTask({
  id: "navaho",
  title: "Navaho payments",
  project: "omnisync",
  priority: 1,
  estimate_min: 45,
});

/** Six 4h tasks due Thursday: Mon to Thu holds 20h of focus, so the last one spills past the deadline. */
export const overloadedWeek: Task[] = [0, 1, 2, 3, 4, 5].map((i) =>
  makeTask({
    id: `big-${i}`,
    title: `Big job ${i}`,
    priority: i < 3 ? 0 : 2,
    estimate_min: 240,
    deadline: THU,
    deadline_confirmed: true,
  }),
);

/** Enough small tasks to fill every open slot, used to probe quiet hours and caps. */
export const filler = (n: number, estimate = 60): Task[] =>
  Array.from({ length: n }, (_, i) =>
    makeTask({
      id: `fill-${String(i).padStart(3, "0")}`,
      title: `Filler ${i}`,
      priority: i % 5,
      estimate_min: estimate,
    }),
  );
