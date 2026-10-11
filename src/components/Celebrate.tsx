"use client";

import { useEffect } from "react";
import { store, useOtto } from "@/lib/store";
import { chime, confetti, haptic } from "@/lib/rewards";
import { goalReachedLine } from "@/engine/messages";
import { formatIdr } from "@/engine/money";
import { Button } from "./ui";
import Link from "next/link";

/** Reaching the target is the biggest moment in the app. */
export function Celebrate() {
  const celebrate = useOtto((s) => s.celebrate);
  const goal = useOtto((s) => s.goals.find((g) => g.id === celebrate?.goalId));
  const sound = useOtto((s) => s.settings.sound);
  const haptics = useOtto((s) => s.settings.haptics);
  useEffect(() => {
    if (!celebrate) return;
    confetti(null, "big");
    const again = setTimeout(() => confetti(null, "big"), 650);
    if (sound) chime("goal");
    if (haptics) haptic([20, 50, 20, 50, 40]);
    return () => clearTimeout(again);
  }, [celebrate, sound, haptics]);
  if (!celebrate || !goal) return null;
  return (
    <div className="anim-fade fixed inset-0 z-80 grid place-items-center bg-[rgb(10_20_15/0.5)] px-6" role="dialog" aria-modal="true" aria-label="Goal reached">
      <div className="anim-sheet w-full max-w-sm rounded-[24px] bg-sun p-6 text-[#1c2a21] shadow-[var(--shadow-card)]">
        <p className="brand text-[11px]">OTTO</p>
        <h2 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.02em]">{goal.name}</h2>
        {goal.target_idr && <p className="num mt-1 text-[17px]">{formatIdr(goal.target_idr)} reached</p>}
        <p className="mt-4 text-[17px]">{goalReachedLine}</p>
        <div className="mt-6 flex gap-2">
          <Link href="/goals" onClick={() => store.set({ celebrate: null })} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[13px] bg-[#1c2a21] font-medium text-[#f5f4ec]">
            Open bucket list
          </Link>
          <Button variant="ghost" className="text-[#1c2a21]" onClick={() => store.set({ celebrate: null })}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
