"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOtto } from "@/lib/store";
import { PROJECTS, type Project, type Task } from "@/engine/types";
import { projectName } from "@/engine/format";
import { scoreTask } from "@/engine/score";
import { ListLayout, PageTitle } from "./ListLayout";
import { TaskRow } from "./TaskRow";
import { Card, CountPill, Empty, ProjectDot, Segmented, cx, inputClass } from "./ui";
import { IconSearch } from "./Icons";

type StatusFilter = "open" | "waiting" | "done" | "dropped" | "all";

function isUndated(t: Task, futureBlockIds: Set<string>) {
  return !t.deadline && !t.scheduled_at && !t.follow_up && !t.ready_by && !t.plan_for && !futureBlockIds.has(t.id);
}

export function AllView() {
  const params = useSearchParams();
  const tasks = useOtto((s) => s.tasks);
  const blocks = useOtto((s) => s.blocks);
  const settings = useOtto((s) => s.settings);
  const now = useOtto((s) => s.now);
  const selectedId = useOtto((s) => s.selectedId);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [project, setProject] = useState<Project | "none" | "all">((params.get("project") as Project) ?? "all");
  const [priority, setPriority] = useState<string>("all");
  const [undated, setUndated] = useState(params.get("undated") === "1");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const at = new Date(now);
    const future = new Set(blocks.filter((b) => new Date(b.end_at).getTime() > now).map((b) => b.task_id));
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const term = q.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (status === "open" && t.status !== "todo" && t.status !== "waiting") return false;
      if (status !== "open" && status !== "all" && t.status !== status) return false;
      if (project === "none" ? t.project !== null : project !== "all" && t.project !== project) return false;
      if (priority !== "all" && String(t.priority ?? "none") !== priority) return false;
      if (undated && !isUndated(t, future)) return false;
      if (term && !`${t.title} ${t.notes ?? ""} ${t.waiting_on ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const scored = filtered
      .map((t) => ({ t, s: scoreTask(t, at, { settings, tasksById: byId }).score }))
      .sort((a, b) => (a.t.status === "done") === (b.t.status === "done") ? b.s - a.s : a.t.status === "done" ? 1 : -1);
    const keys: (Project | null)[] = [...PROJECTS, null];
    return keys
      .map((k) => ({ key: k, items: scored.filter((x) => x.t.project === k).map((x) => x.t) }))
      .filter((g) => g.items.length);
  }, [tasks, blocks, settings, now, status, project, priority, undated, q]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <ListLayout header={<PageTitle title="All tasks" />}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-[13px] border border-line bg-panel px-3">
          <IconSearch size={18} className="text-muted" />
          <input className={cx(inputClass, "border-0 bg-transparent px-0")} placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </label>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented<StatusFilter>
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Open" },
              { value: "waiting", label: "Waiting" },
              { value: "done", label: "Done" },
              { value: "dropped", label: "Dropped" },
              { value: "all", label: "Everything" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Project">
          {(["all", ...PROJECTS, "none"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={project === p}
              onClick={() => setProject(p)}
              className={cx(
                "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] transition-[background-color,border-color] duration-150",
                project === p ? "border-accent bg-accent-soft" : "border-line bg-panel hoverable",
              )}
            >
              {p !== "all" && <ProjectDot project={p === "none" ? null : p} />}
              {p === "all" ? "All projects" : p === "none" ? "Unsorted" : projectName(p)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={cx(inputClass, "w-auto")} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="all">Any priority</option>
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={String(p)}>
                P{p}
              </option>
            ))}
            <option value="none">Unsorted</option>
          </select>
          <button
            type="button"
            aria-pressed={undated}
            onClick={() => setUndated(!undated)}
            className={cx("min-h-11 rounded-[12px] border px-3.5 text-[15px]", undated ? "border-accent bg-accent-soft" : "border-line bg-panel hoverable")}
          >
            No date yet
          </button>
          <span className="num ml-auto text-[13px] text-muted">{total} tasks</span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {groups.length ? (
          groups.map((g) => (
            <Card key={g.key ?? "none"} className="!p-2 sm:!p-3">
              <h2 className="flex items-center gap-2 px-2 pt-1 pb-1 text-[16px] font-semibold">
                <ProjectDot project={g.key} />
                <span className="flex-1">{projectName(g.key)}</span>
                <CountPill n={g.items.length} />
              </h2>
              <ul>
                {g.items.map((t) => (
                  <TaskRow key={t.id} task={t} selected={selectedId === t.id} />
                ))}
              </ul>
            </Card>
          ))
        ) : (
          <Empty>Nothing matches. Clear a filter or add a task with the + button.</Empty>
        )}
      </div>
    </ListLayout>
  );
}
