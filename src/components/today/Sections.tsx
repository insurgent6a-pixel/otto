"use client";

import { useEffect, useMemo, useState } from "react";
import { store, useOtto } from "@/lib/store";
import { planToday } from "@/lib/actions";
import type { RankedTask, TodayModel } from "@/engine/today";
import { blocksForDay } from "@/engine/schedule";
import { localDate, localTime } from "@/engine/time";
import { pickScoreMessage, progressLine } from "@/engine/messages";
import { scoreStreakAbove } from "@/engine/daily";
import { durationLabel } from "@/engine/format";
import { Button, Card, Empty, Fold, LinkButton, OttoLine, cx } from "../ui";
import { TaskRow } from "../TaskRow";
import { IconFlame, IconLock, IconPin } from "../Icons";
import { usePulse } from "../usePulse";
import Link from "next/link";

export function UpNext({ items }: { items: RankedTask[] }) {
  return (
    <Card className="mt-3 !p-3 sm:!p-4" aria-label="Up next">
      <h2 className="px-1 text-[15px] font-medium text-muted">Up next</h2>
      {items.length ? (
        <ul className="mt-1">
          {items.map((r) => (
            <TaskRow key={r.task.id} task={r.task} time={r.time} compact showTomorrow={false} />
          ))}
        </ul>
      ) : (
        <p className="px-1 py-2 text-[15px] text-muted">Nothing after this one. Finish it and the day is clear.</p>
      )}
      <p className="mt-1 px-1 text-[13px] text-muted">Otto keeps the order. You only need the green card.</p>
    </Card>
  );
}

export function TodayFolds({ model }: { model: TodayModel }) {
  return (
    <div className="mt-3 space-y-3">
      <Fold
        title="Needs a quick decision"
        count={model.triage.length}
        tone={model.triage.length ? "late" : "default"}
        storageKey="triage"
        hint={<p className="mb-2 text-[14px] text-muted">No stress, just pick one.</p>}
      >
        {model.triage.length ? (
          <ul className="space-y-2">
            {model.triage.map((t) => (
              <li key={t.id} className="list-none rounded-[14px] border border-line p-3">
                <TaskRowLite id={t.id} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => planToday(t)}>
                    Do it today
                  </Button>
                  <Button size="sm" onClick={() => store.openSheet({ kind: "edit", taskId: t.id })}>
                    Pick a new date
                  </Button>
                  <Button size="sm" onClick={() => store.openSheet({ kind: "handoff", taskId: t.id })}>
                    Hand it off
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void store.dropTask(t.id)}>
                    Drop it
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">Nothing overdue. Clean slate.</p>
        )}
      </Fold>
      <Fold title="Waiting on others" count={model.waiting.length} storageKey="waiting">
        {model.waiting.length ? (
          <ul>
            {model.waiting.map((t) => (
              <TaskRow key={t.id} task={t} showTomorrow={false} />
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">Nobody owes you anything right now.</p>
        )}
      </Fold>
      <Fold title="Done today" count={model.doneToday.length} tone={model.doneToday.length ? "accent" : "default"} storageKey="done">
        {model.doneToday.length ? (
          <ul>
            {model.doneToday.map((t) => (
              <TaskRow key={t.id} task={t} showTomorrow={false} />
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">Your first one lands here. Hit Done on the green card.</p>
        )}
      </Fold>
    </div>
  );
}

function TaskRowLite({ id }: { id: string }) {
  const task = useOtto((s) => s.tasks.find((t) => t.id === id));
  if (!task) return null;
  return (
    <ul>
      <TaskRow task={task} showTomorrow={false} />
    </ul>
  );
}

function Gauge({ score }: { score: number }) {
  const r = 52;
  const len = Math.PI * r;
  const v = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative h-[86px] w-[140px] shrink-0">
      <svg viewBox="0 0 140 80" width="140" height="80" aria-hidden="true">
        <path d={`M 18 72 A ${r} ${r} 0 0 1 122 72`} fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M 18 72 A ${r} ${r} 0 0 1 122 72`}
          fill="none"
          stroke="var(--fire)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - v)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="num text-[30px] leading-none font-semibold text-fire-ink">{score}</p>
        <p className="brand mt-1 text-[9px] text-muted">SCORE</p>
      </div>
    </div>
  );
}

/** Small seeded PRNG so a message pick is stable for a given day and band. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Score message: stable per day and band, and the history persists so it never repeats. */
function useScoreMessage(score: number, delta: number | null, streakDays: number) {
  const settings = useOtto((s) => s.settings);
  const goals = useOtto((s) => s.goals);
  const now = useOtto((s) => s.now);
  const scores = useOtto((s) => s.scores);
  const tz = settings.timezone;
  const today = localDate(now, tz);
  const goal = goals.find((g) => g.is_current)?.name ?? null;
  const band = score >= 70 ? "high" : score >= 40 ? "mid" : "low";
  // Snapshot at mount: writing the pick back to memory must not re-pick a different line.
  const [memory] = useState(() => settings.state ?? {});
  const lastDayLow = (scores.filter((r) => r.day < today && r.score != null).at(-1)?.score ?? 100) < 40;
  const picked = useMemo(
    () =>
      pickScoreMessage({
        score,
        delta,
        streakDays,
        goal,
        tone: settings.tone,
        recent: memory.recent ?? [],
        toughLoveUsedToday: memory.tough_love_day === today,
        justCompleted: false,
        lastDayLow,
        rand: seeded(`${today}:${band}`),
      }),
    [score, delta, streakDays, goal, settings.tone, memory, today, band, lastDayLow],
  );
  useEffect(() => {
    if (!picked.text) return;
    const mem = store.state.settings.state ?? {};
    void store.remember({
      recent: [...(mem.recent ?? []), picked.text].slice(-5),
      ...(picked.toughLove ? { tough_love_day: today } : {}),
    });
    // Remember once per band and day, not on every score tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, today]);
  return picked.text;
}

export function YourDay() {
  const p = usePulse();
  const scores = useOtto((s) => s.scores);
  const delta = p.yesterdayScore != null ? p.score - p.yesterdayScore : null;
  const streakAbove = useMemo(
    () => scoreStreakAbove(scores.filter((r) => r.score != null).map((r) => ({ day: r.day, score: r.score as number }))),
    [scores],
  );
  const message = useScoreMessage(p.score, delta, streakAbove);
  const steps = Math.max(p.dailyGoal, 1);
  return (
    <Card aria-label="Your day">
      <h2 className="text-[15px] font-medium text-muted">Your day</h2>
      <div className="mt-2 flex items-center gap-4">
        <Gauge score={p.score} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold">
            <span className="num">{p.doneCount}</span> of <span className="num">{p.dailyGoal}</span> done
          </p>
          <div className="mt-2 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: Math.min(steps, 8) }, (_, i) => (
              <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i < p.doneCount ? "var(--sun)" : "var(--line)" }} />
            ))}
          </div>
          <p className="mt-2 text-[14px] text-muted">{progressLine(p.doneCount, p.dailyGoal)}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[15px] font-medium text-fire-ink">
        <IconFlame size={18} /> <span className="num">{p.streak}</span> {p.streak === 1 ? "day" : "days"} in a row
      </p>
      {message && <OttoLine className="mt-3">{message}</OttoLine>}
    </Card>
  );
}

export function TodayPlan({ defaultOpen }: { defaultOpen: boolean }) {
  const blocks = useOtto((s) => s.blocks);
  const tasks = useOtto((s) => s.tasks);
  const busy = useOtto((s) => s.busy);
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const today = localDate(now, tz);
  const rows = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const items: { key: string; start: string; end: string; title: string; kind: "block" | "timed" | "busy"; pinned?: boolean; forced?: boolean; done?: boolean; taskId?: string }[] = [];
    for (const b of blocksForDay(blocks, today, tz)) {
      const t = byId.get(b.task_id);
      if (!t || t.status === "dropped") continue;
      items.push({ key: b.id, start: b.start_at, end: b.end_at, title: t.title, kind: "block", pinned: b.pinned, forced: b.source === "force", done: t.status === "done", taskId: t.id });
    }
    for (const t of tasks) {
      if (t.scheduled_at && localDate(t.scheduled_at, tz) === today && t.status !== "dropped") {
        const end = new Date(new Date(t.scheduled_at).getTime() + (t.estimate_min ?? 30) * 60000).toISOString();
        items.push({ key: `at-${t.id}`, start: t.scheduled_at, end, title: t.title, kind: "timed", done: t.status === "done", taskId: t.id });
      }
    }
    for (const b of busy) {
      if (localDate(b.start_at, tz) === today) items.push({ key: `busy-${b.id}`, start: b.start_at, end: b.end_at, title: b.title, kind: "busy" });
    }
    return items.sort((a, b) => a.start.localeCompare(b.start));
  }, [blocks, tasks, busy, tz, today]);

  const total = rows.filter((r) => r.kind !== "busy").reduce((s, r) => s + (new Date(r.end).getTime() - new Date(r.start).getTime()) / 60000, 0);

  return (
    <Fold title="Today's plan" count={rows.length} defaultOpen={defaultOpen} storageKey={defaultOpen ? undefined : "plan"}>
      {rows.length ? (
        <>
          <p className="mb-2 text-[13px] text-muted">{durationLabel(Math.round(total))} planned</p>
          <ol className="space-y-1.5">
            {rows.map((r) => {
              const past = new Date(r.end).getTime() < now;
              return (
                <li key={r.key} className={cx("flex items-stretch gap-3", (past || r.done) && "opacity-55")}>
                  <span className="num w-12 shrink-0 pt-2 text-[13px] text-muted">{localTime(r.start, tz)}</span>
                  <button
                    type="button"
                    disabled={!r.taskId}
                    onClick={() => r.taskId && store.openSheet({ kind: "edit", taskId: r.taskId })}
                    className={cx(
                      "flex min-h-11 flex-1 items-center gap-2 rounded-[12px] border-l-[3px] px-3 py-2 text-left text-[15px]",
                      r.kind === "busy" ? "border-muted bg-panel-2 text-muted" : r.kind === "timed" ? "border-ok bg-accent-soft" : "border-sun bg-panel-2",
                    )}
                  >
                    <span className={cx("min-w-0 flex-1 truncate", r.done && "line-through")}>{r.title}</span>
                    {r.forced && <IconLock size={14} className="text-fire-ink" aria-label="Locked in" />}
                    {r.pinned && !r.forced && <IconPin size={14} className="text-muted" aria-label="Pinned" />}
                    <span className="num text-[12px] text-muted">{localTime(r.end, tz)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <Empty>No blocks today. Otto fills the plan as you add tasks with estimates.</Empty>
      )}
      <div className="mt-2">
        <Link href="/calendar?view=week" className="inline-flex min-h-11 items-center text-[15px] font-medium text-accent">
          Open the week
        </Link>
      </div>
    </Fold>
  );
}

export function FocusBar() {
  return (
    <div className="mt-3 flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-[16px] border border-dashed border-line px-4 py-2 text-[14px] text-muted">
      <span>Everything else is hidden. Just this one.</span>
      <LinkButton onClick={() => store.setFocusMode(false)}>Show everything</LinkButton>
    </div>
  );
}
