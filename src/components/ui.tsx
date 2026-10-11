"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { IconChevron, IconClose } from "./Icons";
import type { Project } from "@/engine/types";
import { projectName } from "@/engine/format";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "soft" | "ghost" | "outline" | "danger" | "onAccent" | "onAccentSoft";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink",
  soft: "bg-accent-soft text-ink",
  ghost: "bg-transparent text-ink hoverable",
  outline: "bg-panel text-ink border border-line hoverable",
  danger: "bg-transparent text-late border border-line hoverable",
  onAccent: "bg-accent-ink text-accent",
  onAccentSoft: "bg-[color-mix(in_oklab,var(--accent-ink)_16%,transparent)] text-accent-ink",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "min-h-11 px-3.5 text-[15px]", md: "min-h-11 px-4 text-[16px]", lg: "min-h-14 px-5 text-[17px]" };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[13px] font-medium",
        "transition-[background-color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx("min-h-11 px-1 text-[15px] font-medium text-accent underline-offset-4 hover:underline", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = "section", ...rest }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx("rounded-[18px] border border-line bg-panel p-4 shadow-[var(--shadow-card)] sm:p-5", className)} {...rest}>
      {children}
    </As>
  );
}

export function CountPill({ n, tone = "default" }: { n: number; tone?: "default" | "late" | "accent" }) {
  const tones = {
    default: "bg-panel-2 text-muted border-line",
    late: "bg-late-soft text-late border-[color-mix(in_oklab,var(--late)_30%,transparent)]",
    accent: "bg-accent-soft text-accent border-transparent",
  };
  return <span className={cx("num inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-[13px]", tones[tone])}>{n}</span>;
}

export function OttoBadge() {
  return (
    <span className="brand inline-flex h-[18px] items-center rounded-full bg-accent px-1.5 text-[9px] leading-none text-accent-ink" aria-label="Otto">
      OTTO
    </span>
  );
}

/** System line in Otto's voice. Electra's own text never gets the badge. */
export function OttoLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("flex items-start gap-2 text-[15px] leading-snug text-ink", className)}>
      <span className="mt-[3px] shrink-0">
        <OttoBadge />
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Fold({
  title,
  count,
  tone,
  defaultOpen = false,
  storageKey,
  className,
  children,
  hint,
}: {
  title: string;
  count?: number;
  tone?: "default" | "late" | "accent";
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const v = sessionStorage.getItem(`otto.fold.${storageKey}`);
      if (v != null) setOpen(v === "1");
    } catch {}
  }, [storageKey]);
  const toggle = () => {
    setOpen((o) => {
      if (storageKey) {
        try {
          sessionStorage.setItem(`otto.fold.${storageKey}`, o ? "0" : "1");
        } catch {}
      }
      return !o;
    });
  };
  return (
    <section
      className={cx(
        "rounded-[18px] border bg-panel",
        tone === "late" ? "border-[color-mix(in_oklab,var(--late)_45%,var(--line))]" : "border-line",
        className,
      )}
    >
      <button type="button" onClick={toggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <IconChevron open={open} size={18} className="text-muted" />
        <span className="flex-1 text-[16px] font-medium">{title}</span>
        {count != null && <CountPill n={count} tone={tone} />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {hint}
          {children}
        </div>
      )}
    </section>
  );
}

const PROJECT_COLOR: Record<Project, string> = {
  omnisync: "var(--amber)",
  teba: "var(--soil)",
  content: "var(--plum)",
  personal: "var(--coral)",
};

export function projectColor(p: Project | null) {
  return p ? PROJECT_COLOR[p] : "var(--muted)";
}

export function ProjectDot({ project }: { project: Project | null }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: projectColor(project) }} aria-hidden="true" />;
}

export function ProjectTag({ project }: { project: Project | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <ProjectDot project={project} />
      {projectName(project)}
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="anim-fade absolute inset-0 bg-[rgb(10_20_15/0.38)]" onClick={onClose} />
      <div
        ref={ref}
        className={cx(
          "anim-sheet safe-bottom relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] border border-line bg-panel shadow-[var(--shadow-card)] md:rounded-[22px]",
          wide ? "md:max-w-2xl" : "md:max-w-lg",
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden="true" />
        <header className="flex items-center gap-2 px-5 pt-3 pb-2">
          <h2 className="flex-1 text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted hoverable" aria-label="Close">
            <IconClose size={20} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-[12px] border border-line bg-panel-2 px-3 text-[16px] text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[13px] border border-line bg-panel-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-10 rounded-[10px] px-3 text-[15px] transition-[background-color,color] duration-150",
            value === o.value ? "bg-accent text-accent-ink" : "text-ink hoverable",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block text-[16px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 rounded-full transition-[background-color] duration-150", checked ? "bg-accent" : "bg-line")}
      >
        <span
          className={cx(
            "absolute top-1 left-1 size-5 rounded-full bg-panel shadow transition-transform duration-150",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-dashed border-line px-4 py-6 text-center text-[15px] text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
