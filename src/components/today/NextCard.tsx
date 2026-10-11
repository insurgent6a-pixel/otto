"use client";

import { useEffect, useRef, useState } from "react";
import { store, useOtto } from "@/lib/store";
import { completeWithReward, postpone, startTimer, stopTimer } from "@/lib/actions";
import { estimateLabel, projectName } from "@/engine/format";
import { forcedMessage } from "@/engine/force";
import { localTime } from "@/engine/time";
import type { RankedTask } from "@/engine/today";
import { IconCheck, IconLock, IconPlay } from "../Icons";
import { Button, cx } from "../ui";
import { useEnergy } from "../usePulse";
import { useLongPress } from "../useGestures";

function useTick(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function FromClaude({ createdAt, source, onAccent }: { createdAt: string; source: string; onAccent?: boolean }) {
  const now = useOtto((s) => s.now);
  if (source !== "claude" || now - new Date(createdAt).getTime() > 86400000) return null;
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-full px-2 text-[12px] font-medium",
        onAccent ? "bg-[color-mix(in_oklab,var(--accent-ink)_18%,transparent)] text-accent-ink" : "bg-[color-mix(in_oklab,var(--plum)_14%,transparent)] text-plum",
      )}
    >
      From Claude
    </span>
  );
}

export function NextCard({ ranked }: { ranked: RankedTask | null }) {
  const focusMode = useOtto((s) => s.focusMode);
  const timer = useOtto((s) => s.timer);
  const completing = useOtto((s) => s.completing);
  const tz = useOtto((s) => s.settings.timezone);
  const blocks = useOtto((s) => s.blocks);
  const energy = useEnergy();
  const [later, setLater] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const task = ranked?.task ?? null;
  const running = timer && task && timer.taskId === task.id ? timer : null;
  useTick(Boolean(running));
  useEffect(() => setLater(false), [task?.id]);
  const longPress = useLongPress(() => task && store.openSheet({ kind: "edit", taskId: task.id }));

  if (!task || !ranked) {
    return (
      <section className="mt-4 rounded-[22px] bg-accent p-5 text-accent-ink sm:p-6" aria-label="Do this next">
        <p className="text-[14px] opacity-80">Do this next</p>
        <h2 className="mt-2 text-[24px] leading-tight font-semibold">Nothing left for today.</h2>
        <p className="mt-2 text-[15px] opacity-85">Add something with the + button, or take the win and rest.</p>
        <Button variant="onAccent" size="lg" className="mt-5" onClick={() => store.openSheet({ kind: "add" })}>
          Add a task
        </Button>
      </section>
    );
  }

  const minutes = energy.level === "high" ? 25 : 5;
  const isCompleting = Boolean(completing[task.id]);
  const forcedBlock = task.forced ? blocks.find((b) => b.task_id === task.id && b.source === "force") : null;
  const forcedTime = forcedBlock ? localTime(forcedBlock.start_at, tz) : null;
  const left = running ? Math.max(0, running.endsAt - Date.now()) : 0;
  const progress = running ? 1 - left / (running.minutes * 60000) : 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  const labelParts = ["Do this next", projectName(task.project), ranked.fiveMin ? "~5 min" : estimateLabel(task)];
  if (ranked.time) labelParts.push(ranked.time);

  return (
    <section
      className={cx("mt-4 rounded-[22px] bg-accent p-5 text-accent-ink shadow-[var(--shadow-card)] sm:p-6", isCompleting && "anim-out")}
      aria-label="Do this next"
      aria-live="polite"
      data-task-id={task.id}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] opacity-85">{labelParts.join(" · ")}</p>
        <FromClaude createdAt={task.created_at} source={task.source} onAccent />
        <button
          type="button"
          onClick={() => store.setFocusMode(!focusMode)}
          aria-pressed={focusMode}
          className={cx(
            "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition-[background-color] duration-150",
            focusMode ? "bg-accent-ink text-accent" : "bg-[color-mix(in_oklab,var(--accent-ink)_16%,transparent)]",
          )}
        >
          Just this one
        </button>
      </div>

      <h2 className="mt-3 cursor-pointer text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] select-none sm:text-[30px]" {...longPress} onClick={() => store.openSheet({ kind: "edit", taskId: task.id })}>
        {isCompleting && (
          <span className="anim-pop mr-2 inline-grid size-8 place-items-center rounded-full bg-accent-ink align-middle text-accent">
            <IconCheck size={20} strokeWidth={2.6} />
          </span>
        )}
        {ranked.fiveMin ? `5 minute version: ${ranked.displayTitle}` : ranked.displayTitle}
      </h2>
      {task.next_action && !ranked.fiveMin && <p className="mt-2 text-[16px] opacity-90">First step: {task.next_action}</p>}
      {task.forced ? (
        <p className="mt-2 flex items-center gap-1.5 text-[15px] opacity-90">
          <IconLock size={16} /> {forcedMessage(task, forcedTime)}
        </p>
      ) : (
        ranked.reasonLine && <p className="mt-2 text-[15px] opacity-80">{ranked.reasonLine}</p>
      )}

      {running && (
        <div className="mt-4" aria-label="Focus timer">
          <div className="h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--accent-ink)_22%,transparent)]">
            <div className="h-full bg-accent-ink transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {task.forced ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="onAccent" size="lg" ref={doneRef} onClick={() => completeWithReward(task, doneRef.current)}>
            <IconCheck size={20} strokeWidth={2.4} /> Done
          </Button>
          {running ? (
            <Button variant="onAccentSoft" size="lg" onClick={() => stopTimer()}>
              <span className="num">{mm}:{String(ss).padStart(2, "0")}</span> Stop
            </Button>
          ) : (
            <Button variant="onAccentSoft" size="lg" onClick={() => startTimer(task, 25)}>
              <IconPlay size={16} /> Do it now
            </Button>
          )}
          <Button variant="onAccentSoft" onClick={() => store.openSheet({ kind: "shrink", taskId: task.id })}>
            Shrink it
          </Button>
          <Button variant="onAccentSoft" onClick={() => store.openSheet({ kind: "handoff", taskId: task.id })}>
            Hand it off
          </Button>
          <Button variant="onAccentSoft" className="col-span-2" onClick={() => void store.dropTask(task.id)}>
            Drop it
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="onAccent" size="lg" ref={doneRef} onClick={() => completeWithReward(task, doneRef.current)}>
              <IconCheck size={20} strokeWidth={2.4} /> Done
            </Button>
            {running ? (
              <Button variant="onAccentSoft" size="lg" onClick={() => stopTimer()} aria-label="Stop timer">
                <span className="num text-[18px]">
                  {mm}:{String(ss).padStart(2, "0")}
                </span>
                <span className="text-[15px] opacity-85">Stop</span>
              </Button>
            ) : (
              <Button variant="onAccentSoft" size="lg" onClick={() => startTimer(task, minutes)}>
                <IconPlay size={16} /> Start {minutes} min
              </Button>
            )}
          </div>
          <div className="mt-3 min-h-11">
            {!later ? (
              <button type="button" className="min-h-11 text-[15px] font-medium underline-offset-4 opacity-85 hover:underline" onClick={() => setLater(true)}>
                Not right now
              </button>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Not right now">
                <Button variant="onAccentSoft" size="sm" onClick={() => postpone(task, "later_today")}>
                  Later today
                </Button>
                <Button variant="onAccentSoft" size="sm" onClick={() => postpone(task, "tomorrow")}>
                  Tomorrow
                </Button>
                <Button variant="onAccentSoft" size="sm" onClick={() => store.openSheet({ kind: "too_big", taskId: task.id })}>
                  It&apos;s too big
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
