"use client";

import { useEffect, useMemo, useState } from "react";
import { store, useOtto, type SettingsRow } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { enablePush, isStandalone, pushSupport, resubscribe, sendTestPush, type PushSupport } from "@/lib/push";
import { CLAUDE_INSTRUCTIONS } from "@/lib/claudeInstructions";
import { localDate, localTime, tzLabel, zonedInstant } from "@/engine/time";
import { tzChangedLine } from "@/engine/messages";
import { expandPipeline, parsePipelineSteps } from "@/engine/pipeline";
import { relativeDayLabel } from "@/engine/format";
import type { PipelineTemplate, TimeWindow } from "@/engine/types";
import { Button, Card, Field, LinkButton, OttoLine, Segmented, Toggle, cx, inputClass } from "./ui";

const QUICK_ZONES = [
  { tz: "Asia/Jakarta", label: "WIB", hint: "Jakarta, Java, Sumatra" },
  { tz: "Asia/Makassar", label: "WITA", hint: "Bali, Makassar, Lombok" },
  { tz: "Asia/Jayapura", label: "WIT", hint: "Papua, Maluku" },
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <Card id={id} aria-label={title} className="scroll-mt-6">
      <h2 className="mb-4 text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input readOnly className={cx(inputClass, "num text-[14px]")} value={shown ? value : "•".repeat(24)} aria-label={label} />
        {secret && (
          <Button variant="ghost" onClick={() => setShown(!shown)}>
            {shown ? "Hide" : "Show"}
          </Button>
        )}
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}

function useSetting() {
  return (patch: Partial<SettingsRow>) => void store.updateSettings(patch);
}

function TimezoneSection() {
  const tz = useOtto((s) => s.settings.timezone);
  const now = useOtto((s) => s.now);
  const [query, setQuery] = useState("");
  const all = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return QUICK_ZONES.map((z) => z.tz);
    }
  }, []);
  const device = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const matches = query.trim() ? all.filter((z) => z.toLowerCase().includes(query.trim().toLowerCase().replace(/\s+/g, "_"))).slice(0, 8) : [];
  const choose = async (next: string) => {
    if (next === tz) return;
    const ok = await store.updateSettings({ timezone: next });
    if (ok) store.toast(tzChangedLine(tzLabel(next)), { otto: true });
    setQuery("");
  };
  const nowLocal = `${localTime(now, tz)} ${tzLabel(tz)}`;
  return (
    <Section title="Time zone" id="timezone">
      <p className="text-[15px] text-muted">
        Otto plans your day, deadlines and reminders in this zone. It&apos;s <span className="num text-ink">{nowLocal}</span> there now.
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Indonesian time zones">
        {QUICK_ZONES.map((z) => (
          <button
            key={z.tz}
            type="button"
            role="radio"
            aria-checked={tz === z.tz}
            onClick={() => void choose(z.tz)}
            className={cx(
              "flex min-h-[68px] flex-col items-start justify-center rounded-[14px] border px-3 text-left transition-[background-color,border-color] duration-150",
              tz === z.tz ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel-2 hoverable",
            )}
          >
            <span className="text-[17px] font-semibold">{z.label}</span>
            <span className={cx("text-[12px]", tz === z.tz ? undefined : "text-muted")}>{z.hint}</span>
          </button>
        ))}
      </div>
      {!QUICK_ZONES.some((z) => z.tz === tz) && (
        <p className="text-[15px]">
          Current: <span className="font-medium">{tz.replace(/_/g, " ")}</span> <span className="num text-muted">({tzLabel(tz)})</span>
        </p>
      )}
      <Field label="Somewhere else">
        <input className={inputClass} placeholder="Search a city, like Tokyo or London" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {matches.length > 0 && (
        <ul className="-mt-2 rounded-[12px] border border-line">
          {matches.map((z) => (
            <li key={z}>
              <button type="button" onClick={() => void choose(z)} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-[15px] hoverable">
                <span>{z.replace(/_/g, " ")}</span>
                <span className="num text-[13px] text-muted">
                  {localTime(now, z)} {tzLabel(z)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {device && device !== tz && (
        <LinkButton onClick={() => void choose(device)}>
          Use this device&apos;s zone ({device.replace(/_/g, " ")}, {tzLabel(device)})
        </LinkButton>
      )}
    </Section>
  );
}

function TimeInput({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  return <input type="time" step={900} className={cx(inputClass, "num w-[130px]")} value={value} onChange={(e) => e.target.value && onSave(e.target.value)} aria-label={label} />;
}

function DaySection() {
  const s = useOtto((x) => x.settings);
  const set = useSetting();
  const windows = s.energy_windows ?? [];
  const setWindows = (w: TimeWindow[]) => set({ energy_windows: w });
  return (
    <Section title="Your day">
      <Field label="Your name">
        <input
          className={inputClass}
          defaultValue={s.display_name}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.display_name && set({ display_name: e.target.value.trim() })}
        />
      </Field>
      <Field label="Work hours">
        <div className="flex items-center gap-2">
          <TimeInput label="Work starts" value={s.work_start} onSave={(v) => set({ work_start: v })} />
          <span className="text-muted">to</span>
          <TimeInput label="Work ends" value={s.work_end} onSave={(v) => set({ work_end: v })} />
        </div>
      </Field>
      <Field label="Work days">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const n = i + 1;
            const on = s.work_days.includes(n);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set({ work_days: on ? s.work_days.filter((x) => x !== n) : [...s.work_days, n].sort() })}
                className={cx("min-h-11 min-w-12 rounded-[12px] border text-[15px]", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel-2 hoverable")}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="High-energy windows" hint="Otto puts deep work here first.">
        <div className="space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <TimeInput label="Window starts" value={w.start} onSave={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
              <span className="text-muted">to</span>
              <TimeInput label="Window ends" value={w.end} onSave={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
              <Button variant="ghost" onClick={() => setWindows(windows.filter((_, j) => j !== i))} aria-label="Remove window">
                Remove
              </Button>
            </div>
          ))}
          <LinkButton onClick={() => setWindows([...windows, { start: "14:00", end: "16:00" }])}>Add a window</LinkButton>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily goal" hint="Tasks done for today to count as a win.">
          <div className="flex items-center gap-2">
            <Button aria-label="One less" onClick={() => set({ daily_goal: Math.max(1, s.daily_goal - 1) })}>
              −
            </Button>
            <span className="num w-10 text-center text-[20px] font-semibold">{s.daily_goal}</span>
            <Button aria-label="One more" onClick={() => set({ daily_goal: Math.min(20, s.daily_goal + 1) })}>
              +
            </Button>
          </div>
        </Field>
        <Field label="Focus hours a day" hint="Most Otto will plan into one day.">
          <select className={inputClass} value={s.focus_cap_min} onChange={(e) => set({ focus_cap_min: Number(e.target.value) })}>
            {[120, 180, 240, 300, 360, 420, 480].map((m) => (
              <option key={m} value={m}>
                {m / 60} hours
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Quiet hours" hint="No reminders and no planning in here.">
        <div className="flex items-center gap-2">
          <TimeInput label="Quiet from" value={s.quiet_start} onSave={(v) => set({ quiet_start: v })} />
          <span className="text-muted">to</span>
          <TimeInput label="Quiet until" value={s.quiet_end} onSave={(v) => set({ quiet_end: v })} />
        </div>
      </Field>
      <Field label="Follow up after" hint="Default return date when you hand something off.">
        <select className={inputClass} value={s.followup_days} onChange={(e) => set({ followup_days: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 7, 10, 14].map((d) => (
            <option key={d} value={d}>
              {d} {d === 1 ? "day" : "days"}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

function OttoSection() {
  const s = useOtto((x) => x.settings);
  const theme = useOtto((x) => x.theme);
  const set = useSetting();
  return (
    <Section title="Otto">
      <Field label="Tone">
        <Segmented<"steady" | "hype">
          label="Tone"
          value={s.tone}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "steady", label: "Steady, with tough love" },
            { value: "hype", label: "Hype only" },
          ]}
        />
      </Field>
      <Toggle label="Otto speaks" hint="Short lines out loud after you tap." checked={s.speak} onChange={(v) => set({ speak: v })} />
      <Toggle label="Sound" hint="Chimes on done and timer end." checked={s.sound} onChange={(v) => set({ sound: v })} />
      <Toggle label="Haptics" hint="A tick where your phone supports it." checked={s.haptics} onChange={(v) => set({ haptics: v })} />
      <Field label="Theme">
        <Segmented<"system" | "light" | "dark">
          label="Theme"
          value={theme}
          onChange={(v) => store.setTheme(v)}
          options={[
            { value: "system", label: "Follow system" },
            { value: "light", label: "Solarpunk Day" },
            { value: "dark", label: "Forest Night" },
          ]}
        />
      </Field>
    </Section>
  );
}

function RemindersSection() {
  const tz = useOtto((x) => x.settings.timezone);
  const email = useOtto((x) => x.settings.fallback_email);
  const now = useOtto((x) => x.now);
  const [support] = useState<PushSupport>(() => pushSupport());
  const [enabled, setEnabled] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await sb().from("push_subscriptions").select("last_ok_at").order("last_ok_at", { ascending: false, nullsFirst: false }).limit(1);
    setLastOk((data?.[0]?.last_ok_at as string | null) ?? null);
  };

  useEffect(() => {
    void sb()
      .from("push_subscriptions")
      .select("last_ok_at")
      .order("last_ok_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .then(({ data }) => setLastOk((data?.[0]?.last_ok_at as string | null) ?? null));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await enablePush();
      setEnabled(true);
      setMsg("Reminders on.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't turn reminders on. Try again.");
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await resubscribe();
      setMsg(await sendTestPush());
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Test failed. Try again.");
    }
    setBusy(false);
  };

  const today = localDate(now, tz);
  const last = lastOk ? `${localDate(lastOk, tz) === today ? "" : `${relativeDayLabel(localDate(lastOk, tz), today)} `}${localTime(lastOk, tz)}` : null;

  return (
    <Section title="Reminders" id="reminders">
      {support === "needs_install" ? (
        <div className="space-y-2 text-[15px]">
          <p>On iPhone, reminders work once Otto is on your home screen:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Tap the Share button in Safari.</li>
            <li>Tap Add to Home Screen, then Add.</li>
            <li>Open Otto from the home screen and come back here.</li>
          </ol>
        </div>
      ) : support === "unsupported" ? (
        <p className="text-[15px] text-muted">This browser can&apos;t show reminders. Use Otto from your home screen or a desktop browser.</p>
      ) : enabled ? (
        <>
          <OttoLine>{last ? `Reminders on. Last delivered ${last}.` : "Reminders on. Nothing delivered yet."}</OttoLine>
          <Button onClick={() => void test()} disabled={busy}>
            {busy ? "Sending..." : "Send test"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-[15px] text-muted">
            Otto nudges you 10 minutes before a block, on start-by and deadline days, and with a summary at 08:00 and a wrap-up at 17:00. Quiet hours stay quiet.
          </p>
          <Button variant="primary" onClick={() => void turnOn()} disabled={busy}>
            Turn on reminders
          </Button>
        </>
      )}
      {msg && <p className="text-[15px]" role="status">{msg}</p>}
      <Field label="Backup email" hint="If no reminder gets through for a day, the 08:00 summary comes here.">
        <input
          type="email"
          className={inputClass}
          placeholder="you@example.com"
          defaultValue={email ?? ""}
          onBlur={(e) => e.target.value.trim() !== (email ?? "") && void store.updateSettings({ fallback_email: e.target.value.trim() || null })}
        />
      </Field>
      {support === "ok" && isStandalone() === false && <p className="text-[13px] text-muted">Tip: install Otto with your browser&apos;s Install button so it opens like an app.</p>}
    </Section>
  );
}

function BusySection() {
  const busy = useOtto((x) => x.busy);
  const tz = useOtto((x) => x.settings.timezone);
  const now = useOtto((x) => x.now);
  const today = localDate(now, tz);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const upcoming = busy.filter((b) => new Date(b.end_at).getTime() > now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  return (
    <Section title="Busy times">
      <p className="text-[15px] text-muted">Fixed commitments Otto plans around, like school runs or the gym.</p>
      {upcoming.length > 0 && (
        <ul className="space-y-1">
          {upcoming.map((b) => (
            <li key={b.id} className="flex min-h-11 items-center gap-3 rounded-[12px] border border-line px-3">
              <span className="flex-1 text-[15px]">{b.title}</span>
              <span className="num text-[13px] text-muted">
                {relativeDayLabel(localDate(b.start_at, tz), today)} {localTime(b.start_at, tz)} to {localTime(b.end_at, tz)}
              </span>
              <LinkButton onClick={() => void store.deleteBusy(b.id)}>Remove</LinkButton>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || end <= start) return;
          void store.addBusy(title.trim(), zonedInstant(day, start, tz).toISOString(), zonedInstant(day, end, tz).toISOString());
          setTitle("");
        }}
      >
        <input className={inputClass} placeholder="Doctor" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="What" />
        <input type="date" className={cx(inputClass, "num")} value={day} min={today} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        <TimeInput label="From" value={start} onSave={setStart} />
        <TimeInput label="To" value={end} onSave={setEnd} />
        <Button type="submit" disabled={!title.trim() || end <= start}>
          Add
        </Button>
      </form>
    </Section>
  );
}

function ConnectSection() {
  const s = useOtto((x) => x.settings);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <>
      <Section title="Siri Shortcut" id="siri">
        <p className="text-[15px] text-muted">
          Say &ldquo;Hey Siri, Otto&rdquo; and dictate. Build the Shortcut with Get Contents of URL, method POST, JSON body with p_secret and p_text. SETUP.md has every step.
        </p>
        <CopyField label="URL" value={`${origin}/api/capture`} />
        {s.capture_secret && <CopyField label="Capture key (p_secret)" value={s.capture_secret} secret />}
      </Section>
      <Section title="Claude" id="claude">
        <p className="text-[15px] text-muted">Create a Claude Project called Otto and paste these instructions. Connect Supabase in Claude under Settings, Connectors.</p>
        <details className="rounded-[12px] border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-[15px] font-medium">Show the instructions</summary>
          <pre className="max-h-72 overflow-auto px-3 pb-3 text-[12px] whitespace-pre-wrap text-muted">{CLAUDE_INSTRUCTIONS}</pre>
        </details>
        <CopyField label="Project instructions" value={CLAUDE_INSTRUCTIONS} />
        {s.mcp_secret && (
          <>
            <p className="text-[15px] text-muted">Optional: a smaller Otto connector with just six actions. Add it in Claude as a custom connector.</p>
            <CopyField label="Otto connector URL" value={`${origin}/api/mcp/${s.mcp_secret}`} secret />
          </>
        )}
      </Section>
      <Section title="Calendar feed" id="feed">
        <p className="text-[15px] text-muted">
          Subscribe in iPhone Calendar: Settings, Calendar, Accounts, Add Subscribed Calendar. Turn Remove Alerts off when you subscribe.
        </p>
        {s.ics_secret && <CopyField label="Feed URL" value={`${origin}/cal/${s.ics_secret}.ics`} secret />}
      </Section>
    </>
  );
}

function PipelinesSection() {
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState("");
  const parsed = parsePipelineSteps(steps);

  const load = async () => {
    const { data } = await sb().from("pipeline_templates").select("*").order("created_at");
    setTemplates((data ?? []) as PipelineTemplate[]);
  };
  useEffect(() => {
    void sb()
      .from("pipeline_templates")
      .select("*")
      .order("created_at")
      .then(({ data }) => setTemplates((data ?? []) as PipelineTemplate[]));
  }, []);

  const run = async (t: PipelineTemplate) => {
    const start = store.today();
    const payloads = expandPipeline(t, start);
    let prev: string | null = null;
    for (const p of payloads) {
      const saved = await store.addTask({ ...p, title: p.title ?? t.name, depends_on: prev ? [prev] : [] });
      prev = saved?.id ?? prev;
    }
    store.toast(`Started ${t.name}: ${payloads.length} steps, last one ${relativeDayLabel(payloads.at(-1)?.deadline ?? start, start)}.`, { otto: true });
  };

  return (
    <Section title="Pipelines">
      <p className="text-[15px] text-muted">Repeatable step lists, like a compost batch. You write the timeline. Otto never guesses one.</p>
      {templates.map((t) => (
        <div key={t.id} className="flex min-h-11 items-center gap-2 rounded-[12px] border border-line px-3">
          <span className="flex-1 text-[15px]">
            {t.name} <span className="text-[13px] text-muted">{t.steps.length} steps</span>
          </span>
          <Button size="sm" variant="soft" onClick={() => void run(t)}>
            Start today
          </Button>
          <LinkButton
            onClick={async () => {
              await sb().from("pipeline_templates").delete().eq("id", t.id);
              void load();
            }}
          >
            Delete
          </LinkButton>
        </div>
      ))}
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !parsed.length) return;
          const { error } = await sb().from("pipeline_templates").insert({ name: name.trim(), steps: parsed });
          if (error) return store.toast(`Couldn't save the pipeline: ${error.message}`, { tone: "error" });
          setName("");
          setSteps("");
          void load();
        }}
      >
        <input className={inputClass} placeholder="Compost batch" value={name} onChange={(e) => setName(e.target.value)} aria-label="Pipeline name" />
        <textarea
          className={cx(inputClass, "min-h-28 py-2")}
          placeholder={"day 0: Mix the batch ~30m\nday 7: Turn the pile\nday 30: Check if it's ready"}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          aria-label="Steps, one per line"
        />
        <p className="text-[13px] text-muted">
          {parsed.length ? `${parsed.length} steps read. Last one on day ${parsed.at(-1)?.offset_days}.` : "One step per line: day number, then what to do."}
        </p>
        <Button type="submit" disabled={!name.trim() || !parsed.length}>
          Save pipeline
        </Button>
      </form>
    </Section>
  );
}

export function SettingsView() {
  return (
    <div className="safe-top mx-auto max-w-2xl px-4 [--pad-top:1rem] pb-10 sm:px-6 md:[--pad-top:1.5rem]">
      <h1 className="mb-4 text-[28px] leading-tight font-semibold tracking-[-0.02em]">Settings</h1>
      <div className="space-y-4">
        <TimezoneSection />
        <DaySection />
        <OttoSection />
        <RemindersSection />
        <BusySection />
        <ConnectSection />
        <PipelinesSection />
        <Card>
          <Button variant="danger" onClick={() => void sb().auth.signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    </div>
  );
}
