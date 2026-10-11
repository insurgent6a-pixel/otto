"use client";

import { useEffect } from "react";
import { store, useOtto } from "@/lib/store";
import { speak } from "@/lib/rewards";
import { PulseBar } from "./PulseBar";
import { Greeting } from "./Greeting";
import { EnergyCheck } from "./EnergyCheck";
import { NextCard } from "./NextCard";
import { FocusBar, TodayFolds, TodayPlan, UpNext, YourDay } from "./Sections";
import { GoalCard } from "../GoalCard";
import { useToday } from "../usePulse";
import { morningLine } from "@/engine/messages";
import { localDate } from "@/engine/time";
import { IconPlus } from "../Icons";
import { Button } from "../ui";

/** iOS only speaks after a tap, so the morning line plays on the first tap of the day. */
function useMorningVoice(line: string) {
  const speakOn = useOtto((s) => s.settings.speak);
  const tz = useOtto((s) => s.settings.timezone);
  useEffect(() => {
    if (!speakOn) return;
    const key = `otto.morningSpoken.${localDate(Date.now(), tz)}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const onTap = () => {
      try {
        localStorage.setItem(key, "1");
      } catch {}
      speak(line);
    };
    window.addEventListener("pointerdown", onTap, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", onTap, { capture: true });
  }, [speakOn, tz, line]);
}

export function TodayView() {
  const model = useToday();
  const focusMode = useOtto((s) => s.focusMode);
  const goal = useOtto((s) => s.goals.find((g) => g.is_current)?.name ?? null);
  useMorningVoice(
    morningLine({ doneYesterday: 0, overdue: model.triage.length, nextTitle: model.next?.displayTitle ?? null, goal }),
  );

  // J/K and D/T/E act on the green card when nothing else is selected.
  useEffect(() => {
    store.set({ selectedId: model.next?.task.id ?? null });
  }, [model.next?.task.id]);

  if (focusMode) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <PulseBar />
        <div className="pt-4">
          <NextCard ranked={model.next} />
          <FocusBar />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
      <PulseBar />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] md:gap-6 lg:gap-8">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Greeting />
            </div>
            <div className="mb-2 hidden md:block">
              <Button variant="primary" onClick={() => store.openSheet({ kind: "add" })}>
                <IconPlus size={18} /> Add a task
              </Button>
            </div>
          </div>
          <EnergyCheck />
          <NextCard ranked={model.next} />
          <UpNext items={model.upNext} />
          <TodayFolds model={model} />
        </div>
        <aside className="mt-3 space-y-3 md:mt-5" aria-label="Your progress">
          <YourDay />
          <GoalCard />
          <div className="md:hidden">
            <TodayPlan defaultOpen={false} />
          </div>
          <div className="hidden md:block">
            <TodayPlan defaultOpen />
          </div>
        </aside>
      </div>
      <div className="h-6" />
    </div>
  );
}
