"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { store, useOtto } from "@/lib/store";
import { buildSchedule } from "@/engine/schedule";
import { estimateLabel } from "@/engine/format";
import { addMinutes, hm, hmString, isWorkingDay, localMinutes, parseDate, zonedInstant } from "@/engine/time";
import type { Project, ScheduleBlock, Task } from "@/engine/types";
import { useEnergy } from "../usePulse";
import { IconLock, IconPin } from "../Icons";
import { Card, CountPill, ProjectDot, cx } from "../ui";
import { DayMarks } from "./MonthGrid";
import { WEEKDAYS, dropTarget, hourRange, spanOf, type DayItems, type Span } from "./model";

const HOUR_PX = 48;
const PX = HOUR_PX / 60; // per minute, so 15 minutes is 12px
const COLS = "grid-cols-[44px_repeat(7,minmax(0,1fr))]";

interface Item extends Span {
  key: string;
  kind: "block" | "timed" | "busy";
  title: string;
  taskId?: string;
  block?: ScheduleBlock;
  project?: Project | null;
  forced?: boolean;
  pinned?: boolean;
  done?: boolean;
  past: boolean;
  dur: number; // real length in minutes, even when the span is clipped at midnight
}

interface Ghost {
  day: number;
  min: number;
  dur: number;
  key?: string;
}

interface Drag {
  item: Item;
  from: { day: number; min: number; dur: number };
  x0: number;
  y0: number;
  colW: number;
  ready: boolean; // touch waits for a short hold so the page can still scroll
  active: boolean;
  timer: number;
}

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

export function WeekTimeline({
  days,
  selected,
  today,
  index,
  showList,
  onSelectDay,
  onOpenTask,
}: {
  days: string[];
  selected: string;
  today: string;
  index: Map<string, DayItems>;
  showList: boolean;
  onSelectDay: (day: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const tasks = useOtto((s) => s.tasks);
  const blocks = useOtto((s) => s.blocks);
  const busy = useOtto((s) => s.busy);
  const settings = useOtto((s) => s.settings);
  const now = useOtto((s) => s.now);
  const energy = useEnergy();
  const tz = settings.timezone;

  const items = useMemo(() => {
    const inWeek = new Set(days);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const out: Item[] = [];
    const push = (start: string, end: string, rest: Omit<Item, keyof Span | "past" | "dur">) => {
      const span = spanOf(start, end, tz);
      if (inWeek.has(span.day)) out.push({ ...span, ...rest, dur: minutesBetween(start, end), past: Date.parse(end) <= now });
    };
    for (const b of busy) push(b.start_at, b.end_at, { key: `busy-${b.id}`, kind: "busy", title: b.title });
    for (const t of tasks) {
      if (!t.scheduled_at || t.status === "dropped") continue;
      const end = addMinutes(t.scheduled_at, t.estimate_min ?? 30).toISOString();
      push(t.scheduled_at, end, { key: `at-${t.id}`, kind: "timed", title: t.title, taskId: t.id, project: t.project, done: t.status === "done" });
    }
    for (const b of blocks) {
      const t = byId.get(b.task_id);
      if (!t || t.status === "dropped") continue;
      push(b.start_at, b.end_at, {
        key: b.id,
        kind: "block",
        title: t.title,
        taskId: t.id,
        block: b,
        project: t.project,
        forced: b.source === "force",
        pinned: b.pinned,
        done: t.status === "done",
      });
    }
    return out;
  }, [days, tasks, blocks, busy, tz, now]);

  const range = useMemo(() => hourRange(settings.work_start, settings.work_end, items), [settings.work_start, settings.work_end, items]);
  const height = (range[1] - range[0]) * PX;

  const warnings = useMemo(() => {
    const { warnings } = buildSchedule({ tasks, blocks, busy, settings, now: new Date(now), energyToday: energy.level });
    return new Map(warnings.map((w) => [w.day, w.message]));
  }, [tasks, blocks, busy, settings, now, energy.level]);
  const anyWarning = days.some((d) => warnings.has(d));

  const unscheduled = useMemo(() => {
    const future = new Set(blocks.filter((b) => Date.parse(b.end_at) > now).map((b) => b.task_id));
    return tasks.filter((t) => t.status === "todo" && !t.scheduled_at && !future.has(t.id) && !t.id.startsWith("tmp-"));
  }, [tasks, blocks, now]);

  // ---------- dragging ----------
  const rootRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const listDrag = useRef<Task | null>(null);
  const justDragged = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const moveGhost = (g: Ghost) => setGhost((p) => (p && p.day === g.day && p.min === g.min && p.key === g.key ? p : g));

  // Once a touch drag has started, the page must not scroll under the finger.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (drag.current?.ready) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const placeAt = (day: number, min: number, dur: number): { start: string; end: string } | null => {
    const start = zonedInstant(days[day], hmString(min), tz);
    if (start.getTime() < now) {
      store.toast("That time has already passed. Pick a slot later today or another day.");
      return null;
    }
    return { start: start.toISOString(), end: addMinutes(start, dur).toISOString() };
  };

  const endDrag = () => {
    if (drag.current) clearTimeout(drag.current.timer);
    drag.current = null;
    setGhost(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, item: Item) => {
    if (e.button !== 0 || !colsRef.current) return;
    const from = { day: days.indexOf(item.day), min: item.start, dur: item.dur };
    const d: Drag = {
      item,
      from,
      x0: e.clientX,
      y0: e.clientY,
      colW: colsRef.current.getBoundingClientRect().width / 7,
      ready: e.pointerType !== "touch",
      active: false,
      timer: 0,
    };
    if (!d.ready) {
      d.timer = window.setTimeout(() => {
        d.ready = d.active = true;
        moveGhost({ ...from, key: item.key });
      }, 280);
    }
    drag.current = d;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.ready) {
      if (Math.hypot(dx, dy) > 8) endDrag();
      return;
    }
    if (!d.active && Math.hypot(dx, dy) < 4) return;
    d.active = true;
    moveGhost({ ...dropTarget(d.from, dx, dy, d.colW, PX, range), dur: d.from.dur, key: d.item.key });
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    endDrag();
    if (!d?.active) return;
    // The click that follows this pointerup must not open the task; clear the flag right after it.
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const t = dropTarget(d.from, e.clientX - d.x0, e.clientY - d.y0, d.colW, PX, range);
    if (t.day === d.from.day && t.min === d.from.min) return;
    const at = placeAt(t.day, t.min, d.from.dur);
    if (at && d.item.block) void store.pinBlock(d.item.block.id, at.start, at.end);
  };

  const listTarget = (e: DragEvent<HTMLDivElement>, day: number, task: Task) => {
    const dur = task.estimate_min ?? 60;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return { ...dropTarget({ day, min: range[0], dur }, 0, y, 1, PX, range), dur };
  };

  const nowMin = localMinutes(now, tz);
  const todayIdx = days.indexOf(today);
  const workStart = hm(settings.work_start);
  const workEnd = hm(settings.work_end);
  const hours: number[] = [];
  for (let m = range[0]; m < range[1]; m += 60) hours.push(m);

  return (
    <div ref={rootRef} className="md:flex md:items-start md:gap-4">
      {showList && <Unscheduled tasks={unscheduled} listDrag={listDrag} onOpenTask={onOpenTask} onDragEnd={() => setGhost(null)} />}
      <div className="min-w-0 flex-1 overflow-x-auto rounded-[18px] border border-line bg-panel shadow-[var(--shadow-card)]">
        <div className="min-w-[600px]">
          {anyWarning && (
            <div className={cx("grid", COLS)}>
              <span />
              {days.map((d) => {
                const msg = warnings.get(d);
                return (
                  <p key={d} className="line-clamp-2 min-h-8 px-1.5 pt-2 text-[11px] leading-tight text-late" title={msg}>
                    {msg}
                  </p>
                );
              })}
            </div>
          )}
          <div className={cx("grid border-b border-line", COLS)}>
            <span />
            {days.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => onSelectDay(d)}
                aria-pressed={d === selected}
                aria-label={`${WEEKDAYS[i]} ${parseDate(d).d}${d === today ? ", today" : ""}`}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 border-l border-line py-1.5 transition-[background-color] duration-150",
                  d === selected ? "bg-accent-soft" : "hoverable",
                )}
              >
                <span className={cx("text-[12px]", d === today ? "font-semibold text-ink" : "text-muted")}>{WEEKDAYS[i]}</span>
                <span className={cx("num text-[16px] leading-5", d === today && "font-semibold text-ink")}>{parseDate(d).d}</span>
                <DayMarks items={index.get(d)} />
              </button>
            ))}
          </div>
          <div className={cx("grid", COLS)}>
            <div className="relative" style={{ height }} aria-hidden="true">
              {hours.map((m) => (
                <span key={m} className="num absolute right-1.5 text-[11px] text-muted" style={{ top: (m - range[0]) * PX + 2 }}>
                  {hmString(m)}
                </span>
              ))}
            </div>
            <div ref={colsRef} className="col-span-7 grid grid-cols-7">
              {days.map((d, i) => {
                const working = isWorkingDay(d, settings.work_days);
                return (
                  <div
                    key={d}
                    className="relative border-l border-line"
                    style={{
                      height,
                      backgroundImage:
                        "linear-gradient(to bottom, var(--line) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--line) 40%, transparent) 1px, transparent 1px)",
                      backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 4}px`,
                    }}
                    onDragOver={(e) => {
                      const task = listDrag.current;
                      if (!task) return;
                      e.preventDefault();
                      moveGhost(listTarget(e, i, task));
                    }}
                    onDrop={(e) => {
                      const task = listDrag.current;
                      listDrag.current = null;
                      setGhost(null);
                      if (!task) return;
                      e.preventDefault();
                      const t = listTarget(e, i, task);
                      const at = placeAt(t.day, t.min, t.dur);
                      if (at) void store.addBlock(task.id, at.start, at.end);
                    }}
                  >
                    {/* Off hours and days off read as quieter paper. */}
                    {working ? (
                      <>
                        <OffHours top={0} bottom={(workStart - range[0]) * PX} />
                        <OffHours top={(workEnd - range[0]) * PX} bottom={height} />
                      </>
                    ) : (
                      <OffHours top={0} bottom={height} />
                    )}
                    {items
                      .filter((it) => it.day === d)
                      .map((it) => (
                        <TimelineItem
                          key={it.key}
                          item={it}
                          top={(it.start - range[0]) * PX}
                          dragging={ghost?.key === it.key}
                          onPointerDown={onPointerDown}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={endDrag}
                          onClick={() => {
                            if (!justDragged.current && it.taskId) onOpenTask(it.taskId);
                          }}
                        />
                      ))}
                    {ghost?.day === i && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0.5 z-30 rounded-[8px] border-[1.5px] border-dashed border-accent bg-accent-soft px-1.5 py-0.5 shadow-[var(--shadow-card)]"
                        style={{ top: (ghost.min - range[0]) * PX, height: Math.max(ghost.dur * PX - 2, 14) }}
                      >
                        <span className="num text-[11px] font-medium text-accent">{hmString(ghost.min)}</span>
                      </div>
                    )}
                    {i === todayIdx && nowMin >= range[0] && nowMin <= range[1] && (
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-40 h-[2px] bg-accent" style={{ top: (nowMin - range[0]) * PX - 1 }}>
                        <span className="absolute -top-[3px] -left-[4px] size-2 rounded-full bg-accent" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OffHours({ top, bottom }: { top: number; bottom: number }) {
  if (bottom <= top) return null;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bg-[color-mix(in_oklab,var(--panel-2)_70%,transparent)]" style={{ top, height: bottom - top }} />;
}

function TimelineItem({
  item: it,
  top,
  dragging,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: Item;
  top: number;
  dragging: boolean;
  onClick: () => void;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>, item: Item) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
}) {
  const h = Math.max((it.end - it.start) * PX - 2, 14);
  const end = it.kind === "timed" ? null : hmString(it.start + it.dur);
  const time = end ? `${hmString(it.start)} to ${end}` : hmString(it.start);
  const style = { top: top + 1, height: h };

  if (it.kind === "busy") {
    return (
      <div
        title={`${it.title}, busy ${time}`}
        className="absolute inset-x-0.5 z-0 overflow-hidden rounded-[8px] border border-line px-1.5 py-0.5 text-[11px] leading-tight text-muted"
        style={{ ...style, backgroundImage: "repeating-linear-gradient(135deg, var(--panel-2) 0 5px, transparent 5px 10px)", backgroundColor: "var(--bg)" }}
      >
        <span className="line-clamp-2">{it.title}</span>
      </div>
    );
  }

  const movable = it.kind === "block" && !it.forced && !it.past && !it.done;
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={movable ? (e) => onPointerDown(e, it) : undefined}
      onPointerMove={movable ? onPointerMove : undefined}
      onPointerUp={movable ? onPointerUp : undefined}
      onPointerCancel={movable ? onPointerCancel : undefined}
      onContextMenu={movable ? (e) => e.preventDefault() : undefined}
      title={`${it.title}, ${it.kind === "timed" ? "at" : "planned"} ${time}${movable ? ". Drag to move it." : ""}`}
      className={cx(
        "@container absolute inset-x-0.5 flex flex-col overflow-hidden rounded-[8px] border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight select-none [-webkit-touch-callout:none]",
        it.kind === "timed" ? "z-10 border-ok bg-accent-soft" : "z-20 border-sun bg-sun-soft",
        movable && "cursor-grab active:cursor-grabbing",
        (it.past || it.done) && "opacity-55",
        dragging && "opacity-35",
      )}
      style={style}
    >
      <span className="flex min-w-0 items-start gap-1">
        <span className={cx("min-w-0 flex-1 font-medium text-ink", h < 30 ? "truncate" : "line-clamp-2", it.done && "line-through")}>{it.title}</span>
        {it.forced && <IconLock size={12} className="mt-px shrink-0 text-fire-ink" aria-label="Locked in" />}
        {it.pinned && !it.forced && <IconPin size={12} className="mt-px shrink-0 text-muted" aria-label="Pinned" />}
      </span>
      {h >= 34 && (
        <span className="num mt-0.5 truncate text-[10px] text-muted">
          {hmString(it.start)}
          {end && <span className="hidden @[112px]:inline"> to {end}</span>}
        </span>
      )}
    </button>
  );
}

function Unscheduled({
  tasks,
  listDrag,
  onOpenTask,
  onDragEnd,
}: {
  tasks: Task[];
  listDrag: { current: Task | null };
  onOpenTask: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <Card as="div" className="mb-4 w-56 shrink-0 p-3 sm:p-3 md:mb-0" aria-label="Unscheduled tasks">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold">Unscheduled</h2>
        <CountPill n={tasks.length} />
      </div>
      {tasks.length ? (
        <>
          <p className="mt-1 px-1 text-[13px] leading-snug text-muted">Drag a task onto a time to plan it.</p>
          <ul className="mt-2 space-y-0.5">
            {tasks.map((t) => (
              <li key={t.id}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    listDrag.current = t;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.title);
                  }}
                  onDragEnd={() => {
                    listDrag.current = null;
                    onDragEnd();
                  }}
                  onClick={() => onOpenTask(t.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpenTask(t.id))}
                  className="flex min-h-11 cursor-grab items-center gap-2 rounded-[10px] px-2 text-[14px] hoverable active:cursor-grabbing"
                >
                  <ProjectDot project={t.project} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="num shrink-0 text-[12px] text-muted">{estimateLabel(t)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 px-1 text-[13px] leading-snug text-muted">Every open task has a slot. Tasks Otto can&apos;t fit yet show up here.</p>
      )}
    </Card>
  );
}

