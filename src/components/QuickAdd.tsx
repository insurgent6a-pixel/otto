"use client";

import { useMemo, useRef, useState } from "react";
import { store, useOtto } from "@/lib/store";
import { parseQuickAdd, type Chip } from "@/engine/parse";
import { Button, Sheet, cx } from "./ui";
import { IconMic } from "./Icons";

const CHIP_COLOR: Partial<Record<Chip["kind"], string>> = {
  deadline: "var(--late)",
  scheduled: "var(--ok)",
  followup: "var(--plum)",
  waiting: "var(--plum)",
  ready: "var(--amber)",
  priority: "var(--fire)",
  value: "var(--amber)",
};

export function ChipList({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Otto understood">
      {chips.map((c, i) => (
        <li
          key={i}
          className="flex h-7 list-none items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2.5 text-[13px]"
        >
          <span className="size-1.5 rounded-full" style={{ background: CHIP_COLOR[c.kind] ?? "var(--accent)" }} aria-hidden="true" />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export function QuickAddSheet({ preset, onClose }: { preset?: string; onClose: () => void }) {
  const tz = useOtto((s) => s.settings.timezone);
  const tasks = useOtto((s) => s.tasks);
  const [text, setText] = useState(preset ? `${preset} ` : "");
  const [busy, setBusy] = useState(false);
  const [dupDecision, setDupDecision] = useState<"keep" | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = useMemo(() => tasks.filter((t) => t.status === "todo" || t.status === "waiting").map((t) => ({ id: t.id, title: t.title })), [tasks]);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, { now: new Date(), tz, openTasks: open }) : null), [text, tz, open]);
  const duplicate = parsed?.duplicate && dupDecision !== "keep" ? parsed.duplicate : null;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsed || !parsed.title.trim() || busy) return;
    setBusy(true);
    const raw = text.trim() !== parsed.title ? text.trim() : null;
    const saved = await store.addTask({ ...parsed.fields, title: parsed.title, raw_text: raw, source: "app" });
    setBusy(false);
    if (saved) {
      store.toast(`Added: ${saved.title}.`, { otto: true, undo: () => void store.deleteTask(saved.id) });
      onClose();
    }
  };

  const merge = async () => {
    if (!parsed?.duplicate) return;
    const fields = parsed.fields;
    const ok = Object.keys(fields).length ? await store.updateTask(parsed.duplicate.id, fields) : true;
    if (ok) {
      store.toast(`Merged into "${parsed.duplicate.title}".`, { otto: true });
      onClose();
    }
  };

  return (
    <Sheet open onClose={onClose} title="What's on your mind?">
      <form onSubmit={submit}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            enterKeyHint="done"
            className="min-h-12 w-full rounded-[13px] border border-line bg-panel-2 px-3.5 text-[17px] focus:border-accent focus:outline-none"
            placeholder="Navaho payments fri !1 ~30m"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDupDecision(null);
            }}
            aria-label="Task"
          />
          <button
            type="button"
            aria-label="Dictate"
            onClick={() => {
              inputRef.current?.focus();
              setHint("Tap the mic on your keyboard and talk. Otto sorts it out.");
            }}
            className="grid size-12 shrink-0 place-items-center rounded-[13px] border border-line text-accent hoverable"
          >
            <IconMic size={22} />
          </button>
        </div>
        <p className="mt-2 text-[14px] text-muted">{hint ?? "Just get it out of your head. Otto sorts it later."}</p>
        {parsed && (parsed.chips.length > 0 || parsed.title !== text.trim()) && (
          <div className="mt-3 space-y-2">
            <p className="text-[15px]">
              <span className="text-muted">Saves as </span>
              <span className="font-medium">{parsed.title || "..."}</span>
            </p>
            <ChipList chips={parsed.chips} />
          </div>
        )}
        {duplicate && (
          <div className="mt-3 rounded-[14px] border border-line bg-panel-2 p-3">
            <p className="text-[15px]">Looks like &lsquo;{duplicate.title}&rsquo;. Merge or keep both?</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="soft" onClick={() => void merge()}>
                Merge
              </Button>
              <Button size="sm" onClick={() => setDupDecision("keep")}>
                Keep both
              </Button>
            </div>
          </div>
        )}
        <Button type="submit" variant="primary" size="lg" className={cx("mt-4 w-full")} disabled={!parsed?.title.trim() || busy}>
          {busy ? "Adding..." : "Add it"}
        </Button>
      </form>
    </Sheet>
  );
}
