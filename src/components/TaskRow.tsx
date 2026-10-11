"use client";

import { useRef } from "react";
import { store, useOtto } from "@/lib/store";
import { completeWithReward, postpone } from "@/lib/actions";
import { dueLabel, estimateLabel, relativeDayInline, relativeDayLabel } from "@/engine/format";
import { localDate, localTime } from "@/engine/time";
import { formatIdrShort } from "@/engine/money";
import { describeRrule } from "@/engine/repeat";
import type { Task } from "@/engine/types";
import { IconCheck } from "./Icons";
import { cx, ProjectDot } from "./ui";
import { useLongPress, useSwipe } from "./useGestures";
import { FromClaude } from "./today/NextCard";

export function useIsDesktop() {
  // Matches the md breakpoint; read at event time so it never causes a hydration mismatch.
  return () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

export function openTask(id: string, isDesktop: () => boolean) {
  if (isDesktop() && !window.location.pathname.startsWith("/t/") && window.location.pathname !== "/") store.set({ selectedId: id });
  else store.openSheet({ kind: "edit", taskId: id });
}

export function TaskMeta({ task, time, extra }: { task: Task; time?: string | null; extra?: React.ReactNode }) {
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const today = localDate(now, tz);
  const bits: React.ReactNode[] = [];
  if (time) bits.push(<span key="time" className="num">{time}</span>);
  else if (task.scheduled_at) {
    const d = localDate(task.scheduled_at, tz);
    bits.push(
      <span key="at" className="num">
        {d === today ? "" : `${relativeDayLabel(d, today)} `}
        {localTime(task.scheduled_at, tz)}
      </span>,
    );
  }
  if (task.deadline && task.status !== "done") {
    const late = task.deadline < today;
    bits.push(
      <span key="due" className={late ? "text-late" : undefined}>
        {dueLabel(task.deadline, today, task.deadline_confirmed)}
      </span>,
    );
  }
  if (task.status === "waiting" && task.follow_up) {
    bits.push(<span key="fu">back {relativeDayInline(task.follow_up, today)}</span>);
  }
  if (task.ready_by) bits.push(<span key="ready">ready {relativeDayInline(task.ready_by, today)}</span>);
  if (task.estimate_min) bits.push(<span key="est">{estimateLabel(task)}</span>);
  if (task.value_idr) bits.push(<span key="val" className="num">{formatIdrShort(task.value_idr)}</span>);
  if (task.rrule) bits.push(<span key="rr">{describeRrule(task.rrule)}</span>);
  if (task.waiting_on) bits.push(<span key="wo">{task.waiting_on}</span>);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
      <ProjectDot project={task.project} />
      {bits.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          {b}
        </span>
      ))}
      {extra}
    </span>
  );
}

export function TaskRow({
  task,
  time,
  compact,
  showTomorrow = true,
  selected,
}: {
  task: Task;
  time?: string | null;
  compact?: boolean;
  showTomorrow?: boolean;
  selected?: boolean;
}) {
  const completing = useOtto((s) => Boolean(s.completing[task.id]));
  const keyboardSelected = useOtto((s) => s.selectedId === task.id);
  const tickRef = useRef<HTMLButtonElement>(null);
  const isDesktop = useIsDesktop();
  const done = task.status === "done";
  const canPostpone = task.status === "todo" && !task.forced;
  const swipe = useSwipe({
    onRight: done ? undefined : () => completeWithReward(task, tickRef.current),
    onLeft: canPostpone ? () => postpone(task, "tomorrow") : undefined,
  });
  const longPress = useLongPress(() => store.openSheet({ kind: "edit", taskId: task.id }));

  return (
    <li data-task-id={task.id} className={cx("relative list-none overflow-hidden rounded-[14px]", completing && "anim-out")}>
      {swipe.dx !== 0 && (
        <div
          aria-hidden="true"
          className={cx(
            "absolute inset-0 flex items-center px-5 text-[14px] font-medium",
            swipe.dx > 0 ? "justify-start bg-accent text-accent-ink" : "justify-end bg-sun-soft text-ink",
          )}
        >
          {swipe.dx > 0 ? "Done" : "Tomorrow"}
        </div>
      )}
      <div
        {...swipe.handlers}
        className={cx(
          "relative flex items-center gap-3 bg-panel touch-pan-y",
          compact ? "min-h-12 py-1.5" : "min-h-14 py-2",
          (selected || keyboardSelected) && "bg-accent-soft",
        )}
        style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined, transition: swipe.dx ? "none" : "transform 180ms ease" }}
      >
        <button
          ref={tickRef}
          type="button"
          aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          onClick={() => (done ? void store.updateTask(task.id, { status: "todo" }) : completeWithReward(task, tickRef.current))}
          className="grid size-11 shrink-0 place-items-center"
        >
          <span
            className={cx(
              "grid size-[26px] place-items-center rounded-full border-2 transition-[background-color,border-color] duration-150",
              done || completing ? "border-ok bg-ok text-accent-ink" : "border-line text-transparent hover:border-accent",
            )}
          >
            <IconCheck size={15} strokeWidth={2.8} className={completing ? "anim-pop" : undefined} />
          </span>
        </button>
        <button
          type="button"
          {...longPress}
          onClick={() => openTask(task.id, isDesktop)}
          className="min-w-0 flex-1 py-1 text-left"
        >
          <span className={cx("flex items-center gap-2 text-[16px] leading-snug", done && "text-muted line-through decoration-1")}>
            <span className="min-w-0 truncate">{task.title}</span>
            {task.forced && <span className="shrink-0 rounded-full bg-fire-soft px-2 text-[11px] font-medium text-fire-ink">Locked in</span>}
            <FromClaude createdAt={task.created_at} source={task.source} />
          </span>
          {!compact && <TaskMeta task={task} time={time} />}
          {compact && time && <span className="num text-[13px] text-muted">{time}</span>}
        </button>
        {showTomorrow && canPostpone && (
          <button
            type="button"
            onClick={() => postpone(task, "tomorrow")}
            className="hidden min-h-11 shrink-0 rounded-[10px] px-2.5 text-[13px] text-muted hoverable sm:block"
            aria-label={`Move "${task.title}" to tomorrow`}
          >
            Tomorrow
          </button>
        )}
      </div>
    </li>
  );
}
