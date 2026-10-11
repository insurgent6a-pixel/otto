"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { store, useOtto } from "@/lib/store";
import { ensureTimerLoop } from "@/lib/actions";
import { Login, Unconfigured, Foreign } from "./Login";
import { IconCalendar, IconGoal, IconList, IconPlus, IconSettings, IconToday, IconWaiting, OttoMark, Ring } from "./Icons";
import { Button, cx, ProjectDot } from "./ui";
import { Toasts } from "./Toasts";
import { Sheets } from "./Sheets";
import { CommandPalette, HelpOverlay, useShortcuts } from "./Palette";
import { Celebrate } from "./Celebrate";
import { PROJECTS } from "@/engine/types";
import { projectName } from "@/engine/format";
import { usePulse } from "./usePulse";
import { registerServiceWorker } from "@/lib/push";

const TABS = [
  { href: "/", label: "Today", Icon: IconToday },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/waiting", label: "Waiting", Icon: IconWaiting },
  { href: "/goals", label: "Goals", Icon: IconGoal },
];

export function AppShell({ children }: { children: ReactNode }) {
  const phase = useOtto((s) => s.phase);
  const theme = useOtto((s) => s.theme);
  useEffect(() => {
    store.start();
    ensureTimerLoop();
    void registerServiceWorker();
  }, []);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (phase === "unconfigured") return <Unconfigured />;
  if (phase === "signed_out") return <Login />;
  if (phase === "foreign") return <Foreign />;
  if (phase === "loading" || phase === "claiming") return <Loading />;
  return <Ready>{children}</Ready>;
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="flex items-center gap-3 text-muted">
        <OttoMark size={28} />
        <span className="text-[15px]">Opening Otto...</span>
      </div>
    </div>
  );
}

function Ready({ children }: { children: ReactNode }) {
  useShortcuts();
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") === "1") {
      store.openSheet({ kind: "add" });
      router.replace("/");
    }
  }, [router]);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar />
      <div className="min-w-0 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      <BottomTabs />
      <Sheets />
      <Toasts />
      <CommandPalette />
      <HelpOverlay />
      <Celebrate />
    </div>
  );
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

function BottomTabs() {
  const path = usePathname();
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);
  const tab = (t: (typeof TABS)[number]) => {
    const active = isActive(path, t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-accent" : "text-muted")}
      >
        <t.Icon size={23} />
        <span className={active ? "font-semibold" : undefined}>{t.label}</span>
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[var(--bar-bg)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-end px-2">
        {left.map(tab)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Add a task"
            onClick={() => store.openSheet({ kind: "add" })}
            className="-mt-5 mb-1 grid size-[58px] place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_22px_-8px_color-mix(in_oklab,var(--accent)_70%,transparent)] transition-transform duration-150 active:scale-95"
          >
            <IconPlus size={28} strokeWidth={2.2} />
          </button>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}

function Sidebar() {
  const path = usePathname();
  const pulse = usePulse();
  const views = [...TABS, { href: "/all", label: "All tasks", Icon: IconList }, { href: "/settings", label: "Settings", Icon: IconSettings }];
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-panel-2 px-3 py-5 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
        <OttoMark size={26} />
        <span className="brand text-[17px]">OTTO</span>
      </Link>
      <Button variant="primary" className="mx-1 mb-5" onClick={() => store.openSheet({ kind: "add" })}>
        <IconPlus size={18} /> Add a task
      </Button>
      <nav aria-label="Views" className="space-y-0.5">
        {views.map((v, i) => {
          const active = isActive(path, v.href);
          return (
            <Link
              key={v.href}
              href={v.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-3 rounded-[11px] px-3 text-[15px]",
                active ? "bg-accent-soft font-semibold text-ink" : "text-muted hoverable",
              )}
            >
              <v.Icon size={19} className={active ? "text-accent" : undefined} />
              <span className="flex-1">{v.label}</span>
              {i < 4 && <kbd className="num text-[11px] text-muted">{i + 1}</kbd>}
            </Link>
          );
        })}
      </nav>
      <p className="mt-6 mb-1.5 px-3 text-[13px] font-medium text-muted">Projects</p>
      <nav aria-label="Projects" className="space-y-0.5">
        {PROJECTS.map((p) => (
          <Link key={p} href={`/all?project=${p}`} className="flex min-h-9 items-center gap-3 rounded-[11px] px-3 text-[15px] text-muted hoverable">
            <ProjectDot project={p} />
            {projectName(p)}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-[16px] border border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          <Ring value={pulse.score / 100} size={40} stroke={4} />
          <div>
            <p className="num text-[20px] leading-none font-semibold text-fire">{pulse.score}</p>
            <p className="mt-1 text-[13px] text-muted">Score today</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Momentum <span className="num text-ink">{pulse.momentum}</span>{" "}
          <span aria-label={`trend ${pulse.trend}`}>{pulse.trend === "up" ? "↑" : pulse.trend === "down" ? "↓" : "→"}</span>
          {" · "}
          <span className="text-fire">{pulse.streak} day streak</span>
        </p>
      </div>
    </aside>
  );
}
