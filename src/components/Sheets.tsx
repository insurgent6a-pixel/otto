"use client";

import { useMemo, useState } from "react";
import { store, useOtto } from "@/lib/store";
import { handOff, shrink } from "@/lib/actions";
import { addDays, localDate } from "@/engine/time";
import { KNOWN_NAMES } from "@/engine/fuzzy";
import { followUpTiming, suggestFollowUpDays } from "@/engine/learning";
import { relativeDayLabel } from "@/engine/format";
import { QuickAddSheet } from "./QuickAdd";
import { TaskEditor } from "./TaskEditor";
import { Button, Field, Sheet, inputClass } from "./ui";
import { useTask } from "./usePulse";

export function Sheets() {
  const sheet = useOtto((s) => s.sheet);
  const close = () => store.openSheet(null);
  if (!sheet) return null;
  switch (sheet.kind) {
    case "add":
      return <QuickAddSheet preset={sheet.preset} onClose={close} />;
    case "edit":
      return <EditSheet taskId={sheet.taskId} onClose={close} />;
    case "shrink":
    case "too_big":
      return <ShrinkSheet taskId={sheet.taskId} onClose={close} />;
    case "handoff":
      return <HandoffSheet taskId={sheet.taskId} onClose={close} />;
  }
}

function EditSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTask(taskId);
  if (!task) return null;
  return (
    <Sheet open onClose={onClose} title="Edit task" wide>
      <TaskEditor task={task} onClose={onClose} />
    </Sheet>
  );
}

function ShrinkSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTask(taskId);
  const [step, setStep] = useState("");
  if (!task) return null;
  return (
    <Sheet open onClose={onClose} title="Shrink it">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!step.trim()) return;
          shrink(task, step.trim());
          onClose();
        }}
        className="space-y-4"
      >
        <p className="text-[16px]">
          What&apos;s a first step for <span className="font-medium">{task.title}</span> that takes under 15 minutes?
        </p>
        <input autoFocus className={inputClass} placeholder="Open the file and write the first line" value={step} onChange={(e) => setStep(e.target.value)} aria-label="First step" />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!step.trim()}>
          Make it 15 minutes
        </Button>
      </form>
    </Sheet>
  );
}

function HandoffSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTask(taskId);
  const settings = useOtto((s) => s.settings);
  const events = useOtto((s) => s.events);
  const tasks = useOtto((s) => s.tasks);
  const now = useOtto((s) => s.now);
  const today = localDate(now, settings.timezone);
  const [who, setWho] = useState(task?.waiting_on ?? "");
  const timings = useMemo(() => followUpTiming(events, tasks), [events, tasks]);
  const days = suggestFollowUpDays(who, timings, settings.followup_days);
  const [date, setDate] = useState<string | null>(null);
  const returnDate = date ?? addDays(today, days);
  if (!task) return null;
  return (
    <Sheet open onClose={onClose} title="Hand it off">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!who.trim()) return;
          handOff(task, who.trim(), returnDate);
          onClose();
        }}
        className="space-y-4"
      >
        <Field label="Who has it now?">
          <input autoFocus className={inputClass} placeholder="Pak Arief" value={who} onChange={(e) => setWho(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {KNOWN_NAMES.filter((n) => !["Teba", "IVG"].includes(n)).map((n) => (
            <button key={n} type="button" onClick={() => setWho(n)} className="min-h-10 rounded-full border border-line px-3 text-[14px] hoverable">
              {n}
            </button>
          ))}
        </div>
        <Field label="Back on your list" hint={`${relativeDayLabel(returnDate, today)}. Otto brings it back then.`}>
          <input type="date" className={`${inputClass} num`} value={returnDate} onChange={(e) => setDate(e.target.value || null)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!who.trim()}>
          Hand it off
        </Button>
      </form>
    </Sheet>
  );
}
