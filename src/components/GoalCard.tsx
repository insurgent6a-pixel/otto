"use client";

import { useState } from "react";
import { store, useOtto } from "@/lib/store";
import { formatIdr, parseIdr } from "@/engine/money";
import { Button, Card, Fold, LinkButton, inputClass, Field, cx } from "./ui";

const IDEAS = ["Trip to Japan", "New MacBook", "Emergency fund", "Own studio", "Dream car"];

function GoalForm({
  initial,
  onDone,
  submitLabel = "Save goal",
}: {
  initial?: { id: string; name: string; target_idr: number | null };
  onDone?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.target_idr ? formatIdr(initial.target_idr) : "");
  const [err, setErr] = useState<string | null>(null);
  const parsed = amount.trim() ? parseIdr(amount) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Name your goal first. Pick a chip if you're stuck.");
    if (amount.trim() && parsed == null) return setErr("Couldn't read that amount. Try 50jt, 750rb or Rp 50.000.000.");
    setErr(null);
    const ok = await store.saveGoal({ id: initial?.id, name: name.trim(), target_idr: parsed, makeCurrent: !initial });
    if (ok) onDone?.();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Your goal">
        <input className={inputClass} placeholder="Your dream goal here" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {!initial && (
        <div className="flex flex-wrap gap-2" aria-label="Ideas">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setName(idea)}
              className={cx(
                "min-h-10 rounded-full border px-3.5 text-[14px] transition-[background-color,border-color] duration-150",
                name === idea ? "border-accent bg-accent-soft" : "border-line hoverable",
              )}
            >
              {idea}
            </button>
          ))}
        </div>
      )}
      <Field label="Target amount (optional)" hint={parsed != null ? formatIdr(parsed) : "Type 50jt, 750rb or Rp 50.000.000."}>
        <input className={`${inputClass} num`} inputMode="text" placeholder="50jt" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {err && <p className="text-[14px] text-late" role="alert">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
        {initial && (
          <Button onClick={onDone} variant="ghost">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function AddSaved({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const parsed = parseIdr(amount);
  if (!open) return <LinkButton onClick={() => setOpen(true)}>Add saved amount</LinkButton>;
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed == null) return;
        void store.addSaved(goalId, parsed);
        setAmount("");
        setOpen(false);
      }}
    >
      <input autoFocus className={`${inputClass} num`} placeholder="500rb" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount saved" />
      <Button type="submit" variant="primary" disabled={parsed == null}>
        Add
      </Button>
    </form>
  );
}

export function GoalCard() {
  const goals = useOtto((s) => s.goals);
  const [editing, setEditing] = useState(false);
  const [newDream, setNewDream] = useState("");
  const current = goals.find((g) => g.is_current) ?? null;

  if (!current && !goals.length) {
    return (
      <Card aria-label="Goal">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">What are you working toward?</h2>
        <p className="mt-1 mb-4 text-[15px] text-muted">Pick something that makes the boring tasks worth it. Change it any time.</p>
        <GoalForm />
      </Card>
    );
  }

  const pct = current?.target_idr ? Math.min(100, Math.round((current.saved_idr / current.target_idr) * 100)) : null;

  return (
    <Card aria-label="Goal">
      {current ? (
        editing ? (
          <>
            <h2 className="mb-3 text-[15px] font-medium text-muted">Edit goal</h2>
            <GoalForm initial={current} onDone={() => setEditing(false)} submitLabel="Save changes" />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-medium text-muted">Working toward</h2>
              <LinkButton onClick={() => setEditing(true)}>Edit</LinkButton>
            </div>
            <p className="text-[22px] leading-tight font-semibold tracking-[-0.015em]">{current.name}</p>
            {current.target_idr ? (
              <div className="mt-3">
                <div className="h-3 overflow-hidden rounded-full bg-sun-soft" role="progressbar" aria-label={`Saved toward ${current.name}`} aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-sun transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="num text-[17px] font-semibold">{formatIdr(current.saved_idr)}</p>
                  <p className="num text-[13px] text-muted">
                    {pct}% of {formatIdr(current.target_idr)}
                  </p>
                </div>
                {current.reached_at && <p className="mt-2 text-[15px] font-medium text-ok">You did it. Pick the next one from your bucket list.</p>}
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-muted">Add a target amount to see a progress bar.</p>
            )}
            <AddSaved goalId={current.id} />
          </>
        )
      ) : (
        <>
          <h2 className="text-[19px] font-semibold">Pick what you&apos;re working toward</h2>
          <p className="mt-1 text-[15px] text-muted">Choose one from your bucket list below.</p>
        </>
      )}

      <Fold title="Bucket list" count={goals.length} className="mt-4 !border-line bg-panel-2" storageKey="bucket">
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex min-h-11 list-none items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {g.name}
                {g.target_idr ? <span className="num ml-2 text-[13px] text-muted">{formatIdr(g.target_idr)}</span> : null}
              </span>
              {g.is_current ? (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-accent">current</span>
              ) : (
                <LinkButton className="text-[14px]" onClick={() => void store.makeGoalCurrent(g.id)}>
                  Work toward this
                </LinkButton>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newDream.trim()) return;
            void store.saveGoal({ name: newDream.trim(), target_idr: null, makeCurrent: !current });
            setNewDream("");
          }}
        >
          <input className={inputClass} placeholder="Add another dream" value={newDream} onChange={(e) => setNewDream(e.target.value)} aria-label="Add another dream" />
          <Button type="submit" disabled={!newDream.trim()}>
            Add
          </Button>
        </form>
      </Fold>
    </Card>
  );
}
