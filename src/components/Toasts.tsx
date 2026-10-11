"use client";

import { store, useOtto } from "@/lib/store";
import { OttoBadge, cx } from "./ui";

export function Toasts() {
  const toasts = useOtto((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-70 flex flex-col items-center gap-2 px-4 md:bottom-6"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "anim-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[16px] border px-4 py-2.5 shadow-[var(--shadow-card)]",
            t.tone === "error" ? "border-late bg-panel text-ink" : "border-line bg-ink text-bg",
          )}
        >
          {t.otto && <OttoBadge />}
          <p className="min-w-0 flex-1 text-[15px] leading-snug">{t.text}</p>
          {t.undo && (
            <button
              type="button"
              className={cx("min-h-11 shrink-0 px-2 text-[15px] font-semibold", t.tone === "error" ? "text-accent" : "text-sun")}
              onClick={() => {
                t.undo?.();
                store.dismissToast(t.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
