"use client";

import { parseDate } from "@/engine/time";
import { relativeDayLabel } from "@/engine/format";
import { cx } from "../ui";
import { WEEKDAYS, monthGrid, type DayItems } from "./model";

type MarkKind = "due" | "unconfirmed" | "follow" | "ready" | "timed";

export function Mark({ kind }: { kind: MarkKind }) {
  const cls: Record<MarkKind, string> = {
    due: "size-[7px] rounded-[1.5px] bg-late",
    unconfirmed: "size-[7px] rounded-[1.5px] border border-dashed border-late",
    follow: "size-[7px] rounded-full border-[1.5px] border-plum",
    ready: "size-[6px] rounded-full bg-sun",
    timed: "h-[3px] w-[10px] rounded-full bg-ok",
  };
  return <span aria-hidden="true" className={cx("inline-block shrink-0", cls[kind])} />;
}

/** Up to four marks, one per kind. A day with only unconfirmed deadlines gets the dashed square. */
export function DayMarks({ items, className }: { items?: DayItems; className?: string }) {
  const kinds: MarkKind[] = [];
  if (items?.due.length) kinds.push(items.due.some((t) => t.deadline_confirmed) ? "due" : "unconfirmed");
  if (items?.follow.length) kinds.push("follow");
  if (items?.ready.length) kinds.push("ready");
  if (items?.timed.length) kinds.push("timed");
  // Always rendered, so days with and without marks line up.
  return (
    <span className={cx("flex h-2 items-center justify-center gap-[3px]", className)}>
      {kinds.map((k) => (
        <Mark key={k} kind={k} />
      ))}
    </span>
  );
}

export function marksLabel(items?: DayItems): string {
  if (!items) return "";
  const n = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : null);
  return [
    n(items.due.length, "deadline", "deadlines"),
    n(items.follow.length, "follow-up", "follow-ups"),
    n(items.ready.length, "ready date", "ready dates"),
    n(items.timed.length, "timed item", "timed items"),
  ]
    .filter(Boolean)
    .join(", ");
}

export function MonthGrid({
  selected,
  today,
  index,
  onSelect,
}: {
  selected: string;
  today: string;
  index: Map<string, DayItems>;
  onSelect: (day: string) => void;
}) {
  const month = selected.slice(0, 7);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[13px] text-muted" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w.slice(0, 1)}</span>
        ))}
      </div>
      <div role="grid" aria-label="Month" className="space-y-1">
        {monthGrid(selected).map((week) => (
          <div role="row" key={week[0]} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const items = index.get(day);
              const outside = day.slice(0, 7) !== month;
              const isSelected = day === selected;
              const label = marksLabel(items);
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={`${relativeDayLabel(day, today)}${label ? `, ${label}` : ""}`}
                  onClick={() => onSelect(day)}
                  className={cx(
                    "flex min-h-13 flex-col items-center justify-start gap-1 rounded-[12px] pt-1.5 pb-1",
                    "transition-[background-color] duration-150",
                    isSelected ? "bg-accent-soft" : "hoverable",
                    day === today && "ring-[1.5px] ring-accent ring-inset",
                  )}
                >
                  <span
                    className={cx(
                      "num text-[15px] leading-5",
                      outside ? "text-muted" : "text-ink",
                      (isSelected || day === today) && "font-semibold",
                      day === today && "text-accent",
                    )}
                  >
                    {parseDate(day).d}
                  </span>
                  <DayMarks items={items} className={cx(outside && "opacity-50")} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend() {
  const items: [MarkKind, string][] = [
    ["due", "Deadline"],
    ["unconfirmed", "Unconfirmed"],
    ["follow", "Follow up"],
    ["ready", "Ready"],
    ["timed", "At a time"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Legend">
      {items.map(([k, label]) => (
        <li key={k} className="flex items-center gap-1.5">
          <Mark kind={k} />
          {label}
        </li>
      ))}
    </ul>
  );
}
