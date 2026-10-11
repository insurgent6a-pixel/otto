"use client";

import { useMemo } from "react";
import { store, useOtto } from "@/lib/store";
import { blocksForDay } from "@/engine/schedule";
import { relativeDayLabel } from "@/engine/format";
import { localTime } from "@/engine/time";
import type { Task } from "@/engine/types";
import { TaskRow } from "../TaskRow";
import { IconPlus } from "../Icons";
import { Button, Card } from "../ui";
import { presetFor, type DayItems } from "./model";

interface Row {
  key: string;
  task: Task;
  time?: string;
}

export function DayAgenda({ day, today, items }: { day: string; today: string; items?: DayItems }) {
  const tasks = useOtto((s) => s.tasks);
  const blocks = useOtto((s) => s.blocks);
  const tz = useOtto((s) => s.settings.timezone);

  const groups = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const planned: Row[] = [];
    for (const b of blocksForDay(blocks, day, tz)) {
      const t = byId.get(b.task_id);
      if (t && t.status !== "dropped") planned.push({ key: b.id, task: t, time: `${localTime(b.start_at, tz)} to ${localTime(b.end_at, tz)}` });
    }
    const rows = (list: Task[] = [], prefix: string): Row[] => list.map((t) => ({ key: `${prefix}${t.id}`, task: t }));
    return [
      { label: "At a time", rows: (items?.timed ?? []).map((t) => ({ key: `at${t.id}`, task: t, time: localTime(t.scheduled_at!, tz) })) },
      { label: "Due", rows: rows(items?.due, "due") },
      { label: "Follow up", rows: rows(items?.follow, "fu") },
      { label: "Ready", rows: rows(items?.ready, "ready") },
      { label: "Planned", rows: planned },
    ].filter((g) => g.rows.length);
  }, [tasks, blocks, tz, day, items]);

  const add = () => store.openSheet({ kind: "add", preset: presetFor(day, today) });
  const title = relativeDayLabel(day, today);

  return (
    <Card className="mt-4" aria-label={`Agenda for ${title}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
        <Button size="sm" variant="soft" onClick={add}>
          <IconPlus size={17} /> Add to this day
        </Button>
      </div>
      {groups.length ? (
        <>
          {groups.map((g) => (
            <section key={g.label} className="mt-3">
              <h3 className="text-[13px] font-medium text-muted">{g.label}</h3>
              <ul>
                {g.rows.map((r) => (
                  <TaskRow key={r.key} task={r.task} time={r.time} showTomorrow={false} />
                ))}
              </ul>
            </section>
          ))}
          <button type="button" onClick={add} className="mt-2 min-h-11 w-full rounded-[12px] text-left text-[14px] text-muted hoverable px-2">
            Tap here to add something for this day
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={add}
          className="mt-3 block min-h-24 w-full rounded-[16px] border border-dashed border-line px-4 py-6 text-center text-[15px] text-muted hoverable"
        >
          Nothing on this day yet. Tap to add something for it.
        </button>
      )}
    </Card>
  );
}
