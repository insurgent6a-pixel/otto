"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { store, useOtto } from "@/lib/store";
import { addDays, localDate } from "@/engine/time";
import { TaskEditor } from "../TaskEditor";
import { useTask } from "../usePulse";
import { IconChevron, IconClose } from "../Icons";
import { Button, Card, Segmented, cx } from "../ui";
import { DayAgenda } from "./DayAgenda";
import { Legend, MonthGrid } from "./MonthGrid";
import { WeekTimeline } from "./WeekTimeline";
import { indexByDay, monthLabel, shiftMonth, weekDays, weekLabel } from "./model";

type View = "month" | "week";

const MQ = "(min-width: 768px)";
const subscribeMq = (cb: () => void) => {
  const m = window.matchMedia(MQ);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

function useDesktop() {
  return useSyncExternalStore(subscribeMq, () => window.matchMedia(MQ).matches, () => false);
}

export function CalendarView() {
  const params = useSearchParams();
  const router = useRouter();
  const desktop = useDesktop();
  const param = params.get("view");
  const view: View = param === "week" || param === "month" ? param : desktop ? "week" : "month";

  const tasks = useOtto((s) => s.tasks);
  const blocks = useOtto((s) => s.blocks);
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const selectedId = useOtto((s) => s.selectedId);
  const task = useTask(selectedId);
  const today = localDate(now, tz);
  const [selected, setSelected] = useState(today);

  // Today pre-selects its green card; here the timeline gets the full width until something is picked.
  useEffect(() => store.set({ selectedId: null }), []);

  const index = useMemo(() => indexByDay(tasks, tz), [tasks, tz]);
  const days = useMemo(() => weekDays(selected), [selected]);

  const undated = useMemo(() => {
    const future = new Set(blocks.filter((b) => Date.parse(b.end_at) > now).map((b) => b.task_id));
    return tasks.filter(
      (t) =>
        (t.status === "todo" || t.status === "waiting") &&
        !t.deadline &&
        !t.scheduled_at &&
        !t.follow_up &&
        !t.ready_by &&
        !t.plan_for &&
        !future.has(t.id),
    ).length;
  }, [tasks, blocks, now]);

  const setView = (v: View) => router.replace(`/calendar?view=${v}`, { scroll: false });
  const step = (n: number) => setSelected((s) => (view === "week" ? addDays(s, 7 * n) : shiftMonth(s, n)));
  const openTask = (id: string) => (desktop ? store.set({ selectedId: id }) : store.openSheet({ kind: "edit", taskId: id }));
  const pane = desktop && task;
  const unit = view === "week" ? "week" : "month";

  return (
    <div className={cx("md:grid md:min-h-dvh", pane && "md:grid-cols-[minmax(0,1fr)_380px]")}>
      <div className={cx("safe-top mx-auto w-full min-w-0 px-4 [--pad-top:1rem] pb-8 sm:px-6 md:px-8 md:[--pad-top:1.5rem]", view === "week" ? "max-w-7xl" : "max-w-3xl")}>
        <header className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Calendar</h1>
            <Segmented
              label="Calendar view"
              value={view}
              onChange={setView}
              options={[
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
              ]}
            />
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={() => step(-1)} aria-label={`Show previous ${unit}`} className="-ml-2.5 grid size-11 place-items-center rounded-full text-muted hoverable">
              <IconChevron size={20} className="rotate-180" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label={`Show next ${unit}`} className="grid size-11 place-items-center rounded-full text-muted hoverable">
              <IconChevron size={20} />
            </button>
            <h2 className="min-w-0 flex-1 truncate pl-1 text-[17px] font-medium" aria-live="polite">
              {view === "week" ? weekLabel(days) : monthLabel(selected)}
            </h2>
            <Button size="sm" onClick={() => setSelected(today)} disabled={selected === today} aria-label="Go to today">
              Today
            </Button>
          </div>
        </header>

        {view === "month" ? (
          <Card className="p-3 sm:p-4">
            <MonthGrid selected={selected} today={today} index={index} onSelect={setSelected} />
            <div className="mt-3 border-t border-line pt-3">
              <Legend />
            </div>
          </Card>
        ) : (
          <WeekTimeline
            days={days}
            selected={selected}
            today={today}
            index={index}
            showList={desktop && !pane}
            onSelectDay={setSelected}
            onOpenTask={openTask}
          />
        )}

        <DayAgenda day={selected} today={today} items={index.get(selected)} />

        {undated > 0 && (
          <Link
            href="/all?undated=1"
            className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-[16px] border border-dashed border-line px-4 text-[15px] text-muted hoverable"
          >
            <span>
              <span className="num">{undated}</span> open {undated === 1 ? "task has" : "tasks have"} no date yet
            </span>
            <IconChevron size={18} />
          </Link>
        )}
      </div>

      {pane && (
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-l border-line bg-panel md:block" aria-label="Task detail">
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-medium text-muted">Task</p>
              <button
                type="button"
                aria-label="Close"
                className="grid size-11 place-items-center rounded-full text-muted hoverable"
                onClick={() => store.set({ selectedId: null })}
              >
                <IconClose size={18} />
              </button>
            </div>
            <TaskEditor key={task.id} task={task} compactHeader onClose={() => store.set({ selectedId: null })} />
          </div>
        </aside>
      )}
    </div>
  );
}
