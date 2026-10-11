import { connection } from "next/server";
import { admin, safeEqual } from "@/lib/server";
import { loadOwner, type OwnerState } from "@/lib/jobs";
import { buildToday } from "@/engine/today";
import { buildSchedule } from "@/engine/schedule";
import { scoreTask } from "@/engine/score";
import { findBestMatch, fixNames } from "@/engine/fuzzy";
import { addDays, localDate, localTime, zonedInstant } from "@/engine/time";
import { dueLabel, relativeDayLabel } from "@/engine/format";
import { PROJECTS, type Task } from "@/engine/types";

// Otto's own MCP server (spec 13, phase 4b). Stateless Streamable HTTP: every POST is one JSON-RPC message.
// Exposes six tools only, so Claude never needs raw database access.

const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "add_tasks",
    description: "Add one or more tasks to Otto. Split rambles into one task per action. Never invent deadlines.",
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              project: { type: "string", enum: PROJECTS },
              priority: { type: "integer", minimum: 0, maximum: 4 },
              deadline: { type: "string", description: "YYYY-MM-DD" },
              deadline_confirmed: { type: "boolean", description: "true only for a firm date Electra stated" },
              scheduled_at: { type: "string", description: "Local 'YYYY-MM-DD HH:mm' in Otto's timezone" },
              estimate_min: { type: "integer" },
              energy: { type: "string", enum: ["high", "low"] },
              waiting_on: { type: "string" },
              follow_up: { type: "string", description: "YYYY-MM-DD; sets status waiting" },
              ready_by: { type: "string" },
              next_action: { type: "string" },
              notes: { type: "string" },
              value_idr: { type: "number" },
              raw_text: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  { name: "list_today", description: "What's on today, in Otto's order, with timed items and the next task.", inputSchema: { type: "object", properties: {} } },
  { name: "list_waiting", description: "Everything Electra is waiting on, with return dates.", inputSchema: { type: "object", properties: {} } },
  {
    name: "move_task",
    description: "Move a task to another day (plan_for) or a fixed local time (scheduled_at). Find it by id or by title.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task id or a few words of the title" },
        to: { type: "string", description: "YYYY-MM-DD for a day, or 'YYYY-MM-DD HH:mm' for a fixed time" },
      },
      required: ["task", "to"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task done. Find it by id or by title.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  { name: "plan_week", description: "Re-plan the next 7 days and return the plan with overload warnings.", inputSchema: { type: "object", properties: {} } },
];

type Json = Record<string, unknown>;

function find(st: OwnerState, query: string): Task | { error: string } {
  const open = st.tasks.filter((t) => t.status === "todo" || t.status === "waiting");
  const byId = open.find((t) => t.id === query);
  if (byId) return byId;
  const match = findBestMatch(query, open);
  if (!match || match.similarity < 0.45) return { error: `No open task matches "${query}".` };
  const close = open.filter((t) => findBestMatch(query, [t])!.similarity >= match.similarity - 0.02);
  if (close.length > 1) return { error: `Several tasks match "${query}": ${close.map((t) => t.title).join("; ")}. Which one?` };
  return open.find((t) => t.id === match.id)!;
}

function toInstant(local: string, tz: string): string {
  const [d, t] = local.trim().split(/[ T]/);
  return zonedInstant(d, t.slice(0, 5), tz).toISOString();
}

async function callTool(name: string, args: Json): Promise<string> {
  const db = admin();
  const st = await loadOwner(db);
  if (!st) return "Otto has no owner yet. Sign in to the app once.";
  const tz = st.settings.timezone;
  const now = new Date();
  const today = localDate(now, tz);

  switch (name) {
    case "add_tasks": {
      const items = (args.tasks as Json[] | undefined) ?? [];
      if (!items.length) return "Nothing to add.";
      const rows = items.map((t) => {
        const row: Json = { ...t, title: fixNames(String(t.title)), user_id: st.ownerId, source: "claude" };
        if (typeof t.scheduled_at === "string") row.scheduled_at = toInstant(t.scheduled_at, tz);
        if (t.follow_up) row.status = "waiting";
        if (t.deadline && t.deadline_confirmed == null) row.deadline_confirmed = false;
        return row;
      });
      const { data, error } = await db.from("tasks").insert(rows).select("title, deadline, deadline_confirmed, scheduled_at, status, follow_up");
      if (error) return `Couldn't add them: ${error.message}`;
      const lines = (data ?? []).map((t) => {
        const bits = [t.title];
        if (t.scheduled_at) bits.push(`${relativeDayLabel(localDate(t.scheduled_at, tz), today)} ${localTime(t.scheduled_at, tz)}`);
        if (t.deadline) bits.push(dueLabel(t.deadline, today, t.deadline_confirmed));
        if (t.status === "waiting") bits.push(`waiting, back ${t.follow_up ? relativeDayLabel(t.follow_up, today) : "soon"}`);
        return `- ${bits.join(", ")}.`;
      });
      return `Added ${lines.length}.\n${lines.join("\n")}`;
    }
    case "list_today": {
      const model = buildToday(st.tasks, st.blocks, now, st.settings, null);
      const lines = model.ordered.slice(0, 10).map((r, i) => `${i + 1}. ${r.time ? `${r.time} ` : ""}${r.task.title}${r.reasonLine ? ` (${r.reasonLine})` : ""}`);
      const head = `Today is ${today} (${tz}). Done so far: ${model.doneCount} of ${model.dailyGoal}.`;
      const triage = model.triage.length ? `\nOverdue, needs a decision: ${model.triage.map((t) => t.title).join("; ")}.` : "";
      return `${head}\n${lines.join("\n") || "Nothing open today."}${triage}`;
    }
    case "list_waiting": {
      const waiting = st.tasks.filter((t) => t.status === "waiting").sort((a, b) => (a.follow_up ?? "9").localeCompare(b.follow_up ?? "9"));
      if (!waiting.length) return "Not waiting on anyone.";
      return waiting.map((t) => `- ${t.title}${t.waiting_on ? `, on ${t.waiting_on}` : ""}, back ${t.follow_up ? relativeDayLabel(t.follow_up, today) : "with no date"}.`).join("\n");
    }
    case "move_task": {
      const task = find(st, String(args.task ?? ""));
      if ("error" in task) return task.error;
      const to = String(args.to ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2})?$/.test(to)) return "Use YYYY-MM-DD or 'YYYY-MM-DD HH:mm'.";
      const day = to.slice(0, 10);
      const time = to.length > 10 ? to.slice(11).padStart(5, "0") : task.scheduled_at ? localTime(task.scheduled_at, tz) : null;
      // A meeting moved to another day keeps its time; a plain task just lands on that day.
      const patch = time ? { scheduled_at: zonedInstant(day, time, tz).toISOString() } : { plan_for: day };
      const { error } = await db.from("tasks").update(patch).eq("id", task.id);
      if (error) return `Couldn't move it: ${error.message}`;
      return `Moved ${task.title} to ${relativeDayLabel(day, today)}${time ? ` ${time}` : ""}.`;
    }
    case "complete_task": {
      const task = find(st, String(args.task ?? ""));
      if ("error" in task) return task.error;
      const { error } = await db.from("tasks").update({ status: "done" }).eq("id", task.id);
      if (error) return `Couldn't mark it done: ${error.message}`;
      return `Done: ${task.title}.`;
    }
    case "plan_week": {
      const tasksById = new Map(st.tasks.map((t) => [t.id, t]));
      const result = buildSchedule({
        tasks: st.tasks,
        blocks: st.blocks,
        busy: st.busy,
        settings: st.settings,
        now,
        horizonDays: 7,
        scoreOf: (t) => scoreTask(t, now, { settings: st.settings, tasksById }).score,
      });
      const keep = new Set(result.blocks.map((b) => b.id));
      const old = new Set(st.blocks.map((b) => b.id));
      const removed = st.blocks.filter((b) => !keep.has(b.id) && new Date(b.start_at) < new Date(addDays(today, 8))).map((b) => b.id);
      if (removed.length) await db.from("schedule_blocks").delete().in("id", removed);
      const added = result.blocks.filter((b) => !old.has(b.id));
      if (added.length) await db.from("schedule_blocks").insert(added.map((b) => ({ ...b, user_id: st.ownerId })));
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        const items = result.blocks
          .filter((b) => localDate(b.start_at, tz) === d)
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
          .map((b) => `${localTime(b.start_at, tz)} ${tasksById.get(b.task_id)?.title ?? "task"}`);
        if (items.length) days.push(`${relativeDayLabel(d, today)}: ${items.join("; ")}`);
      }
      const warnings = result.warnings.map((w) => w.message);
      return [...days, ...(warnings.length ? ["", ...warnings] : [])].join("\n") || "Nothing to plan this week.";
    }
  }
  return `Unknown tool ${name}.`;
}

function reply(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function fail(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  await connection();
  const { secret } = await ctx.params;
  const { data: s } = await admin().from("otto_settings").select("mcp_secret").eq("id", 1).maybeSingle();
  if (!s?.mcp_secret || !safeEqual(secret, s.mcp_secret)) return new Response("Not found", { status: 404 });

  const msg = (await req.json().catch(() => null)) as { id?: unknown; method?: string; params?: Json } | null;
  if (!msg?.method) return fail(null, -32700, "Parse error");
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notifications need no answer

  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) ?? PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "otto", version: "1.0.0" },
        instructions: "Otto is Electra's task app. Use add_tasks for anything she wants to remember. Never invent deadlines.",
      });
    case "ping":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!TOOLS.some((t) => t.name === name)) return fail(msg.id, -32602, `Unknown tool ${name}`);
      try {
        const text = await callTool(name, (msg.params?.arguments as Json) ?? {});
        return reply(msg.id, { content: [{ type: "text", text }] });
      } catch (err) {
        return reply(msg.id, { content: [{ type: "text", text: `Otto hit an error: ${err instanceof Error ? err.message : "unknown"}` }], isError: true });
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function GET() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
