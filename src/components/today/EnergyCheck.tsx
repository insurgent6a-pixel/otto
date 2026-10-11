"use client";

import { useState } from "react";
import { store, useOtto } from "@/lib/store";
import { haptic } from "@/lib/rewards";
import { energyCheckLines, ENERGY_LABEL } from "@/engine/messages";
import { localDate, localMinutes } from "@/engine/time";
import type { EnergyLevel } from "@/engine/types";
import { Signal } from "../Icons";
import { cx, LinkButton } from "../ui";
import { useEnergy } from "../usePulse";

const LEVELS: { level: EnergyLevel; bars: 1 | 2 | 3 }[] = [
  { level: "low", bars: 1 },
  { level: "ok", bars: 2 },
  { level: "high", bars: 3 },
];

const SKIP_KEY = "otto.afternoonSkip";

export function EnergyCheck() {
  const energy = useEnergy();
  const now = useOtto((s) => s.now);
  const tz = useOtto((s) => s.settings.timezone);
  const hapticsOn = useOtto((s) => s.settings.haptics);
  const [editing, setEditing] = useState(false);
  const today = localDate(now, tz);
  const [skippedDay, setSkippedDay] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SKIP_KEY);
    } catch {
      return null;
    }
  });
  const skipped = skippedDay === today;

  const afternoon =
    energy.level != null && energy.at != null && !skipped && localMinutes(now, tz) >= 13 * 60 && localMinutes(energy.at, tz) < 12 * 60;

  const pick = (level: EnergyLevel) => {
    if (hapticsOn) haptic(10);
    setEditing(false);
    void store.checkIn(level);
  };

  const skip = () => {
    setSkippedDay(today);
    try {
      localStorage.setItem(SKIP_KEY, today);
    } catch {}
  };

  if (energy.level && !editing && !afternoon) {
    return (
      <div className="mt-4 flex min-h-12 items-center gap-3 rounded-[16px] border border-line bg-panel px-4">
        <span className="text-accent">
          <Signal level={LEVELS.find((l) => l.level === energy.level)!.bars} size={20} />
        </span>
        <p className="flex-1 text-[15px]">{energyCheckLines.collapsed(energy.level)}</p>
        <LinkButton onClick={() => setEditing(true)}>Change</LinkButton>
      </div>
    );
  }

  const question = afternoon && energy.level ? energyCheckLines.afternoon(energy.level) : energyCheckLines.question;

  return (
    <section className="mt-4 rounded-[18px] border border-line bg-panel p-4" aria-label="Energy check-in">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{question}</h2>
        {afternoon && <LinkButton onClick={skip}>Skip</LinkButton>}
        {editing && !afternoon && <LinkButton onClick={() => setEditing(false)}>Keep it</LinkButton>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Energy level">
        {LEVELS.map(({ level, bars }) => {
          const selected = energy.level === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => pick(level)}
              aria-pressed={selected}
              className={cx(
                "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[14px] border text-[16px] font-medium",
                "transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                selected ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel-2 text-ink hoverable",
              )}
            >
              <span className={selected ? undefined : "text-accent"}>
                <Signal level={bars} size={24} />
              </span>
              {afternoon && selected ? `Still ${ENERGY_LABEL[level]}` : ENERGY_LABEL[level]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
