// Phase 6 pipelines. Templates come from Electra; Otto ships none (the compost timeline is hers).
import type { PipelineStep, PipelineTemplate, Project, Task } from "./types";
import { addDays } from "./time";

/**
 * One task per step, ordered by offset_days. The array order is the chain: the caller inserts them
 * and sets depends_on of item i to the id of item i - 1.
 */
export function expandPipeline(template: PipelineTemplate, startDate: string, opts: { project?: Project | null } = {}): Partial<Task>[] {
  const steps = [...template.steps].sort((a, b) => a.offset_days - b.offset_days);
  return steps.map((s, i) => ({
    title: s.title,
    project: opts.project ?? null,
    status: "todo",
    estimate_min: s.estimate_min,
    deadline: addDays(startDate, s.offset_days),
    deadline_confirmed: false,
    notes: `Step ${i + 1} of ${steps.length}: ${template.name}`,
    depends_on: [],
  }));
}

const LINE = /^\s*(?:day\s*\+?|\+)(\d+)\s*(?:(?:days?|d)\b)?\s*[:.-]?\s*([^\s:.-].*?)\s*$/i;
const ESTIMATE = /\s*~\s*(\d+)\s*(m|min|mins|h|hr|hrs)?\s*$/i;

/** Parses 'day 0: Mix batch ~30m', 'day 7: Turn pile', '+21 Ready check'. Other lines are skipped. */
export function parsePipelineSteps(text: string): PipelineStep[] {
  const steps: PipelineStep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    let title = m[2];
    let estimate: number | null = null;
    const e = ESTIMATE.exec(title);
    if (e) {
      estimate = Number(e[1]) * (e[2] && e[2][0].toLowerCase() === "h" ? 60 : 1);
      title = title.slice(0, e.index).trim();
    }
    if (title) steps.push({ offset_days: Number(m[1]), title, kind: "task", estimate_min: estimate });
  }
  return steps;
}
