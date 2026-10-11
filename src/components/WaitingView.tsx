"use client";

import { useMemo } from "react";
import Link from "next/link";
import { store, useOtto } from "@/lib/store";
import { localDate } from "@/engine/time";
import { relativeDayLabel } from "@/engine/format";
import { ListLayout, PageTitle } from "./ListLayout";
import { TaskRow } from "./TaskRow";
import { Button, Card, Empty, OttoLine } from "./ui";

export function WaitingView() {
  const tasks = useOtto((s) => s.tasks);
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const selectedId = useOtto((s) => s.selectedId);
  const today = localDate(now, tz);
  const { back, later } = useMemo(() => {
    const waiting = tasks
      .filter((t) => t.status === "waiting")
      .sort((a, b) => (a.follow_up ?? "9999").localeCompare(b.follow_up ?? "9999"));
    return { back: waiting.filter((t) => t.follow_up && t.follow_up <= today), later: waiting.filter((t) => !t.follow_up || t.follow_up > today) };
  }, [tasks, today]);

  return (
    <ListLayout
      header={
        <PageTitle title="Waiting">
          <Link href="/all" className="inline-flex min-h-11 items-center rounded-[13px] border border-line bg-panel px-4 text-[15px] font-medium hoverable">
            All tasks
          </Link>
        </PageTitle>
      }
    >
      <p className="mb-4 text-[15px] text-muted">Things other people owe you. Otto brings each one back on its return date.</p>
      {back.length > 0 && (
        <Card className="mb-4 border-[color-mix(in_oklab,var(--plum)_40%,var(--line))]">
          <OttoLine>
            {back.length === 1 ? "One is due back." : `${back.length} are due back.`} Chase it or mark that it came back.
          </OttoLine>
          <ul className="mt-2">
            {back.map((t) => (
              <div key={t.id}>
                <TaskRow task={t} selected={selectedId === t.id} showTomorrow={false} />
                <div className="mb-2 ml-14 flex gap-2">
                  <Button size="sm" variant="soft" onClick={() => void store.updateTask(t.id, { status: "todo" })}>
                    It came back
                  </Button>
                  <Button size="sm" onClick={() => store.openSheet({ kind: "handoff", taskId: t.id })}>
                    Give it more time
                  </Button>
                </div>
              </div>
            ))}
          </ul>
        </Card>
      )}
      {later.length ? (
        <Card className="!p-2 sm:!p-3">
          <ul>
            {later.map((t) => (
              <TaskRow key={t.id} task={t} selected={selectedId === t.id} showTomorrow={false} />
            ))}
          </ul>
        </Card>
      ) : (
        !back.length && <Empty>Nobody owes you anything. When you hand something off, it waits here with a return date.</Empty>
      )}
      {later.length > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          Next one back: {later[0].follow_up ? relativeDayLabel(later[0].follow_up, today) : "no date yet"}.
        </p>
      )}
    </ListLayout>
  );
}
