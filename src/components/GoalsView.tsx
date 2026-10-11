"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { store, useOtto } from "@/lib/store";
import { addDays, isoWeekday, localDate } from "@/engine/time";
import { relativeDayLabel } from "@/engine/format";
import {
  energyByHourWeekday,
  energyInsight,
  estimateLearning,
  suggestEnergyWindows,
  suggestFromBestHours,
  weeklyReview,
} from "@/engine/learning";
import type { TimeWindow } from "@/engine/types";
import { GoalCard } from "./GoalCard";
import { usePulse } from "./usePulse";
import { Button, Card, OttoLine, cx } from "./ui";
import { IconFlame, IconSettings } from "./Icons";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PERIODS: { label: string; from: number; to: number }[] = [
  { label: "Morning", from: 5, to: 12 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Evening", from: 17, to: 22 },
];

function windowsLabel(w: TimeWindow[]) {
  return w.map((x) => `${x.start} to ${x.end}`).join(", ");
}

function ScoreHistory({ days }: { days: { day: string; score: number | null; label: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 120;
  return (
    <figure>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex h-[132px] items-end gap-[2px] border-b border-line" aria-hidden="true">
          {days.map((d, i) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            >
              <div
                className={cx("mx-auto w-full max-w-[18px] rounded-t-[4px] transition-[opacity] duration-150", hover != null && hover !== i && "opacity-45")}
                style={{ height: d.score == null ? 2 : Math.max(3, (d.score / 100) * H), background: d.score == null ? "var(--line)" : "var(--fire)" }}
              />
            </div>
          ))}
        </div>
        {hover != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-[10px] border border-line bg-panel px-2.5 py-1.5 text-[13px] shadow-[var(--shadow-card)]"
            style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
          >
            <span className="text-muted">{days[hover].label}</span>{" "}
            <span className="num font-semibold">{days[hover].score ?? "no score"}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>{days[0]?.label}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Daily score, last {days.length} days</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.label}</th>
              <td>{d.score ?? "no score"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function GoalsView() {
  const scores = useOtto((s) => s.scores);
  const tasks = useOtto((s) => s.tasks);
  const checkins = useOtto((s) => s.checkins);
  const events = useOtto((s) => s.events);
  const settings = useOtto((s) => s.settings);
  const now = useOtto((s) => s.now);
  const pulse = usePulse();
  const tz = settings.timezone;
  const today = localDate(now, tz);

  const history = useMemo(() => {
    const byDay = new Map(scores.map((r) => [r.day, r.score]));
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i - 13);
      return { day: d, score: d === today ? pulse.score : byDay.get(d) ?? null, label: relativeDayLabel(d, today) };
    });
  }, [scores, today, pulse.score]);

  const weekStart = addDays(today, 1 - isoWeekday(today));
  const review = useMemo(
    () =>
      weeklyReview({
        scores: scores.filter((r) => r.score != null).map((r) => ({ day: r.day, score: r.score as number })),
        tasks,
        checkins,
        tz,
        weekStart,
      }),
    [scores, tasks, checkins, tz, weekStart],
  );

  const grid = useMemo(() => energyByHourWeekday(checkins, tz), [checkins, tz]);
  const insight = energyInsight(grid);
  const energyWindows = useMemo(() => suggestEnergyWindows(checkins, tz), [checkins, tz]);
  const bestWindows = useMemo(
    () => suggestFromBestHours(tasks.filter((t) => t.status === "done" && t.done_at).map((t) => t.done_at as string), tz, new Date(now)),
    [tasks, tz, now],
  );
  const estimates = useMemo(() => {
    const focusByTask = new Map<string, number>();
    for (const e of events) {
      if (e.kind === "focus_ended" && e.task_id) focusByTask.set(e.task_id, (focusByTask.get(e.task_id) ?? 0) + Number((e.meta as { minutes?: number } | null)?.minutes ?? 0));
    }
    const samples = tasks
      .filter((t) => t.status === "done" && t.estimate_min && focusByTask.get(t.id))
      .sort((a, b) => (a.done_at ?? "").localeCompare(b.done_at ?? ""))
      .map((t) => ({ estimate_min: t.estimate_min as number, actual_min: focusByTask.get(t.id) as number }));
    return estimateLearning(samples);
  }, [events, tasks]);

  const cells = useMemo(
    () =>
      WD.map((_, wd) =>
        PERIODS.map((p) => {
          let sum = 0;
          let n = 0;
          for (let h = p.from; h < p.to; h++) {
            const c = grid[wd][h];
            sum += c.avg * c.n;
            n += c.n;
          }
          return n ? { avg: sum / n, n } : null;
        }),
      ),
    [grid],
  );

  const adjustEstimates = () => {
    const open = tasks.filter((t) => (t.status === "todo" || t.status === "waiting") && t.estimate_min);
    for (const t of open) void store.updateTask(t.id, { estimate_min: Math.max(5, Math.round(((t.estimate_min as number) * estimates.ratio) / 5) * 5) }, { quiet: true });
    store.toast(`Adjusted ${open.length} estimates by x${estimates.ratio.toFixed(1)}.`, { otto: true });
  };

  return (
    <div className="safe-top mx-auto max-w-5xl px-4 [--pad-top:1rem] pb-10 sm:px-6 md:px-8 md:[--pad-top:1.5rem]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Goals</h1>
        <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-line bg-panel px-3.5 text-[15px] hoverable md:hidden">
          <IconSettings size={18} /> Settings
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <GoalCard />
          <Card aria-label="Momentum">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-medium text-muted">Score, last 14 days</h2>
                <p className="mt-1 text-[15px]">
                  Momentum <span className="num font-semibold">{pulse.momentum}</span>{" "}
                  <span className="text-muted">{pulse.trend === "up" ? "rising" : pulse.trend === "down" ? "slipping" : "steady"}</span>
                </p>
              </div>
              <p className="flex items-center gap-1.5 text-[15px] font-medium text-fire-ink">
                <IconFlame size={18} /> <span className="num">{pulse.streak}</span> {pulse.streak === 1 ? "day" : "days"}
              </p>
            </div>
            <div className="mt-6">
              <ScoreHistory days={history} />
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card aria-label="This week">
            <h2 className="text-[15px] font-medium text-muted">This week</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-[13px] text-muted">Done</dt>
                <dd className="num text-[24px] font-semibold">{review.doneCount}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Average score</dt>
                {review.avgScore != null ? (
                  <dd className="num text-[24px] font-semibold text-fire-ink">{review.avgScore}</dd>
                ) : (
                  <dd className="text-[17px] font-semibold text-muted">Not yet</dd>
                )}
              </div>
              <div>
                <dt className="text-[13px] text-muted">Best day</dt>
                <dd className="text-[17px] font-semibold">{review.bestDay ? relativeDayLabel(review.bestDay.day, today) : "Not yet"}</dd>
              </div>
            </dl>
            <OttoLine className="mt-4">{review.line}</OttoLine>
          </Card>

          <Card aria-label="Energy">
            <h2 className="text-[15px] font-medium text-muted">Your energy</h2>
            <p className="mt-1 text-[15px]">{insight ?? "Check in a few times a day and Otto learns when you're sharpest."}</p>
            <div className="mt-3 grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-[2px] text-[11px]" role="img" aria-label="Average energy by weekday and time of day">
              <span />
              {WD.map((d) => (
                <span key={d} className="pb-1 text-center text-muted">
                  {d}
                </span>
              ))}
              {PERIODS.map((p, pi) => (
                <div key={p.label} className="contents">
                  <span className="pr-2 text-muted">{p.label}</span>
                  {WD.map((d, wi) => {
                    const c = cells[wi][pi];
                    return (
                      <span
                        key={d}
                        title={c ? `${d} ${p.label.toLowerCase()}: ${c.avg >= 1.5 ? "Charged" : c.avg <= 0.5 ? "Low" : "Okay"} (${c.n})` : `${d} ${p.label.toLowerCase()}: no check-ins`}
                        className="h-7 rounded-[4px]"
                        style={{ background: c ? `color-mix(in oklab, var(--accent) ${Math.round(15 + (c.avg / 2) * 80)}%, var(--panel-2))` : "var(--panel-2)" }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">Darker green means more charged.</p>
            {energyWindows && (
              <div className="mt-4 rounded-[14px] bg-accent-soft p-3">
                <OttoLine>Your check-ins say you&apos;re sharpest {windowsLabel(energyWindows)}. Use that for deep work?</OttoLine>
                <Button size="sm" variant="primary" className="mt-2" onClick={() => void store.updateSettings({ energy_windows: energyWindows })}>
                  Use these windows
                </Button>
              </div>
            )}
            {bestWindows && !energyWindows && (
              <div className="mt-4 rounded-[14px] bg-accent-soft p-3">
                <OttoLine>You finish the most around {windowsLabel(bestWindows)}. Make that your deep work time?</OttoLine>
                <Button size="sm" variant="primary" className="mt-2" onClick={() => void store.updateSettings({ energy_windows: bestWindows })}>
                  Use these windows
                </Button>
              </div>
            )}
          </Card>

          <Card aria-label="Estimates">
            <h2 className="text-[15px] font-medium text-muted">Estimates</h2>
            {estimates.n === 0 ? (
              <p className="mt-1 text-[15px]">Use the focus timer on tasks with estimates. After 20, Otto checks how close your guesses are.</p>
            ) : estimates.suggest ? (
              <>
                <OttoLine className="mt-2">
                  Tasks take x{estimates.ratio.toFixed(1)} your estimate, over {estimates.n} tasks. Adjust open estimates to match?
                </OttoLine>
                <Button size="sm" variant="primary" className="mt-3" onClick={adjustEstimates}>
                  Adjust estimates
                </Button>
              </>
            ) : (
              <p className="mt-1 text-[15px]">
                Your estimates run x{estimates.ratio.toFixed(1)} over {estimates.n} tasks.{" "}
                {estimates.n < 20 ? `${20 - estimates.n} more and Otto can suggest a fix.` : "That's close enough."}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
