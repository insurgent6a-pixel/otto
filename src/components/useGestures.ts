"use client";

import { useRef, useState } from "react";

/** Long-press (450ms) without stealing normal taps or scrolls. */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      if (fired.current) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }
    },
  };
}

/** Horizontal swipe with a threshold. Vertical movement hands control back to scrolling. */
export function useSwipe({ onRight, onLeft, threshold = 84 }: { onRight?: () => void; onLeft?: () => void; threshold?: number }) {
  const [dx, setDx] = useState(0);
  const origin = useRef<{ x: number; y: number; locked: "x" | "y" | null } | null>(null);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      origin.current = { x: e.clientX, y: e.clientY, locked: null };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (!o) return;
      const mx = e.clientX - o.x;
      const my = e.clientY - o.y;
      if (!o.locked && Math.hypot(mx, my) > 10) o.locked = Math.abs(mx) > Math.abs(my) * 1.3 ? "x" : "y";
      if (o.locked === "x") {
        const allowed = (mx > 0 && onRight) || (mx < 0 && onLeft) ? mx : mx / 5;
        setDx(Math.max(-140, Math.min(140, allowed)));
      }
    },
    onPointerUp: () => {
      const o = origin.current;
      origin.current = null;
      if (o?.locked === "x") {
        if (dx > threshold) onRight?.();
        else if (dx < -threshold) onLeft?.();
      }
      setDx(0);
    },
    onPointerCancel: () => {
      origin.current = null;
      setDx(0);
    },
  };
  return { dx, handlers, past: dx > threshold ? "right" : dx < -threshold ? "left" : null };
}
