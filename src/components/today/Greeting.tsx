"use client";

import Link from "next/link";
import { useOtto } from "@/lib/store";
import { greeting, energyCheckLines, morningLine } from "@/engine/messages";
import { localDate, tzLabel } from "@/engine/time";
import { OttoLine } from "../ui";
import { IconSettings } from "../Icons";
import { useEnergy, useToday } from "../usePulse";
import { lowGoalLine } from "@/engine/today";

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };

export function Greeting() {
  const now = useOtto((s) => s.now);
  const settings = useOtto((s) => s.settings);
  const goals = useOtto((s) => s.goals);
  const tasks = useOtto((s) => s.tasks);
  const energy = useEnergy();
  const today = useToday();
  const tz = settings.timezone;
  const dateText = new Intl.DateTimeFormat("en-GB", { ...LONG_DATE, timeZone: tz }).format(new Date(now));
  const goal = goals.find((g) => g.is_current)?.name ?? null;

  let line: string;
  if (energy.level === "ok" && today.next) {
    line = energyCheckLines.answer("ok", today.next.displayTitle, today.next.reasons.join(", "));
  } else if (energy.level) {
    line = energyCheckLines.answer(energy.level);
    if (energy.level === "low") line += ` ${lowGoalLine(today.dailyGoal)}`;
  } else {
    const doneYesterday = tasks.filter(
      (t) => t.status === "done" && t.done_at && localDate(t.done_at, tz) === localDate(now - 86400000, tz),
    ).length;
    line = morningLine({ doneYesterday, overdue: today.triage.length, nextTitle: today.next?.displayTitle ?? null, goal });
  }

  return (
    <header className="pt-5 pb-1">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted">
          {dateText} <span className="num text-[12px]">· {tzLabel(tz, new Date(now))}</span>
        </p>
        <Link href="/settings" aria-label="Settings" className="-mr-2 grid size-11 place-items-center rounded-full text-muted hoverable md:hidden">
          <IconSettings size={20} />
        </Link>
      </div>
      <h1 className="mt-1 text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] sm:text-[34px]">
        {greeting(new Date(now), tz, settings.display_name || "Electra")}
      </h1>
      <OttoLine className="mt-3">{line}</OttoLine>
    </header>
  );
}
