// Scheduler (spec section 8). Pure: every local time is read through settings.timezone.

import { durationLabel } from "./format";
import {
  addDays,
  hm,
  inWindow,
  isoWeekday,
  isWorkingDay,
  localDate,
  localTime,
  startOfLocalDay,
  zonedInstant,
} from "./time";
import type { BusyBlock, EnergyLevel, ScheduleBlock, Settings, Task } from "./types";

export interface ScheduleInput {
  tasks: Task[];
  blocks: ScheduleBlock[];
  busy: BusyBlock[];
  settings: Settings;
  now: Date;
  energyToday?: EnergyLevel | null;
  horizonDays?: number;
  scoreOf?: (task: Task) => number;
}
export interface ScheduleWarning {
  day: string;
  plannedMin: number;
  freeMin: number;
  taskIds: string[];
  message: string;
}
export interface BlockMove {
  taskId: string;
  from: string | null;
  to: string | null;
}
export interface ScheduleResult {
  blocks: ScheduleBlock[];
  warnings: ScheduleWarning[];
  moved: BlockMove[];
  unplaced: string[];
}

const MIN = 60000;
const SLOT = 15 * MIN;
const HOUR = 60 * MIN;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PRIORITY_POINTS = [50, 40, 25, 15, 5];

interface Slot {
  t: number;
  day: string;
  high: boolean;
  blocked: boolean; // busy or timed item
  taken: boolean; // past, or a block sits here
}

const ms = (iso: string) => Date.parse(iso);
const minutesOf = (b: ScheduleBlock) => (ms(b.end_at) - ms(b.start_at)) / MIN;
const isOpen = (t: Task) => t.status === "todo" || t.status === "waiting";
const durationOf = (t: Task) => t.estimate_min ?? 60;
const timedRange = (t: Task): [number, number] => {
  const s = ms(t.scheduled_at as string);
  return [s, s + (t.estimate_min ?? 30) * MIN];
};
// Intl is the slow part, and sort comparators ask for the same midnights over and over.
const midnights = new Map<string, number>();
const midnight = (date: string, tz: string) => {
  const key = tz + date;
  let v = midnights.get(key);
  if (v === undefined) midnights.set(key, (v = startOfLocalDay(date, tz).getTime()));
  return v;
};
const dayEndMs = (date: string, tz: string) => midnight(addDays(date, 1), tz);
const deadlineEnd = (t: Task, tz: string) => (t.deadline ? dayEndMs(t.deadline, tz) : null);
const roundUp = (now: Date) => Math.ceil(now.getTime() / SLOT) * SLOT;

/** Score used when the caller passes no scoreOf: priority points plus the overdue bump. */
export function fallbackScore(task: Task, now: Date, tz: string): number {
  const p = task.priority == null ? 20 : (PRIORITY_POINTS[task.priority] ?? 20);
  return p + (task.deadline && dayEndMs(task.deadline, tz) <= now.getTime() ? 45 : 0);
}

/** Indexes of the slots that overlap [a, b), found by binary search. */
function overlapping(slots: Slot[], a: number, b: number): number[] {
  let lo = 0;
  let hi = slots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid].t + SLOT > a) hi = mid;
    else lo = mid + 1;
  }
  const out: number[] = [];
  for (let i = lo; i < slots.length && slots[i].t < b; i++) out.push(i);
  return out;
}

// ponytail: wall-clock slots from work_start assume no DST jump inside the work window and work_end > work_start
type GridInput = Pick<ScheduleInput, "tasks" | "busy" | "settings" | "now" | "energyToday" | "horizonDays">;

function buildGrid(input: GridInput): Slot[] {
  const { settings: s, now } = input;
  const tz = s.timezone;
  const nowMs = now.getTime();
  const nowR = roundUp(now);
  const horizonEnd = nowMs + (input.horizonDays ?? 14) * 24 * HOUR;
  const highUntil = input.energyToday === "high" ? nowMs + 3 * HOUR : 0;
  const startMin = hm(s.work_start);
  const endMin = hm(s.work_end);
  const lastDay = localDate(horizonEnd, tz);
  const slots: Slot[] = [];
  for (let d = localDate(now, tz); d <= lastDay; d = addDays(d, 1)) {
    if (!isWorkingDay(d, s.work_days)) continue;
    const base = zonedInstant(d, s.work_start, tz).getTime();
    for (let m = startMin; m + 15 <= endMin; m += 15) {
      const t = base + (m - startMin) * MIN;
      if (t >= horizonEnd || inWindow(m, s.quiet_start, s.quiet_end)) continue;
      const high = s.energy_windows.some((w) => inWindow(m, w.start, w.end)) || (t >= nowMs && t < highUntil);
      slots.push({ t, day: d, high, blocked: false, taken: t < nowR });
    }
  }
  const fixed: [number, number][] = input.busy.map((b) => [ms(b.start_at), ms(b.end_at)]);
  for (const t of input.tasks) if (t.scheduled_at && isOpen(t)) fixed.push(timedRange(t));
  for (const [a, b] of fixed) for (const i of overlapping(slots, a, b)) slots[i].blocked = true;
  return slots;
}

const free = (s: Slot) => !s.blocked && !s.taken;

/** Earliest index where `minutes` fit contiguously, ending by `until`, passing ok() and the daily cap. */
function findRun(
  slots: Slot[],
  minutes: number,
  until: number,
  ok: (i: number) => boolean,
  capLeft: (day: string) => number,
): number {
  const n = Math.ceil(minutes / 15);
  outer: for (let i = 0; i + n <= slots.length; i++) {
    const s = slots[i];
    if (s.t + minutes * MIN > until) break;
    if (!ok(i) || capLeft(s.day) < minutes) continue;
    for (let j = 0; j < n; j++) {
      const x = slots[i + j];
      if (!free(x) || x.t !== s.t + j * SLOT) continue outer;
    }
    return i;
  }
  return -1;
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { tasks, settings: s, now } = input;
  const tz = s.timezone;
  const nowMs = now.getTime();
  const nowR = roundUp(now);
  const horizonEnd = nowMs + (input.horizonDays ?? 14) * 24 * HOUR;
  const lowUntil = input.energyToday === "low" ? nowMs + 2 * HOUR : 0;
  const highUntil = input.energyToday === "high" ? nowMs + 3 * HOUR : 0;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const scoreOf = input.scoreOf ?? ((t: Task) => fallbackScore(t, now, tz));
  const scores = new Map<string, number>();
  const score = (t: Task) => {
    if (!scores.has(t.id)) scores.set(t.id, scoreOf(t));
    return scores.get(t.id) as number;
  };
  const slots = buildGrid(input);

  const capUsed = new Map<string, number>();
  const capLeft = (day: string) => s.focus_cap_min - (capUsed.get(day) ?? 0);
  const lastEnd = new Map<string, number>(); // last non-past block end per task, for dependents
  const covered = new Map<string, number>(); // minutes of kept pinned or running blocks per task
  const out: ScheduleBlock[] = [];
  const dayOf = new Map<ScheduleBlock, string>();
  const occupy = (b: ScheduleBlock) => {
    const end = ms(b.end_at);
    const run = overlapping(slots, ms(b.start_at), end);
    const day = run.length ? slots[run[0]].day : localDate(b.start_at, tz);
    out.push(b);
    dayOf.set(b, day);
    for (const i of run) slots[i].taken = true;
    capUsed.set(day, (capUsed.get(day) ?? 0) + minutesOf(b));
    if (end > nowMs) lastEnd.set(b.task_id, Math.max(lastEnd.get(b.task_id) ?? 0, end));
  };

  // 1. Keep past, pinned and running blocks; collect future auto blocks as candidates.
  const sorted = [...input.blocks].sort((a, b) => ms(a.start_at) - ms(b.start_at) || a.id.localeCompare(b.id));
  const candidates = new Map<string, ScheduleBlock[]>();
  for (const b of sorted) {
    const task = byId.get(b.task_id);
    if (ms(b.end_at) <= nowMs) {
      occupy(b);
    } else if (b.pinned || (task?.status === "todo" && !task.scheduled_at && ms(b.start_at) < nowMs)) {
      occupy(b);
      covered.set(b.task_id, (covered.get(b.task_id) ?? 0) + minutesOf(b));
    } else if (task?.status === "todo" && !task.scheduled_at) {
      candidates.set(b.task_id, [...(candidates.get(b.task_id) ?? []), b]);
    }
  }
  const needOf = (t: Task) => durationOf(t) - (covered.get(t.id) ?? 0);
  const planStart = (t: Task) => (t.plan_for ? midnight(t.plan_for, tz) : 0);
  const energyOk = (t: Task, start: number) =>
    t.energy !== "high" || !(start < lowUntil || (highUntil && start >= highUntil));

  // Stability rule: a candidate set survives only if every block still fits where it is.
  const claimed = new Set<number>();
  const tentativeCap = new Map<string, number>();
  const valid = new Map<string, ScheduleBlock[]>();
  for (const [id, list] of candidates) {
    const task = byId.get(id) as Task;
    const dl = deadlineEnd(task, tz);
    const from = Math.max(nowR, planStart(task));
    if (list.reduce((a, b) => a + minutesOf(b), 0) !== needOf(task)) continue;
    const idx: number[] = [];
    const capAdd = new Map<string, number>();
    const fits = list.every((b) => {
      const a = ms(b.start_at);
      const e = ms(b.end_at);
      const run = overlapping(slots, a, e);
      if (run.length !== Math.ceil((e - a) / SLOT) || slots[run[0]].t !== a) return false;
      if (a < from || (dl !== null && dl > nowMs && e > dl) || !energyOk(task, a)) return false;
      const day = slots[run[0]].day;
      capAdd.set(day, (capAdd.get(day) ?? 0) + minutesOf(b));
      idx.push(...run);
      return run.every((i) => free(slots[i]) && !claimed.has(i));
    });
    const capOk = [...capAdd].every(([d, m]) => (tentativeCap.get(d) ?? 0) + m <= capLeft(d));
    if (!fits || !capOk) continue;
    for (const i of idx) claimed.add(i);
    for (const [d, m] of capAdd) tentativeCap.set(d, (tentativeCap.get(d) ?? 0) + m);
    valid.set(id, list);
  }

  const openDeps = (t: Task) =>
    t.depends_on.map((d) => byId.get(d)).filter((d): d is Task => !!d && d.id !== t.id && isOpen(d));
  const isPlaceable = (t: Task) => t.status === "todo" && !t.scheduled_at;
  const depEnd = (d: Task): number | null => {
    if (d.scheduled_at) return timedRange(d)[1];
    const ends = [lastEnd.get(d.id) ?? 0, ...(valid.get(d.id) ?? []).map((b) => ms(b.end_at))];
    const e = Math.max(...ends);
    return e > 0 ? e : null;
  };
  // Moving one task moves its dependents: drop kept blocks whose dependency is re-placed or now ends later.
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, list] of valid) {
      const first = ms(list[0].start_at);
      const bad = openDeps(byId.get(id) as Task).some((d) => {
        if (isPlaceable(d) && !valid.has(d.id) && needOf(d) > 0) return true;
        const e = depEnd(d);
        return e === null || first < e;
      });
      if (bad) {
        valid.delete(id);
        changed = true;
      }
    }
  }
  for (const list of valid.values()) for (const b of list) occupy(b);

  // 2. Place the rest: forced, then latest feasible start, then score.
  const latest = (t: Task) => {
    const dl = deadlineEnd(t, tz);
    return dl === null ? Infinity : dl - needOf(t) * MIN;
  };
  const pending = tasks
    .filter((t) => isPlaceable(t) && !valid.has(t.id) && needOf(t) > 0 && planStart(t) < horizonEnd)
    .sort(
      (a, b) =>
        Number(b.forced) - Number(a.forced) || latest(a) - latest(b) || score(b) - score(a) || a.id.localeCompare(b.id),
    );
  const pendingIds = new Set(pending.map((t) => t.id));
  const unplaced: string[] = [];
  const want = new Map<string, { min: number; ids: string[] }>(); // demand that missed its deadline, per warning day
  const today = localDate(now, tz);
  const lastGridDay = slots.length ? slots[slots.length - 1].day : today;

  while (pending.length) {
    const k = pending.findIndex((t) => openDeps(t).every((d) => !pendingIds.has(d.id)));
    if (k < 0) {
      unplaced.push(...pending.map((t) => t.id)); // dependency cycle
      break;
    }
    const [task] = pending.splice(k, 1);
    pendingIds.delete(task.id);
    const need = needOf(task);
    let from = Math.max(nowR, planStart(task));
    let depMissing = false;
    for (const d of openDeps(task)) {
      const e = depEnd(d);
      if (e === null) depMissing = true;
      else from = Math.max(from, e);
    }
    const dl = deadlineEnd(task, tz);
    const runs = depMissing ? null : placeTask(task, need, from, dl);
    if (!depMissing && dl !== null && dl > nowR && (!runs || runs.late)) {
      let day = task.deadline as string;
      for (let i = 0; i < 7 && !isWorkingDay(day, s.work_days); i++) day = addDays(day, -1);
      if (day >= today && day <= lastGridDay) {
        const w = want.get(day) ?? { min: 0, ids: [] };
        w.min += need;
        w.ids.push(task.id);
        want.set(day, w);
      }
    }
    if (!runs) {
      unplaced.push(task.id);
      continue;
    }
    const old = candidates.get(task.id) ?? [];
    for (const [i, mins] of runs.chunks) {
      const start = slots[i].t;
      const end = start + mins * MIN;
      const reuse = !task.forced && old.find((b) => ms(b.start_at) === start && ms(b.end_at) === end);
      occupy(
        reuse || {
          id: crypto.randomUUID(),
          task_id: task.id,
          start_at: new Date(start).toISOString(),
          end_at: new Date(end).toISOString(),
          pinned: task.forced,
          source: task.forced ? "force" : "auto",
        },
      );
    }
  }

  function placeTask(task: Task, need: number, from: number, dl: number | null) {
    const pref = task.forced || task.energy === "high" ? "high" : task.energy === "low" ? "low" : null;
    const startOk = (i: number) => slots[i].t >= from && !(task.energy === "high" && slots[i].t < lowUntil);
    const prefOk = (i: number) =>
      pref === "high" ? slots[i].high : !slots.slice(i, i + Math.ceil(need / 15)).some((x) => x.high);
    const limits = dl !== null && dl > nowR ? [dl, Infinity] : [Infinity];
    for (const until of limits) {
      const late = until === Infinity && dl !== null && dl > nowR;
      for (const usePref of pref ? [true, false] : [false]) {
        const i = findRun(slots, need, until, (j) => startOk(j) && (!usePref || prefOk(j)), capLeft);
        if (i >= 0) return { chunks: [[i, need]] as [number, number][], late };
      }
      const chunks = split(need, until, startOk);
      if (chunks) return { chunks, late };
    }
    return null;
  }

  // Too long for any gap: greedy chunks of 30+ minutes in the earliest gaps, last chunk takes the remainder.
  function split(need: number, until: number, startOk: (i: number) => boolean): [number, number][] | null {
    const chunks: [number, number][] = [];
    const extra = new Map<string, number>();
    let rem = need;
    for (let i = 0; i < slots.length && rem > 0;) {
      const st = slots[i];
      if (!free(st) || !startOk(i)) {
        i++;
        continue;
      }
      let len = 1;
      while (i + len < slots.length && free(slots[i + len]) && slots[i + len].t === st.t + len * SLOT) len++;
      const room = Math.min(
        len * 15,
        capLeft(st.day) - (extra.get(st.day) ?? 0),
        Math.floor((until - st.t) / SLOT) * 15,
      );
      let mins = rem <= room ? rem : room - (room % 15);
      if (rem - mins > 0 && rem - mins < 30) mins = rem - 30;
      if (mins >= 30) {
        chunks.push([i, mins]);
        extra.set(st.day, (extra.get(st.day) ?? 0) + mins);
        rem -= mins;
      }
      i += len;
    }
    return rem === 0 ? chunks : null;
  }

  out.sort((a, b) => ms(a.start_at) - ms(b.start_at) || a.task_id.localeCompare(b.task_id));
  return { blocks: out, warnings: warningsFor(), moved: diffMoves(input.blocks, out, nowMs), unplaced };

  // 5. One merged warning per overloaded day.
  function warningsFor(): ScheduleWarning[] {
    return [...want.keys()].sort().map((day) => {
      const w = want.get(day) as { min: number; ids: string[] };
      const onDay = out.filter((b) => dayOf.get(b) === day);
      const timedMin = tasks
        .filter((t) => t.scheduled_at && isOpen(t) && localDate(t.scheduled_at, tz) === day)
        .reduce((a, t) => a + (t.estimate_min ?? 30), 0);
      const plannedMin = onDay.reduce((a, b) => a + minutesOf(b), 0) + timedMin + w.min;
      const windowMin = slots.filter((x) => x.day === day && !x.blocked).length * 15;
      const freeMin = Math.min(s.focus_cap_min, windowMin);
      const movable = new Map<string, number>();
      for (const b of onDay) if (!b.pinned) movable.set(b.task_id, (movable.get(b.task_id) ?? 0) + minutesOf(b));
      for (const id of w.ids) movable.set(id, (movable.get(id) ?? 0) + needOf(byId.get(id) as Task));
      const order = [...movable].sort(([a], [b]) => {
        const ta = byId.get(a);
        const tb = byId.get(b);
        return (ta ? score(ta) : 0) - (tb ? score(tb) : 0) || a.localeCompare(b);
      });
      let over = plannedMin - freeMin;
      let moves = 0;
      for (const [, m] of order) {
        if (over <= 0) break;
        over -= m;
        moves++;
      }
      moves = Math.max(1, moves);
      const message =
        `${DAY_NAMES[isoWeekday(day) - 1]} is overloaded: ${durationLabel(plannedMin)} planned, ` +
        `${durationLabel(freeMin)} free. Move ${moves} ${moves === 1 ? "task" : "tasks"} or drop 1.`;
      return { day, plannedMin, freeMin, taskIds: w.ids, message };
    });
  }
}

/** First non-past block start per task, before vs after. */
function diffMoves(before: ScheduleBlock[], after: ScheduleBlock[], nowMs: number): BlockMove[] {
  const firstOf = (blocks: ScheduleBlock[]) => {
    const m = new Map<string, string>();
    for (const b of blocks) {
      if (ms(b.end_at) <= nowMs) continue;
      const cur = m.get(b.task_id);
      if (!cur || ms(b.start_at) < ms(cur)) m.set(b.task_id, b.start_at);
    }
    return m;
  };
  const a = firstOf(before);
  const b = firstOf(after);
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  return ids
    .filter((id) => (a.has(id) ? ms(a.get(id) as string) : null) !== (b.has(id) ? ms(b.get(id) as string) : null))
    .map((id) => ({ taskId: id, from: a.get(id) ?? null, to: b.get(id) ?? null }));
}

/** Otto-voice toast for a re-plan, or null when nothing the user cares about moved. */
export function knockOnMessage(moved: BlockMove[], tasks: Task[], tz: string, causeTaskId?: string): string | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Removals for done, dropped or waiting tasks are expected, so they never toast.
  const relevant = moved.filter((m) => byId.get(m.taskId)?.status === "todo");
  if (!relevant.length) return null;
  const others = relevant.filter((m) => m.taskId !== causeTaskId);
  const cause = causeTaskId ? byId.get(causeTaskId) : undefined;
  if (cause && others.length) {
    return `Moved ${others.length} ${others.length === 1 ? "task" : "tasks"} after ${cause.title}.`;
  }
  if (relevant.length > 1) return `Moved ${relevant.length} tasks.`;
  const m = relevant[0];
  const title = (byId.get(m.taskId) as Task).title;
  if (!m.to) return `No free slot for ${title} yet.`;
  const day = DAY_NAMES[isoWeekday(localDate(m.to, tz)) - 1].slice(0, 3);
  return `Moved ${title} to ${day} ${localTime(m.to, tz)}.`;
}

/** Next free run of durationMin from now, for "Later today". Ignores the focus cap: the user asked for it. */
export function nextFreeSlot(
  input: GridInput & Pick<ScheduleInput, "blocks">,
  durationMin: number,
  opts: { highEnergy: boolean },
): { start_at: string; end_at: string } | null {
  const slots = buildGrid(input);
  for (const b of input.blocks) for (const i of overlapping(slots, ms(b.start_at), ms(b.end_at))) slots[i].taken = true;
  const passes = opts.highEnergy ? [(i: number) => slots[i].high, () => true] : [() => true];
  for (const ok of passes) {
    const i = findRun(slots, durationMin, Infinity, ok, () => Infinity);
    if (i >= 0) {
      const t = slots[i].t;
      return { start_at: new Date(t).toISOString(), end_at: new Date(t + durationMin * MIN).toISOString() };
    }
  }
  return null;
}

/** Blocks that start on a local day, in time order. */
export function blocksForDay(blocks: ScheduleBlock[], day: string, tz: string): ScheduleBlock[] {
  return blocks.filter((b) => localDate(b.start_at, tz) === day).sort((a, b) => ms(a.start_at) - ms(b.start_at));
}
