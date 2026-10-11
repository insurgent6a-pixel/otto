"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { store } from "@/lib/store";
import { completeWithReward, postpone } from "@/lib/actions";
import { TaskEditor } from "./TaskEditor";
import { useTask } from "./usePulse";
import { Button, Card, Empty } from "./ui";
import { IconCheck } from "./Icons";

/** Notification target: Done, Tomorrow and Too big? are ready without scrolling. */
export function TaskPage() {
  const params = useParams<{ id: string }>();
  const task = useTask(params.id);
  const doneRef = useRef<HTMLButtonElement>(null);
  if (!task) {
    return (
      <div className="safe-top mx-auto max-w-xl px-4 [--pad-top:2rem]">
        <Empty action={<Link href="/" className="font-medium text-accent">Open Today</Link>}>This task is gone. It may have been deleted.</Empty>
      </div>
    );
  }
  const open = task.status === "todo" || task.status === "waiting";
  return (
    <div className="safe-top mx-auto max-w-xl px-4 pb-10 [--pad-top:1.5rem]">
      <Link href="/" className="inline-flex min-h-11 items-center text-[15px] text-muted">
        Back to Today
      </Link>
      <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{task.title}</h1>
      {open && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button ref={doneRef} variant="primary" size="lg" onClick={() => completeWithReward(task, doneRef.current)}>
            <IconCheck size={18} strokeWidth={2.4} /> Done
          </Button>
          <Button size="lg" disabled={task.forced} onClick={() => postpone(task, "tomorrow")}>
            Tomorrow
          </Button>
          <Button size="lg" onClick={() => store.openSheet({ kind: "too_big", taskId: task.id })}>
            Too big?
          </Button>
        </div>
      )}
      <Card className="mt-5">
        <TaskEditor task={task} compactHeader />
      </Card>
    </div>
  );
}
