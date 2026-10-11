"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { store, useOtto } from "@/lib/store";
import { completeWithReward, postpone, startTimer } from "@/lib/actions";
import { similarity } from "@/engine/fuzzy";
import { IconSearch } from "./Icons";
import { Sheet, cx } from "./ui";

const VIEWS = ["/", "/calendar", "/waiting", "/goals"];

function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function rowIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-task-id]"))
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.dataset.taskId!)
    .filter((id, i, all) => all.indexOf(id) === i);
}

export function useShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.state;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.set({ paletteOpen: !s.paletteOpen });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e) || s.sheet || s.paletteOpen) return;
      const selected = s.tasks.find((t) => t.id === s.selectedId) ?? null;
      switch (e.key) {
        case "n":
        case "N":
        case "/":
          e.preventDefault();
          store.openSheet({ kind: "add" });
          break;
        case "j":
        case "k": {
          const ids = rowIds();
          if (!ids.length) break;
          const i = s.selectedId ? ids.indexOf(s.selectedId) : -1;
          const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === "j" ? 1 : -1)))];
          store.set({ selectedId: next });
          document.querySelector(`[data-task-id="${next}"]`)?.scrollIntoView({ block: "nearest" });
          break;
        }
        case "d":
          if (selected && selected.status !== "done") completeWithReward(selected, document.querySelector(`[data-task-id="${selected.id}"]`));
          break;
        case "t":
          if (selected && selected.status === "todo" && !selected.forced) postpone(selected, "tomorrow");
          break;
        case "e":
          if (selected) store.openSheet({ kind: "edit", taskId: selected.id });
          break;
        case "f":
          store.setFocusMode(!s.focusMode);
          break;
        case "?":
          store.set({ helpOpen: true });
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          router.push(VIEWS[Number(e.key) - 1]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useOtto((s) => s.paletteOpen);
  const tasks = useOtto((s) => s.tasks);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const close = () => {
    store.set({ paletteOpen: false });
    setQ("");
    setActive(0);
  };

  const commands = useMemo<Command[]>(() => {
    const go = (path: string, label: string): Command => ({ id: `go-${path}`, label: `Go to ${label}`, run: () => router.push(path) });
    const base: Command[] = [
      { id: "add", label: "Add a task", hint: "N", run: () => store.openSheet({ kind: "add" }) },
      go("/", "Today"),
      go("/calendar", "Calendar"),
      go("/calendar?view=week", "Week timeline"),
      go("/waiting", "Waiting"),
      go("/goals", "Goals"),
      go("/all", "All tasks"),
      go("/settings", "Settings"),
      { id: "focus", label: "Toggle Just this one", hint: "F", run: () => store.setFocusMode(!store.state.focusMode) },
      { id: "timer5", label: "Start a 5 minute timer", run: () => startTimer(null, 5) },
      { id: "e-low", label: "Energy: Low", run: () => void store.checkIn("low") },
      { id: "e-ok", label: "Energy: Okay", run: () => void store.checkIn("ok") },
      { id: "e-high", label: "Energy: Charged", run: () => void store.checkIn("high") },
      { id: "theme-light", label: "Theme: Solarpunk Day", run: () => store.setTheme("light") },
      { id: "theme-dark", label: "Theme: Forest Night", run: () => store.setTheme("dark") },
      { id: "theme-system", label: "Theme: follow the system", run: () => store.setTheme("system") },
      { id: "help", label: "Keyboard shortcuts", hint: "?", run: () => store.set({ helpOpen: true }) },
    ];
    const open = tasks
      .filter((t) => t.status === "todo" || t.status === "waiting")
      .map<Command>((t) => ({
        id: t.id,
        label: t.title,
        hint: t.status === "waiting" ? "Waiting" : "Task",
        run: () => store.openSheet({ kind: "edit", taskId: t.id }),
      }));
    return [...base, ...open];
  }, [tasks, router]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands.slice(0, 12);
    return commands
      .map((c) => ({ c, s: c.label.toLowerCase().includes(term) ? 1 + 1 / c.label.length : similarity(term, c.label) }))
      .filter((x) => x.s > 0.35)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.c);
  }, [q, commands]);

  if (!open) return null;
  return (
    <Sheet open onClose={close} title="Jump to">
      <div className="flex items-center gap-2 rounded-[13px] border border-line bg-panel-2 px-3">
        <IconSearch size={18} className="text-muted" />
        <input
          autoFocus
          className="min-h-12 flex-1 bg-transparent text-[17px] focus:outline-none"
          placeholder="Search tasks and actions"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && results[active]) {
              const cmd = results[active];
              close();
              cmd.run();
            }
          }}
          aria-label="Search"
        />
      </div>
      <ul className="mt-2 pb-2" role="listbox">
        {results.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                close();
                c.run();
              }}
              className={cx("flex min-h-11 w-full items-center gap-3 rounded-[11px] px-3 text-left text-[15px]", i === active && "bg-accent-soft")}
            >
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.hint && <span className="text-[12px] text-muted">{c.hint}</span>}
            </button>
          </li>
        ))}
        {!results.length && <li className="px-3 py-4 text-[15px] text-muted">No match. Press N to add it as a task.</li>}
      </ul>
    </Sheet>
  );
}

const KEYS: [string, string][] = [
  ["N or /", "Add a task"],
  ["J / K", "Move down and up"],
  ["D", "Done"],
  ["T", "Tomorrow"],
  ["E", "Edit"],
  ["F", "Just this one"],
  ["Ctrl or Cmd + K", "Jump to anything"],
  ["1 to 4", "Today, Calendar, Waiting, Goals"],
  ["?", "This list"],
];

export function HelpOverlay() {
  const open = useOtto((s) => s.helpOpen);
  if (!open) return null;
  return (
    <Sheet open onClose={() => store.set({ helpOpen: false })} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 pb-3 text-[15px]">
        {KEYS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="num rounded-[8px] border border-line bg-panel-2 px-2 py-0.5 text-[13px]">{k}</kbd>
            </dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
