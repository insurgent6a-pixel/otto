import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin } from "./server";
import {
  DEFAULT_SETTINGS,
  type BusyBlock,
  type EnergyCheckin,
  type ScheduleBlock,
  type Settings,
  type Task,
  type TaskEvent,
} from "@/engine/types";
import { addDays, hm, inWindow, isoWeekday, localDate, localMinutes, localTime } from "@/engine/time";
import { nightlySweep } from "@/engine/sweep";
import { buildSchedule } from "@/engine/schedule";
import { scoreTask } from "@/engine/score";
import { buildToday } from "@/engine/today";
import { effectiveStartBy } from "@/engine/startby";
import { computeDayStats, dailyScore, momentum, adjustedDailyGoal } from "@/engine/daily";
import { morningLine, wrapUpLine } from "@/engine/messages";
import { weeklyReview } from "@/engine/learning";
import { nextInstance } from "@/engine/repeat";
import { dueLabel } from "@/engine/format";

export interface OwnerState {
  ownerId: string;
  settings: Settings & { fallback_email: string | null; display_name: string };
  tasks: Task[];
  blocks: ScheduleBlock[];
  busy: BusyBlock[];
  checkins: EnergyCheckin[];
  events: TaskEvent[];
}

export async function loadOwner(db: SupabaseClient = admin()): Promise<OwnerState | null> {
  const { data: s } = await db.from("otto_settings").select("*").eq("id", 1).maybeSingle();
  if (!s?.owner_id) return null;
  const owner = s.owner_id as string;
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  const [tasks, blocks, busy, checkins, events] = await Promise.all([
    db.from("tasks").select("*").eq("user_id", owner).or(`status.in.(todo,waiting),updated_at.gte.${since}`),
    db.from("schedule_blocks").select("*").eq("user_id", owner).gte("end_at", new Date(Date.now() - 2 * 86400000).toISOString()),
    db.from("busy_blocks").select("*").eq("user_id", owner).gte("end_at", new Date(Date.now() - 86400000).toISOString()),
    db.from("energy_checkins").select("*").eq("user_id", owner).gte("at", since).order("at"),
    db.from("task_events").select("*").eq("user_id", owner).gte("at", since).order("at"),
  ]);
  return {
    ownerId: owner,
    settings: { ...DEFAULT_SETTINGS, ...s, fallback_email: s.fallback_email ?? null },
    tasks: ((tasks.data ?? []) as Task[]).map((t) => ({ ...t, value_idr: t.value_idr == null ? null : Number(t.value_idr), depends_on: t.depends_on ?? [] })),
    blocks: (blocks.data ?? []) as ScheduleBlock[],
    busy: (busy.data ?? []) as BusyBlock[],
    checkins: (checkins.data ?? []) as EnergyCheckin[],
    events: (events.data ?? []) as TaskEvent[],
  };
}

function todayEnergy(st: OwnerState, now: Date) {
  const today = localDate(now, st.settings.timezone);
  const todays = st.checkins.filter((c) => localDate(c.at, st.settings.timezone) === today);
  return todays.at(-1)?.level ?? null;
}

// ---------- push ----------

let vapidReady = false;
function vapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:otto@example.com", pub, priv);
  vapidReady = true;
  return true;
}

export interface PushMessage {
  body: string;
  url?: string;
  tag?: string;
  badge?: number;
}

/** Sends to every subscription. Dead ones (404/410) are deleted. Returns delivered count. */
export async function pushToOwner(db: SupabaseClient, ownerId: string, msg: PushMessage): Promise<number> {
  if (!vapid()) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", ownerId);
  let delivered = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: "Otto", ...msg }),
        { TTL: 3600, urgency: "high" },
      );
      delivered++;
      await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq("id", sub.id);
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
      else await db.from("push_subscriptions").update({ failures: (sub.failures ?? 0) + 1 }).eq("id", sub.id);
    }
  }
  return delivered;
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "Otto <onboarding@resend.dev>", to, subject, text }),
  });
  return res.ok;
}

// ---------- jobs ----------

async function claimJob(db: SupabaseClient, job: string, day: string): Promise<boolean> {
  const { error } = await db.from("job_runs").insert({ job, day });
  return !error; // primary key (job, day) makes the second claim fail
}

/** Persists a schedule diff, same shape as the client's reconcile. */
async function persistSchedule(db: SupabaseClient, st: OwnerState, now: Date) {
  const tasksById = new Map(st.tasks.map((t) => [t.id, t]));
  const result = buildSchedule({
    tasks: st.tasks,
    blocks: st.blocks,
    busy: st.busy,
    settings: st.settings,
    now,
    energyToday: todayEnergy(st, now),
    scoreOf: (t) => scoreTask(t, now, { settings: st.settings, tasksById }).score,
  });
  const keep = new Set(result.blocks.map((b) => b.id));
  const old = new Map(st.blocks.map((b) => [b.id, b]));
  const removed = st.blocks.filter((b) => !keep.has(b.id)).map((b) => b.id);
  const added = result.blocks.filter((b) => !old.has(b.id));
  const changed = result.blocks.filter((b) => {
    const o = old.get(b.id);
    return o && (o.start_at !== b.start_at || o.end_at !== b.end_at || o.pinned !== b.pinned);
  });
  if (removed.length) await db.from("schedule_blocks").delete().in("id", removed);
  if (added.length) {
    await db.from("schedule_blocks").insert(
      added.map(({ id, task_id, start_at, end_at, pinned, source }) => ({ id, user_id: st.ownerId, task_id, start_at, end_at, pinned, source })),
    );
  }
  for (const b of changed) await db.from("schedule_blocks").update({ start_at: b.start_at, end_at: b.end_at, pinned: b.pinned, source: b.source }).eq("id", b.id);
  st.blocks = result.blocks;
  return { added: added.length, removed: removed.length, changed: changed.length, warnings: result.warnings.length };
}

async function runSweep(db: SupabaseClient, st: OwnerState, now: Date) {
  const res = nightlySweep(st.tasks, st.blocks, now, st.settings);
  for (const p of res.patches) {
    await db.from("tasks").update(p.patch).eq("id", p.id);
    st.tasks = st.tasks.map((t) => (t.id === p.id ? { ...t, ...p.patch } : t));
  }
  return { patched: res.patches.length, needsSchedule: res.needsSchedule.length };
}

async function snapshotScore(db: SupabaseClient, st: OwnerState, day: string) {
  const { data: row } = await db.from("daily_scores").select("planned_ids").eq("user_id", st.ownerId).eq("day", day).maybeSingle();
  const lastCheckin = st.checkins.filter((c) => localDate(c.at, st.settings.timezone) === day).at(-1)?.level ?? null;
  const goal = adjustedDailyGoal(st.settings.daily_goal, lastCheckin);
  const stats = computeDayStats({ tasks: st.tasks, events: st.events, day, settings: st.settings, dailyGoal: goal, plannedIdsAt8am: (row?.planned_ids as string[] | null) ?? null });
  const { score, parts } = dailyScore(stats);
  const { data: prev } = await db.from("daily_scores").select("score").eq("user_id", st.ownerId).lt("day", day).not("score", "is", null).order("day", { ascending: false }).limit(6);
  const history = ((prev ?? []) as { score: number }[]).map((r) => r.score).reverse();
  await db.from("daily_scores").upsert(
    { user_id: st.ownerId, day, score, parts, momentum: momentum([...history, score]), done_count: stats.doneCount, daily_goal: goal },
    { onConflict: "user_id,day" },
  );
  return { day, score };
}

async function snapshotPlan(db: SupabaseClient, st: OwnerState, today: string) {
  const tz = st.settings.timezone;
  const planned = new Set<string>();
  for (const b of st.blocks) if (localDate(b.start_at, tz) === today) planned.add(b.task_id);
  for (const t of st.tasks) if (t.status === "todo" && t.scheduled_at && localDate(t.scheduled_at, tz) === today) planned.add(t.id);
  await db.from("daily_scores").upsert({ user_id: st.ownerId, day: today, planned_ids: [...planned], daily_goal: st.settings.daily_goal }, { onConflict: "user_id,day" });
  return planned.size;
}

async function remindersSentToday(db: SupabaseClient, st: OwnerState, day: string) {
  const { data } = await db.from("notification_log").select("task_id, kind").eq("user_id", st.ownerId).eq("day", day);
  const perTask = new Map<string, number>();
  const kinds = new Set<string>();
  for (const r of data ?? []) {
    if (r.task_id) perTask.set(r.task_id, (perTask.get(r.task_id) ?? 0) + 1);
    kinds.add(`${r.kind}:${r.task_id ?? ""}`);
  }
  return { perTask, kinds };
}

function badgeCount(st: OwnerState, now: Date) {
  const model = buildToday(st.tasks, st.blocks, now, st.settings, null);
  return model.triage.length + st.tasks.filter((t) => t.status === "todo" && t.forced).length;
}

async function notify(db: SupabaseClient, st: OwnerState, day: string, kind: string, taskId: string | null, msg: PushMessage) {
  const delivered = await pushToOwner(db, st.ownerId, msg);
  await db.from("notification_log").insert({ user_id: st.ownerId, task_id: taskId, kind, day, body: msg.body, delivered: delivered > 0 });
  return delivered;
}

async function createRepeats(db: SupabaseClient, st: OwnerState, now: Date) {
  let created = 0;
  const recent = now.getTime() - 3 * 86400000;
  for (const t of st.tasks) {
    if (!t.rrule || (t.status !== "done" && t.status !== "dropped")) continue;
    if (new Date(t.updated_at).getTime() < recent) continue;
    const series = t.series_id ?? t.id;
    const hasNext = st.tasks.some((x) => x.id !== t.id && (x.series_id ?? x.id) === series && x.created_at > t.created_at);
    if (hasNext) continue;
    const next = nextInstance(t, now, st.settings.timezone);
    if (!next) continue;
    const { data } = await db.from("tasks").insert({ ...next, user_id: st.ownerId, source: t.source }).select().single();
    if (data) {
      st.tasks.push(data as Task);
      created++;
    }
  }
  return created;
}

/** One 5-minute tick. Each daily job runs on the first tick at or after its local time. */
export async function tick(now = new Date()) {
  const db = admin();
  const st = await loadOwner(db);
  if (!st) return { ok: false, reason: "No owner yet. Sign in to Otto once." };
  const tz = st.settings.timezone;
  const today = localDate(now, tz);
  const minute = localMinutes(now, tz);
  const quiet = inWindow(minute, st.settings.quiet_start, st.settings.quiet_end);
  const log: Record<string, unknown> = { tz, today, time: localTime(now, tz), quiet };

  log.repeats = await createRepeats(db, st, now);

  if (minute >= hm("00:30") && (await claimJob(db, "sweep", today))) {
    log.sweep = await runSweep(db, st, now);
    log.schedule = await persistSchedule(db, st, now);
  }
  // Yesterday's score if 23:55 got missed, then today's at 23:55.
  const yesterday = addDays(today, -1);
  if (await claimJob(db, "score", yesterday)) log.scoreYesterday = await snapshotScore(db, st, yesterday);
  if (minute >= hm("23:55") && (await claimJob(db, "score", today))) log.score = await snapshotScore(db, st, today);

  if (minute >= hm("06:00") && (await claimJob(db, "schedule", today))) log.schedule6 = await persistSchedule(db, st, now);

  if (minute >= hm("08:00") && (await claimJob(db, "plan", today))) {
    log.planned = await snapshotPlan(db, st, today);
    // A summary from hours ago is noise, so a late tick only snapshots.
    if (minute < hm("10:00") && !quiet) log.morning = await morning(db, st, now, today);
  }

  if (minute >= hm("17:00") && minute < hm("19:00") && !quiet && (await claimJob(db, "wrapup", today))) {
    const model = buildToday(st.tasks, st.blocks, now, st.settings, todayEnergy(st, now));
    await notify(db, st, today, "wrapup", null, {
      body: wrapUpLine({ doneCount: model.doneCount, dailyGoal: model.dailyGoal, overdue: model.triage.length }),
      url: "/",
      tag: "wrapup",
      badge: badgeCount(st, now),
    });
    log.wrapup = true;
    if (isoWeekday(today) === 7 && (await claimJob(db, "weekly", today))) {
      const { data: scores } = await db.from("daily_scores").select("day, score").eq("user_id", st.ownerId).not("score", "is", null);
      const review = weeklyReview({ scores: (scores ?? []) as { day: string; score: number }[], tasks: st.tasks, checkins: st.checkins, tz, weekStart: addDays(today, -6) });
      await notify(db, st, today, "weekly", null, { body: review.line, url: "/goals", tag: "weekly" });
      log.weekly = true;
    }
  }

  if (!quiet) log.blocks = await blockReminders(db, st, now, today);
  return { ok: true, ...log };
}

async function morning(db: SupabaseClient, st: OwnerState, now: Date, today: string) {
  const tz = st.settings.timezone;
  const model = buildToday(st.tasks, st.blocks, now, st.settings, null);
  const goal = (await db.from("goals").select("name").eq("user_id", st.ownerId).eq("is_current", true).maybeSingle()).data?.name ?? null;
  const doneYesterday = st.tasks.filter((t) => t.done_at && localDate(t.done_at, tz) === addDays(today, -1)).length;
  const summary = morningLine({ doneYesterday, overdue: model.triage.length, nextTitle: model.next?.displayTitle ?? null, goal });
  const badge = badgeCount(st, now);
  const delivered = await notify(db, st, today, "summary", null, { body: summary, url: "/", tag: "summary", badge });

  // Email fallback when no push has landed in 24h.
  const { data: subs } = await db.from("push_subscriptions").select("last_ok_at").eq("user_id", st.ownerId);
  const recentOk = (subs ?? []).some((s) => s.last_ok_at && Date.now() - new Date(s.last_ok_at).getTime() < 86400000);
  let emailed = false;
  if (!delivered && !recentOk && st.settings.fallback_email) {
    const lines = [summary, "", ...model.ordered.slice(0, 5).map((r) => `- ${r.task.title}${r.reasonLine ? ` (${r.reasonLine})` : ""}`)];
    emailed = await sendEmail(st.settings.fallback_email, "Otto: your day", lines.join("\n"));
  }

  // Individual reminders, capped so 08:00 never turns into a wall of pings.
  const { perTask } = await remindersSentToday(db, st, today);
  const due: { task: Task; kind: string; body: string }[] = [];
  for (const t of st.tasks) {
    if (t.status === "todo") {
      if (t.deadline) {
        const d = t.deadline;
        if (d < today || d === today || d === addDays(today, 1) || d === addDays(today, 7)) {
          due.push({ task: t, kind: "deadline", body: `${t.title} is ${dueLabel(d, today, t.deadline_confirmed)}.` });
          continue;
        }
      }
      const sb = effectiveStartBy(t).date;
      if (sb === today) due.push({ task: t, kind: "start_by", body: `Start ${t.title} today to finish on time.` });
    } else if (t.status === "waiting" && t.follow_up && t.follow_up <= today) {
      due.push({ task: t, kind: "follow_up", body: `${t.title} is due back from ${t.waiting_on ?? "them"}. Chase it or mark it back.` });
    }
  }
  let sent = 0;
  for (const r of due.slice(0, 4)) {
    if ((perTask.get(r.task.id) ?? 0) >= 2) continue;
    await notify(db, st, today, r.kind, r.task.id, { body: r.body, url: `/t/${r.task.id}`, tag: `${r.kind}-${r.task.id}`, badge });
    sent++;
  }
  return { summary, delivered, emailed, reminders: sent };
}

async function blockReminders(db: SupabaseClient, st: OwnerState, now: Date, today: string) {
  const tz = st.settings.timezone;
  const from = now.getTime() + 5 * 60000;
  const to = now.getTime() + 15 * 60000;
  const byId = new Map(st.tasks.map((t) => [t.id, t]));
  const soon: { task: Task; at: string; key: string }[] = [];
  for (const b of st.blocks) {
    const t = new Date(b.start_at).getTime();
    const task = byId.get(b.task_id);
    if (task && task.status === "todo" && t > from && t <= to) soon.push({ task, at: b.start_at, key: `block:${b.id}` });
  }
  for (const task of st.tasks) {
    if (task.status !== "todo" || !task.scheduled_at) continue;
    const t = new Date(task.scheduled_at).getTime();
    if (t > from && t <= to) soon.push({ task, at: task.scheduled_at, key: `timed:${task.id}` });
  }
  if (!soon.length) return 0;
  const { perTask, kinds } = await remindersSentToday(db, st, today);
  let sent = 0;
  for (const s of soon) {
    if (kinds.has(`${s.key}:${s.task.id}`) || (perTask.get(s.task.id) ?? 0) >= 2) continue;
    await notify(db, st, today, s.key, s.task.id, {
      body: `${localTime(s.at, tz)}: ${s.task.title}. Starts in 10 minutes.`,
      url: `/t/${s.task.id}`,
      tag: s.key,
    });
    sent++;
  }
  return sent;
}
