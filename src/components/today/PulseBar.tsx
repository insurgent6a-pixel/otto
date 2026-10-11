"use client";

import { IconClock, IconFlame, Ring } from "../Icons";
import { cx } from "../ui";
import { usePulse } from "../usePulse";
import { timeLeftLabel } from "@/engine/format";

function Pill({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <div
      className={cx("flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[14px]", className)}
      aria-label={label}
      role="status"
    >
      {children}
    </div>
  );
}

/** Streak, score, done and time left: always visible, the time-blindness anchor. */
export function PulseBar() {
  const p = usePulse();
  const bars = Math.max(p.dailyGoal, 1);
  return (
    <div className="safe-top sticky top-0 z-30 -mx-4 border-b border-line/70 bg-[var(--bar-bg)] backdrop-blur-xl sm:-mx-6 md:mx-0 md:rounded-b-[18px] md:border-x">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
        <Pill label={`${p.streak} day streak`} className="text-fire">
          <IconFlame size={17} />
          <span className="num font-semibold">{p.streak}</span>
          <span className="font-medium">day streak</span>
        </Pill>
        <Pill label={`Score ${p.score}`}>
          <Ring value={p.score / 100} size={17} stroke={3} />
          <span className="num font-semibold text-fire">{p.score}</span>
          <span className="pulse-label text-muted">score</span>
        </Pill>
        <Pill label={`${p.doneCount} of ${p.dailyGoal} done today`}>
          <span className="flex items-end gap-[3px]" aria-hidden="true">
            {Array.from({ length: Math.min(bars, 6) }, (_, i) => (
              <span
                key={i}
                className="w-[5px] rounded-[2px]"
                style={{ height: 8 + i * 2, background: i < p.doneCount ? "var(--sun)" : "var(--line)" }}
              />
            ))}
          </span>
          <span className="num font-semibold">
            {p.doneCount}/{p.dailyGoal}
          </span>
          <span className="pulse-label text-muted">done</span>
        </Pill>
        <Pill label={`${timeLeftLabel(p.timeLeftMin)} of work time left today`}>
          <IconClock size={16} className="text-muted" />
          <span className="num font-semibold">{timeLeftLabel(p.timeLeftMin)}</span>
          <span className="pulse-label text-muted">left</span>
        </Pill>
      </div>
      <style>{`@media (max-width: 440px){.pulse-label{display:none}}`}</style>
    </div>
  );
}
