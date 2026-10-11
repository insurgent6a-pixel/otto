"use client";

// Completion feedback has to land within 100ms, so nothing here awaits the network.

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio ??= new Ctor();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

function note(ac: AudioContext, freq: number, at: number, len: number, gain = 0.12) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + len + 0.05);
}

/** 3-note chime for a completion, a longer run for the daily goal or a timer end. */
export function chime(kind: "done" | "goal" | "timer" | "big" = "done") {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  const runs: Record<typeof kind, number[]> = {
    done: [659.25, 783.99, 1046.5],
    timer: [783.99, 659.25, 783.99],
    big: [523.25, 659.25, 783.99, 1046.5],
    goal: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98],
  };
  const step = kind === "goal" ? 0.11 : 0.085;
  runs[kind].forEach((f, i) => note(ac, f, t + i * step, kind === "goal" ? 0.6 : 0.35));
}

export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // iOS Safari has no vibrate; the visual pop still lands.
    }
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const CONFETTI_COLORS = ["--sun", "--accent", "--sun", "--coral", "--plum"];

/** Burst from an element (or the screen center). Canvas lives for ~1.6s then removes itself. */
export function confetti(from?: Element | null, size: "small" | "big" = "small") {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "80",
  });
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) return canvas.remove();
  const css = getComputedStyle(document.documentElement);
  const colors = CONFETTI_COLORS.map((v) => css.getPropertyValue(v).trim() || "#f2bf45");
  const rect = from?.getBoundingClientRect();
  const ox = (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) * dpr;
  const oy = (rect ? rect.top + rect.height / 2 : window.innerHeight / 2) * dpr;
  const count = size === "big" ? 160 : 46;
  const speed = (size === "big" ? 15 : 9) * dpr;
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (size === "big" ? Math.PI * 1.6 : Math.PI * 1.1);
    const v = speed * (0.45 + Math.random() * 0.75);
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: (4 + Math.random() * 5) * dpr,
      h: (6 + Math.random() * 8) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const started = performance.now();
  const life = size === "big" ? 2200 : 1400;
  const frame = (t: number) => {
    const k = (t - started) / life;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.38 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - k * k);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  cachedVoice =
    en.find((v) => /premium/i.test(v.name)) ??
    en.find((v) => /enhanced/i.test(v.name)) ??
    en.find((v) => v.localService && /samantha|ava|zoe|serena|daniel/i.test(v.name)) ??
    en.find((v) => v.localService) ??
    en[0] ??
    null;
  return cachedVoice;
}

/** Only call from a tap handler: iOS ignores speech that isn't tied to a user gesture. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = 1.02;
  u.pitch = 1;
  synth.speak(u);
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cachedVoice = undefined;
  });
}
