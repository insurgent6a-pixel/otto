"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { store, useOtto } from "@/lib/store";
import { completeWithReward, postpone, startTimer } from "@/lib/actions";
import { effectiveStartBy } from "@/engine/startby";
import { localDate, localTime, zonedInstant } from "@/engine/time";
import { formatIdr, parseIdr } from "@/engine/money";
import { parseQuickAdd } from "@/engine/parse";
import { describeRrule } from "@/engine/repeat";
import { scoreTask, reasonLine } from "@/engine/score";
import { PROJECTS, type Project, type Task, type Status } from "@/engine/types";
import { projectName } from "@/engine/format";
import { Button, Field, LinkButton, OttoLine, Segmented, Toggle, cx, inputClass } from "./ui";
import { IconCheck, IconPlay } from "./Icons";
import { FromClaude } from "./today/NextCard";

function useField<T>(value: T) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}

function TextField({
  label,
  value,
  onSave,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useField(value ?? "");
  const commit = () => {
    const v = draft.trim();
    if (v !== (value ?? "")) onSave(v || null);
  };
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <textarea className={`${inputClass} min-h-24 py-2`} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      ) : (
        <input
          className={inputClass}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
    </Field>
  );
}

function DateField({ label, value, onSave, hint }: { label: string; value: string | null; onSave: (v: string | null) => void; hint?: React.ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input type="date" className={`${inputClass} num`} value={value ?? ""} onChange={(e) => onSave(e.target.value || null)} />
        {value && (
          <Button variant="ghost" onClick={() => onSave(null)} aria-label={`Clear ${label}`}>
            Clear
          </Button>
        )}
      </div>
    </Field>
  );
}

export function TaskEditor({ task, onClose, compactHeader }: { task: Task; onClose?: () => void; compactHeader?: boolean }) {
  const settings = useOtto((s) => s.settings);
  const tasks = useOtto((s) => s.tasks);
  const now = useOtto((s) => s.now);
  const tz = settings.timezone;
  const doneRef = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = (patch: Partial<Task>) => void store.updateTask(task.id, patch);
  const startBy = effectiveStartBy(task);
  const today = localDate(now, tz);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const result = scoreTask(task, new Date(now), { settings, tasksById });
  const deps = task.depends_on.map((id) => tasksById.get(id)).filter(Boolean) as Task[];
  const others = tasks.filter((t) => t.id !== task.id && (t.status === "todo" || t.status === "waiting") && !task.depends_on.includes(t.id));
  const [valueDraft, setValueDraft] = useField(task.value_idr ? formatIdr(task.value_idr) : "");
  const [repeatDraft, setRepeatDraft] = useField(task.rrule ? describeRrule(task.rrule) : "");
  const [repeatErr, setRepeatErr] = useState<string | null>(null);
  const open = task.status === "todo" || task.status === "waiting";

  return (
    <div className="space-y-5 pb-2">
      {!compactHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <FromClaude createdAt={task.created_at} source={task.source} />
          {task.forced && <span className="rounded-full bg-fire-soft px-2.5 py-0.5 text-[12px] font-medium text-fire">Locked in</span>}
          {result.blocked && <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-[12px] text-muted">Waiting on another task</span>}
        </div>
      )}
      <TextField label="Task" value={task.title} onSave={(v) => v && save({ title: v })} />
      {open && result.reasons.length > 0 && <OttoLine className="text-[14px] text-muted">{reasonLine(result)}.</OttoLine>}

      <div className="grid grid-cols-2 gap-2">
        {open ? (
          <Button ref={doneRef} variant="primary" onClick={() => { completeWithReward(task, doneRef.current); onClose?.(); }}>
            <IconCheck size={18} strokeWidth={2.4} /> Done
          </Button>
        ) : (
          <Button variant="soft" onClick={() => save({ status: "todo" })}>
            Reopen
          </Button>
        )}
        {task.status === "todo" && !task.forced ? (
          <Button onClick={() => { postpone(task, "tomorrow"); onClose?.(); }}>Move to tomorrow</Button>
        ) : task.status === "waiting" ? (
          <Button onClick={() => save({ status: "todo" })}>It came back</Button>
        ) : (
          <span />
        )}
        {open && (
          <>
            <Button onClick={() => { store.openSheet({ kind: "too_big", taskId: task.id }); }}>Too big?</Button>
            <Button onClick={() => store.openSheet({ kind: "handoff", taskId: task.id })}>Hand it off</Button>
          </>
        )}
      </div>

      {open && (
        <div>
          <p className="mb-1.5 text-[14px] font-medium text-muted">Focus timer</p>
          <div className="flex gap-2">
            {[15, 25, 50].map((m) => (
              <Button key={m} size="sm" onClick={() => { startTimer(task, m); onClose?.(); }}>
                <IconPlay size={14} /> {m} min
              </Button>
            ))}
          </div>
        </div>
      )}

      <TextField label="First step" value={task.next_action} placeholder="Open the invoice template" onSave={(v) => save({ next_action: v })} />

      <Field label="Project">
        <Segmented<string>
          label="Project"
          value={task.project ?? "none"}
          options={[...PROJECTS.map((p) => ({ value: p, label: projectName(p) })), { value: "none", label: "Unsorted" }]}
          onChange={(v) => save({ project: v === "none" ? null : (v as Project) })}
        />
      </Field>

      <Field label="Priority">
        <Segmented<string>
          label="Priority"
          value={task.priority == null ? "none" : String(task.priority)}
          options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` })).concat([{ value: "none", label: "Unsorted" }])}
          onChange={(v) => save({ priority: v === "none" ? null : Number(v) })}
        />
      </Field>

      <Field label="Estimate">
        <div className="flex flex-wrap gap-2">
          <Segmented<string>
            label="Estimate"
            value={String(task.estimate_min ?? "none")}
            options={[15, 30, 60, 90, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m}m` : `${m / 60}h` })).concat([{ value: "none", label: "?" }])}
            onChange={(v) => save({ estimate_min: v === "none" ? null : Number(v) })}
          />
        </div>
      </Field>

      <Field label="Energy">
        <Segmented<string>
          label="Energy"
          value={task.energy ?? "any"}
          options={[
            { value: "high", label: "Deep work" },
            { value: "low", label: "Easy" },
            { value: "any", label: "Any" },
          ]}
          onChange={(v) => save({ energy: v === "any" ? null : (v as "high" | "low") })}
        />
      </Field>

      <div className="space-y-2">
        <DateField
          label="Deadline"
          value={task.deadline}
          onSave={(v) => save({ deadline: v, ...(v ? {} : { deadline_confirmed: false }) })}
          hint={task.deadline ? undefined : "No deadline yet. Otto never guesses one."}
        />
        {task.deadline && (
          <Toggle
            label="Firm deadline"
            hint={task.deadline_confirmed ? "Confirmed" : "Unconfirmed. Otto plans with extra buffer."}
            checked={task.deadline_confirmed}
            onChange={(v) => save({ deadline_confirmed: v })}
          />
        )}
      </div>

      <Field label="Start by">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className={`${inputClass} num max-w-[200px]`}
            value={startBy.date ?? ""}
            onChange={(e) => save({ start_by_manual: e.target.value || null })}
            aria-label="Start by"
          />
          {startBy.auto && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-accent">auto</span>}
          {task.start_by_manual && <LinkButton onClick={() => save({ start_by_manual: null })}>Reset to auto</LinkButton>}
          {!startBy.date && <span className="text-[13px] text-muted">Set a deadline and Otto picks one.</span>}
        </div>
      </Field>

      <Field label="Fixed time" hint={`Meetings and calls. Times are ${tz}.`}>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className={`${inputClass} num`}
            value={task.scheduled_at ? `${localDate(task.scheduled_at, tz)}T${localTime(task.scheduled_at, tz)}` : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return save({ scheduled_at: null });
              const [d, t] = v.split("T");
              save({ scheduled_at: zonedInstant(d, t, tz).toISOString() });
            }}
          />
          {task.scheduled_at && (
            <Button variant="ghost" onClick={() => save({ scheduled_at: null })}>
              Clear
            </Button>
          )}
        </div>
      </Field>

      <Field label="Status">
        <Segmented<Status>
          label="Status"
          value={task.status}
          options={[
            { value: "todo", label: "To do" },
            { value: "waiting", label: "Waiting" },
            { value: "done", label: "Done" },
            { value: "dropped", label: "Dropped" },
          ]}
          onChange={(v) =>
            save({
              status: v,
              ...(v === "waiting" && !task.follow_up ? { follow_up: localDate(Date.now() + settings.followup_days * 86400000, tz) } : {}),
            })
          }
        />
      </Field>

      {(task.status === "waiting" || task.waiting_on) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Waiting on" value={task.waiting_on} placeholder="Pak Arief" onSave={(v) => save({ waiting_on: v })} />
          <DateField label="Back on your list" value={task.follow_up} onSave={(v) => save({ follow_up: v })} />
        </div>
      )}
      {task.status !== "waiting" && !task.waiting_on && (
        <DateField label="Follow up" value={task.follow_up} onSave={(v) => save({ follow_up: v })} />
      )}
      <DateField label="Expected ready" value={task.ready_by} onSave={(v) => save({ ready_by: v })} hint="Compost batches and deliveries." />

      <Field label="Brings in" hint={task.value_idr ? "Counts toward your goal when it's done." : "Type 5jt or 750rb."}>
        <input
          className={`${inputClass} num`}
          value={valueDraft}
          placeholder="5jt"
          onChange={(e) => setValueDraft(e.target.value)}
          onBlur={() => {
            const v = valueDraft.trim() ? parseIdr(valueDraft) : null;
            if (valueDraft.trim() && v == null) return store.toast("Couldn't read that amount. Try 5jt or Rp 750.000.", { tone: "error" });
            if (v !== task.value_idr) save({ value_idr: v });
            setValueDraft(v ? formatIdr(v) : "");
          }}
        />
      </Field>

      <Field label="Repeats" hint={repeatErr ?? "Type every mon wed fri, every day or every 2 weeks."}>
        <input
          className={inputClass}
          value={repeatDraft}
          placeholder="every mon wed fri"
          onChange={(e) => {
            setRepeatDraft(e.target.value);
            setRepeatErr(null);
          }}
          onBlur={() => {
            const raw = repeatDraft.trim();
            if (!raw) return task.rrule && save({ rrule: null });
            if (task.rrule && raw === describeRrule(task.rrule)) return;
            const text = /^(every|setiap|tiap)\b/i.test(raw) ? raw : `every ${raw}`;
            const rule = parseQuickAdd(`x ${text}`, { now: new Date(), tz }).fields.rrule;
            if (!rule) return setRepeatErr("Couldn't read that. Try every mon wed fri.");
            save({ rrule: rule, series_id: task.series_id ?? task.id });
            setRepeatDraft(describeRrule(rule));
          }}
        />
      </Field>

      <Field label="After">
        <div className="space-y-2">
          {deps.map((d) => (
            <div key={d.id} className="flex min-h-11 items-center gap-2 rounded-[12px] border border-line px-3">
              <span className={cx("flex-1 text-[15px]", d.status === "done" && "text-muted line-through")}>{d.title}</span>
              <LinkButton onClick={() => save({ depends_on: task.depends_on.filter((x) => x !== d.id) })}>Remove</LinkButton>
            </div>
          ))}
          <select
            className={inputClass}
            value=""
            onChange={(e) => e.target.value && save({ depends_on: [...task.depends_on, e.target.value] })}
            aria-label="Add a task this one waits for"
          >
            <option value="">{deps.length ? "Also after..." : "Only after another task..."}</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <TextField label="Notes" value={task.notes} multiline onSave={(v) => save({ notes: v })} />

      {task.raw_text && (
        <div className="rounded-[12px] bg-panel-2 p-3 text-[14px] text-muted">
          <p className="font-medium">Original words ({task.source === "siri" ? "Siri" : task.source === "claude" ? "Claude" : "you"})</p>
          <p className="mt-1">{task.raw_text}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {task.status !== "dropped" && (
          <Button variant="danger" onClick={() => { void store.dropTask(task.id); onClose?.(); }}>
            Drop it
          </Button>
        )}
        {confirmDelete ? (
          <>
            <Button variant="danger" onClick={() => { void store.deleteTask(task.id); onClose?.(); }}>
              Delete forever
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="text-muted" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      {confirmDelete && <p className="text-[14px] text-late">Delete this? You can&apos;t undo it.</p>}
      <p className="text-[12px] text-muted">
        Added {localDate(task.created_at, tz) === today ? "today" : localDate(task.created_at, tz)}
        {task.postpone_count ? ` · postponed ${task.postpone_count}x` : ""}
      </p>
    </div>
  );
}
