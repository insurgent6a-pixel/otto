import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconFlame = (p: P) => (
  <Svg {...p}>
    <path
      d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-2.7 1.6-4.6 3.1-6.2.5 1.6 1.4 2.6 2.4 2.9-.3-3 1-5.7 3.3-7.5.3 2.4 1.5 4 2.9 5.5 1.3 1.4 2.3 3 2.3 5.3C19.5 18.4 16 21 12 21Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M12 21c-1.7 0-2.8-1.1-2.8-2.7 0-1.4 1-2.4 2-3.4.2 1 .8 1.6 1.4 1.8.1-1 .6-1.9 1.3-2.5.6 1 1.5 2 1.5 3.6 0 1.8-1.5 3.2-3.4 3.2Z" fill="var(--panel)" stroke="none" opacity=".55" />
  </Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconToday = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </Svg>
);

export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const IconWaiting = (p: P) => (
  <Svg {...p}>
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5" />
  </Svg>
);

export const IconGoal = (p: P) => (
  <Svg {...p}>
    <path d="M12 21c-.5-3.5-2.6-6-6.5-7 1.3-3.6 4-5.4 6.5-5.4s5.2 1.8 6.5 5.4c-3.9 1-6 3.5-6.5 7Z" />
    <path d="M12 8.6V3M9.5 5.5 12 3l2.5 2.5" />
  </Svg>
);

export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.6" cy="6.5" r="1" fill="currentColor" />
    <circle cx="4.6" cy="12" r="1" fill="currentColor" />
    <circle cx="4.6" cy="17.5" r="1" fill="currentColor" />
  </Svg>
);

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Svg>
);

export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

export const IconChevron = ({ open, ...p }: P & { open?: boolean }) => (
  <Svg {...p} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 160ms ease" }}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21v-5M8 4h8l-1 6 3 3H6l3-3-1-6Z" />
  </Svg>
);

/** 3-bar signal icon for the energy check-in. */
export function Signal({ level, size = 22 }: { level: 1 | 2 | 3; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={4 + i * 6}
          y={16 - i * 5}
          width="4"
          height={5 + i * 5}
          rx="1.5"
          fill="currentColor"
          opacity={i < level ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

/** Small progress ring, fire red for the score. */
export function Ring({ value, size = 18, stroke = 3, color = "var(--fire)" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OttoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M 382.75 252.18 A 128 128 0 1 1 269.38 142.7"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="66"
        strokeLinecap="round"
      />
      <line x1="256" y1="270" x2="342.15" y2="181.08" stroke="var(--accent)" strokeWidth="26" strokeLinecap="round" />
      <circle cx="256" cy="270" r="22" fill="var(--accent)" />
    </svg>
  );
}
