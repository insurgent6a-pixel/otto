"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { sb, supabaseConfigured } from "./supabase";
import {
  DEFAULT_SETTINGS,
  type BusyBlock,
  type EnergyCheckin,
  type EnergyLevel,
  type Goal,
  type ScheduleBlock,
  type Settings,
  type Task,
  type TaskEvent,
} from "@/engine/types";
import { localDate, localTime, addDays } from "@/engine/time";
import { buildSchedule, knockOnMessage } from "@/engine/schedule";
import { computeStartByAuto } from "@/engine/startby";
import { nextInstance } from "@/engine/repeat";
import { scoreTask } from "@/engine/score";
import { forcedMessage } from "@/engine/force";

export interface OttoMemory {
  recent?: string[];
  tough_love_day?: string;
  last_low_day?: string;
}

export interface SettingsRow extends Settings {
  owner_id: string | null;
  capture_secret: string | null;
  ics_secret: string | null;
  mcp_secret: string | null;
  fallback_email: string | null;
  state: OttoMemory;
}

export interface ScoreRow {
  day: string;
  score: number | null;
  parts: Record<string, number> | null;
  momentum: number | null;
  done_count: number;
  daily_goal: number | null;
  planned_ids: string[] | null;
}

export interface Toast {
  id: number;
  text: string;
  otto?: boolean;
  undo?: () => void;
  tone?: "default" | "error";
  ms?: number;
}

export interface FocusTimer {
  taskId: string | null;
  startedAt: number;
  minutes: number;
  endsAt: number;
}

export type AuthPhase = "loading" | "unconfigured" | "signed_out" | "claiming" | "ready" | "foreign";

export interface StoreState {
  phase: AuthPhase;
  session: Session | null;
  error: string | null;
  settings: SettingsRow;
  tasks: Task[];
  goals: Goal[];
  checkins: EnergyCheckin[];
  blocks: ScheduleBlock[];
  busy: BusyBlock[];
  scores: ScoreRow[];
  events: TaskEvent[];
  toasts: Toast[];
  now: number;
  timer: FocusTimer | null;
  focusMode: boolean;
  theme: "system" | "light" | "dark";
  sheet: SheetState | null;
  paletteOpen: boolean;
  helpOpen: boolean;
  selectedId: string | null;
  /** Task id -> epoch ms. "Later today" hides a task from the top of Today until then. */
  snoozed: Record<string, number>;
  completing: Record<string, true>;
  celebrate: { kind: "goal_reached"; goalId: string } | null;
}

export type SheetState =
  | { kind: "add"; preset?: string }
  | { kind: "edit"; taskId: string }
  | { kind: "shrink"; taskId: string }
  | { kind: "handoff"; taskId: string }
  | { kind: "too_big"; taskId: string };

const EMPTY_SETTINGS: SettingsRow = {
  ...DEFAULT_SETTINGS,
  owner_id: null,
  capture_secret: null,
  ics_secret: null,
  mcp_secret: null,
  fallback_email: null,
  state: {},
};

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the preference just won't stick.
  }
}

const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

function normalizeTask(row: Record<string, unknown>): Task {
  const t = row as unknown as Task;
  return {
    ...t,
    value_idr: t.value_idr == null ? null : Number(t.value_idr),
    depends_on: t.depends_on ?? [],
  };
}

function normalizeGoal(row: Record<string, unknown>): Goal {
  const g = row as unknown as Goal;
  return { ...g, saved_idr: Number(g.saved_idr ?? 0), target_idr: g.target_idr == null ? null : Number(g.target_idr) };
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}

class OttoStore {
  state: StoreState = {
    phase: "loading",
    session: null,
    error: null,
    settings: EMPTY_SETTINGS,
    tasks: [],
    goals: [],
    checkins: [],
    blocks: [],
    busy: [],
    scores: [],
    events: [],
    toasts: [],
    now: Date.now(),
    timer: null,
    focusMode: false,
    theme: "system",
    sheet: null,
    paletteOpen: false,
    helpOpen: false,
    selectedId: null,
    snoozed: {},
    completing: {},
    celebrate: null,
  };

  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private started = false;
  private toastSeq = 0;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCause: string | null = null;
  private reconciling = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  set(patch: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  get tz() {
    return this.state.settings.timezone || DEFAULT_SETTINGS.timezone;
  }

  today() {
    return localDate(this.state.now, this.tz);
  }

  // ---------- lifecycle ----------

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.set({
      focusMode: readLocal("otto.focus", false),
      theme: readLocal("otto.theme", "system"),
      timer: readLocal<FocusTimer | null>("otto.timer", null),
      snoozed: Object.fromEntries(
        Object.entries(readLocal<Record<string, number>>("otto.snoozed", {})).filter(([, until]) => until > Date.now()),
      ),
    });
    setInterval(() => this.set({ now: Date.now() }), 15_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.set({ now: Date.now() });
        if (this.state.phase === "ready") void this.loadAll();
      }
    });
    if (!supabaseConfigured()) {
      this.set({ phase: "unconfigured" });
      return;
    }
    const client = sb();
    client.auth.onAuthStateChange((_event, session) => {
      const had = this.state.session?.user.id;
      this.set({ session });
      if (!session) {
        this.teardown();
        this.set({ phase: "signed_out" });
      } else if (had !== session.user.id) {
        void this.boot();
      }
    });
    void client.auth.getSession().then(({ data }) => {
      if (!data.session) this.set({ phase: "signed_out" });
    });
  }

  private async boot() {
    this.set({ phase: "claiming" });
    const { error } = await sb().rpc("otto_claim");
    if (error) {
      if (/another account/i.test(error.message)) {
        this.set({ phase: "foreign", error: error.message });
      } else {
        this.set({ phase: "signed_out", error: `Couldn't open Otto: ${error.message}` });
      }
      return;
    }
    await this.loadAll();
    this.subscribeRealtime();
    this.set({ phase: "ready" });
    this.scheduleReconcile();
  }

  private teardown() {
    if (this.channel) void sb().removeChannel(this.channel);
    this.channel = null;
  }

  async loadAll() {
    const client = sb();
    const since60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const since2 = new Date(Date.now() - 2 * 86400000).toISOString();
    const since35 = new Date(Date.now() - 35 * 86400000).toISOString();
    const [settings, tasks, goals, checkins, blocks, busy, scores, events] = await Promise.all([
      client.from("otto_settings").select("*").eq("id", 1).maybeSingle(),
      client.from("tasks").select("*").or(`status.in.(todo,waiting),updated_at.gte.${since60}`).order("created_at"),
      client.from("goals").select("*").order("created_at"),
      client.from("energy_checkins").select("*").gte("at", since60).order("at"),
      client.from("schedule_blocks").select("*").gte("end_at", since2).order("start_at"),
      client.from("busy_blocks").select("*").gte("end_at", since2).order("start_at"),
      client.from("daily_scores").select("*").order("day", { ascending: false }).limit(90),
      client.from("task_events").select("*").gte("at", since35).order("at"),
    ]);
    const failed = [settings, tasks, goals, checkins, blocks, busy, scores, events].find((r) => r.error);
    if (failed?.error) {
      this.toast(`Couldn't load your tasks: ${failed.error.message}. Pull to refresh or reopen Otto.`, { tone: "error" });
      return;
    }
    this.set({
      settings: settings.data ? { ...EMPTY_SETTINGS, ...(settings.data as SettingsRow), state: settings.data.state ?? {} } : this.state.settings,
      tasks: (tasks.data ?? []).map(normalizeTask),
      goals: (goals.data ?? []).map(normalizeGoal),
      checkins: (checkins.data ?? []) as EnergyCheckin[],
      blocks: (blocks.data ?? []) as ScheduleBlock[],
      busy: (busy.data ?? []) as BusyBlock[],
      scores: ((scores.data ?? []) as ScoreRow[]).reverse(),
      events: (events.data ?? []) as TaskEvent[],
    });
  }

  private subscribeRealtime() {
    this.teardown();
    const client = sb();
    const onRow =
      <T extends { id: string }>(key: "tasks" | "goals" | "checkins" | "blocks" | "busy", norm: (r: Record<string, unknown>) => T) =>
      (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const list = this.state[key] as unknown as T[];
        if (payload.eventType === "DELETE") {
          const id = payload.old.id as string;
          this.set({ [key]: list.filter((x) => x.id !== id) } as Partial<StoreState>);
        } else {
          const row = norm(payload.new);
          if (key === "goals") this.watchGoalReached(row as unknown as Goal);
          this.set({ [key]: upsertById(list, row) } as Partial<StoreState>);
        }
        if (key === "tasks" || key === "busy") this.scheduleReconcile();
      };
    this.channel = client
      .channel("otto-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onRow("tasks", normalizeTask))
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, onRow("goals", normalizeGoal))
      .on("postgres_changes", { event: "*", schema: "public", table: "energy_checkins" }, onRow("checkins", (r) => r as unknown as EnergyCheckin))
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_blocks" }, onRow("blocks", (r) => r as unknown as ScheduleBlock))
      .on("postgres_changes", { event: "*", schema: "public", table: "busy_blocks" }, onRow("busy", (r) => r as unknown as BusyBlock))
      .on("postgres_changes", { event: "*", schema: "public", table: "otto_settings" }, (p) => {
        if (p.eventType !== "DELETE") this.set({ settings: { ...this.state.settings, ...(p.new as Partial<SettingsRow>) } });
      })
      .subscribe();
  }

  // ---------- UI state ----------

  toast(text: string, opts: Omit<Toast, "id" | "text"> = {}) {
    const id = ++this.toastSeq;
    this.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, ...opts }] }));
    setTimeout(() => this.dismissToast(id), opts.ms ?? (opts.undo ? 5000 : 3600));
    return id;
  }

  dismissToast(id: number) {
    this.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }

  setFocusMode(on: boolean) {
    writeLocal("otto.focus", on);
    this.set({ focusMode: on });
  }

  setTheme(theme: StoreState["theme"]) {
    writeLocal("otto.theme", theme);
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    this.set({ theme });
  }

  openSheet(sheet: SheetState | null) {
    this.set({ sheet });
  }

  snooze(taskId: string, until: number | null) {
    const next = { ...this.state.snoozed };
    if (until == null) delete next[taskId];
    else next[taskId] = until;
    writeLocal("otto.snoozed", next);
    this.set({ snoozed: next });
  }

  setTimer(timer: FocusTimer | null) {
    writeLocal("otto.timer", timer);
    this.set({ timer });
  }

  // ---------- writes ----------

  async addTask(fields: Partial<Task> & { title: string }): Promise<Task | null> {
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic = normalizeTask({
      id: tempId,
      project: null,
      priority: null,
      status: "todo",
      estimate_min: null,
      energy: null,
      scheduled_at: null,
      deadline: null,
      deadline_confirmed: false,
      start_by_auto: null,
      start_by_manual: null,
      follow_up: null,
      ready_by: null,
      next_action: null,
      waiting_on: null,
      notes: null,
      plan_for: null,
      postpone_count: 0,
      forced: false,
      depends_on: [],
      rrule: null,
      series_id: null,
      value_idr: null,
      source: "app",
      raw_text: null,
      done_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...fields,
    } as unknown as Record<string, unknown>);
    this.set((s) => ({ tasks: [...s.tasks, optimistic] }));
    const insert = { ...fields, source: fields.source ?? "app" };
    const { data, error } = await sb().from("tasks").insert(insert).select().single();
    if (error || !data) {
      this.set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tempId) }));
      this.toast(`Couldn't add "${fields.title}". Check your connection and try again.`, { tone: "error" });
      return null;
    }
    const saved = normalizeTask(data);
    this.set((s) => ({ tasks: upsertById(s.tasks.filter((t) => t.id !== tempId), saved) }));
    this.lastCause = saved.id;
    this.scheduleReconcile();
    return saved;
  }

  async updateTask(id: string, patch: Partial<Task>, opts: { quiet?: boolean } = {}): Promise<boolean> {
    const before = this.state.tasks.find((t) => t.id === id);
    if (!before) return false;
    this.set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    const { data, error } = await sb().from("tasks").update(patch).eq("id", id).select().single();
    if (error || !data) {
      this.set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? before : t)) }));
      if (!opts.quiet) this.toast(SAVE_FAILED, { tone: "error" });
      return false;
    }
    this.set((s) => ({ tasks: upsertById(s.tasks, normalizeTask(data)) }));
    this.lastCause = id;
    this.scheduleReconcile();
    return true;
  }

  async deleteTask(id: string) {
    const before = this.state.tasks;
    this.set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }));
    const { error } = await sb().from("tasks").delete().eq("id", id);
    if (error) {
      this.set({ tasks: before });
      this.toast("Couldn't delete it. Check your connection and try again.", { tone: "error" });
    }
  }

  /** Completion write. Rewards and toasts live in the UI layer so they fire within 100ms. */
  async completeTask(id: string): Promise<{ undo: () => Promise<void> } | null> {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) return null;
    const prevStatus = task.status;
    this.set((s) => ({ completing: { ...s.completing, [id]: true } }));
    const ok = await this.updateTask(id, { status: "done", done_at: new Date().toISOString(), forced: false });
    setTimeout(() => this.set((s) => {
      const rest = { ...s.completing };
      delete rest[id];
      return { completing: rest };
    }), 700);
    if (!ok) return null;
    let spawnedId: string | null = null;
    if (task.rrule) {
      const next = nextInstance(task, new Date(), this.tz);
      if (next) spawnedId = (await this.addTask({ ...next, title: next.title ?? task.title }))?.id ?? null;
    }
    return {
      undo: async () => {
        await this.updateTask(id, { status: prevStatus, done_at: null });
        if (spawnedId) await this.deleteTask(spawnedId);
      },
    };
  }

  async dropTask(id: string) {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) return;
    const prev = task.status;
    const ok = await this.updateTask(id, { status: "dropped", forced: false });
    if (!ok) return;
    if (task.rrule) {
      const next = nextInstance(task, new Date(), this.tz);
      if (next) await this.addTask({ ...next, title: next.title ?? task.title });
    }
    this.toast("Dropped. It won't come back.", { otto: true, undo: () => void this.updateTask(id, { status: prev }) });
  }

  async checkIn(level: EnergyLevel) {
    const tempId = `tmp-${crypto.randomUUID()}`;
    const row: EnergyCheckin = { id: tempId, level, source: "app", at: new Date().toISOString() };
    this.set((s) => ({ checkins: [...s.checkins, row] }));
    const { data, error } = await sb().from("energy_checkins").insert({ level }).select().single();
    if (error || !data) {
      this.set((s) => ({ checkins: s.checkins.filter((c) => c.id !== tempId) }));
      this.toast(SAVE_FAILED, { tone: "error" });
      return;
    }
    this.set((s) => ({ checkins: upsertById(s.checkins.filter((c) => c.id !== tempId), data as EnergyCheckin) }));
    this.scheduleReconcile();
  }

  async updateSettings(patch: Partial<SettingsRow>): Promise<boolean> {
    const before = this.state.settings;
    this.set({ settings: { ...before, ...patch } });
    const { error } = await sb().from("otto_settings").update(patch).eq("id", 1);
    if (error) {
      this.set({ settings: before });
      this.toast(`Couldn't save settings: ${error.message}`, { tone: "error" });
      return false;
    }
    this.scheduleReconcile();
    return true;
  }

  async remember(patch: Partial<OttoMemory>) {
    const state = { ...this.state.settings.state, ...patch };
    this.set({ settings: { ...this.state.settings, state } });
    await sb().from("otto_settings").update({ state }).eq("id", 1);
  }

  async logEvent(kind: TaskEvent["kind"], taskId: string | null, meta: Record<string, unknown> | null = null) {
    const { data } = await sb().from("task_events").insert({ kind, task_id: taskId, meta }).select().single();
    if (data) this.set((s) => ({ events: [...s.events, data as TaskEvent] }));
  }

  // Goals
  async saveGoal(input: { id?: string; name: string; target_idr: number | null; makeCurrent?: boolean }) {
    const client = sb();
    if (input.makeCurrent) await client.from("goals").update({ is_current: false }).eq("is_current", true);
    const row = { name: input.name, target_idr: input.target_idr, ...(input.makeCurrent ? { is_current: true } : {}) };
    const q = input.id ? client.from("goals").update(row).eq("id", input.id) : client.from("goals").insert(row);
    const { error } = await q;
    if (error) {
      this.toast(`Couldn't save the goal: ${error.message}`, { tone: "error" });
      return false;
    }
    const { data } = await client.from("goals").select("*").order("created_at");
    this.set({ goals: (data ?? []).map(normalizeGoal) });
    return true;
  }

  async makeGoalCurrent(id: string) {
    return this.saveGoal({ ...this.state.goals.find((g) => g.id === id)!, makeCurrent: true });
  }

  async addSaved(goalId: string, amount: number) {
    const g = this.state.goals.find((x) => x.id === goalId);
    if (!g) return;
    const saved = Math.max(0, g.saved_idr + amount);
    const reached = g.target_idr != null && saved >= g.target_idr && !g.reached_at ? new Date().toISOString() : g.reached_at;
    const { data, error } = await sb().from("goals").update({ saved_idr: saved, reached_at: reached }).eq("id", goalId).select().single();
    if (error || !data) {
      this.toast(SAVE_FAILED, { tone: "error" });
      return;
    }
    const row = normalizeGoal(data);
    this.watchGoalReached(row);
    this.set((s) => ({ goals: upsertById(s.goals, row) }));
  }

  async deleteGoal(id: string) {
    const { error } = await sb().from("goals").delete().eq("id", id);
    if (error) return this.toast(SAVE_FAILED, { tone: "error" });
    this.set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
  }

  private watchGoalReached(row: Goal) {
    const prev = this.state.goals.find((g) => g.id === row.id);
    if (row.reached_at && prev && !prev.reached_at) this.set({ celebrate: { kind: "goal_reached", goalId: row.id } });
  }

  // Blocks
  async pinBlock(blockId: string, startAt: string, endAt: string) {
    const before = this.state.blocks;
    this.set((s) => ({ blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, start_at: startAt, end_at: endAt, pinned: true, source: "manual" } : b)) }));
    const { error } = await sb().from("schedule_blocks").update({ start_at: startAt, end_at: endAt, pinned: true, source: "manual" }).eq("id", blockId);
    if (error) {
      this.set({ blocks: before });
      this.toast(SAVE_FAILED, { tone: "error" });
      return;
    }
    this.lastCause = this.state.blocks.find((b) => b.id === blockId)?.task_id ?? null;
    this.scheduleReconcile(true);
  }

  async addBlock(taskId: string, startAt: string, endAt: string) {
    const { data, error } = await sb()
      .from("schedule_blocks")
      .insert({ task_id: taskId, start_at: startAt, end_at: endAt, pinned: true, source: "manual" })
      .select()
      .single();
    if (error || !data) return this.toast(SAVE_FAILED, { tone: "error" });
    // A manual block replaces any auto blocks for the same task.
    this.set((s) => ({ blocks: [...s.blocks, data as ScheduleBlock] }));
    this.lastCause = taskId;
    this.scheduleReconcile(true);
  }

  async unpinBlock(blockId: string) {
    await sb().from("schedule_blocks").delete().eq("id", blockId);
    this.set((s) => ({ blocks: s.blocks.filter((b) => b.id !== blockId) }));
    this.scheduleReconcile(true);
  }

  async addBusy(title: string, startAt: string, endAt: string) {
    const { data, error } = await sb().from("busy_blocks").insert({ title, start_at: startAt, end_at: endAt }).select().single();
    if (error || !data) return this.toast(`Couldn't add that: ${error?.message ?? "no response"}`, { tone: "error" });
    this.set((s) => ({ busy: upsertById(s.busy, data as BusyBlock) }));
    this.scheduleReconcile();
  }

  async deleteBusy(id: string) {
    await sb().from("busy_blocks").delete().eq("id", id);
    this.set((s) => ({ busy: s.busy.filter((b) => b.id !== id) }));
    this.scheduleReconcile();
  }

  // ---------- Otto decides: start-by and the schedule ----------

  scheduleReconcile(announce = false) {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => void this.reconcile(announce), 700);
  }

  private async reconcile(announce: boolean) {
    if (this.state.phase !== "ready" && this.state.phase !== "claiming") return;
    if (this.reconciling) return this.scheduleReconcile(announce);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.reconciling = true;
    try {
      const { settings, tasks, blocks, busy } = this.state;
      const client = sb();

      // Start-by follows the deadline and estimate; only write when it changed.
      for (const t of tasks) {
        if (t.id.startsWith("tmp-") || t.status === "done" || t.status === "dropped") continue;
        const auto = computeStartByAuto(t, settings);
        if (auto !== t.start_by_auto) await this.updateTask(t.id, { start_by_auto: auto }, { quiet: true });
      }

      const now = new Date();
      const energy = this.todayEnergy();
      const tasksById = new Map(this.state.tasks.map((t) => [t.id, t]));
      const result = buildSchedule({
        tasks: this.state.tasks.filter((t) => !t.id.startsWith("tmp-")),
        blocks,
        busy,
        settings,
        now,
        energyToday: energy,
        scoreOf: (t) => scoreTask(t, now, { settings, tasksById }).score,
      });

      const keep = new Set(result.blocks.map((b) => b.id));
      const oldById = new Map(blocks.map((b) => [b.id, b]));
      const removed = blocks.filter((b) => !keep.has(b.id));
      const added = result.blocks.filter((b) => !oldById.has(b.id));
      const changed = result.blocks.filter((b) => {
        const o = oldById.get(b.id);
        return o && (o.start_at !== b.start_at || o.end_at !== b.end_at || o.pinned !== b.pinned || o.source !== b.source);
      });
      if (!removed.length && !added.length && !changed.length) return;

      if (removed.length) await client.from("schedule_blocks").delete().in("id", removed.map((b) => b.id));
      if (added.length) {
        await client.from("schedule_blocks").insert(
          added.map(({ id, task_id, start_at, end_at, pinned, source }) => ({ id, task_id, start_at, end_at, pinned, source })),
        );
      }
      for (const b of changed) {
        await client.from("schedule_blocks").update({ start_at: b.start_at, end_at: b.end_at, pinned: b.pinned, source: b.source }).eq("id", b.id);
      }
      this.set({ blocks: result.blocks });

      for (const b of added.filter((x) => x.source === "force")) {
        const t = tasksById.get(b.task_id);
        if (t) this.toast(forcedMessage(t, localTime(b.start_at, this.tz)), { otto: true, ms: 6000 });
      }
      if (announce || this.lastCause) {
        const msg = knockOnMessage(result.moved, this.state.tasks, this.tz, this.lastCause ?? undefined);
        if (msg && result.moved.some((m) => m.taskId !== this.lastCause)) this.toast(msg, { otto: true });
      }
    } catch (err) {
      console.error("reconcile failed", err);
    } finally {
      this.lastCause = null;
      this.reconciling = false;
    }
  }

  // ---------- derived ----------

  todayEnergy(): EnergyLevel | null {
    const today = this.today();
    const todays = this.state.checkins.filter((c) => localDate(c.at, this.tz) === today);
    return todays.length ? todays[todays.length - 1].level : null;
  }

  yesterday() {
    return addDays(this.today(), -1);
  }
}

export const store = new OttoStore();

export function useOtto<T>(select: (s: StoreState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.state),
    () => select(store.state),
  );
}
