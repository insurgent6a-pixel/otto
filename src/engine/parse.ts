// Quick-add parser (spec section 11). Pure: everything relative to ctx.now in ctx.tz.
//
// Rules the UI should know:
// - Bare weekday ('fri', 'jumat') = today when today is that day, else the next one.
//   'next fri' / 'jumat depan' = strictly after today. 'next week' / 'minggu depan' = next Monday.
// - Only the first natural date is a token; later ones stay in the title.
// - Date plus 'at' merge into one scheduled chip and set scheduled_at only (no deadline).
// - 'at 2' without am/pm: hours 1..7 mean pm (business hours). 'at' alone with a passed time = tomorrow.
// - 'sun' alone is not a date ('sun hat'); 'may' or 'march' alone is not a date ('may newsletter').
// - After every/setiap, 'minggu' first means weekly; later in a day list it means Sunday.

import * as chrono from "chrono-node";
import { findBestMatch, findDuplicate, fixNames } from "./fuzzy";
import { formatIdr, parseIdr } from "./money";
import { addDays, formatDate, hm, isoWeekday, localDate, localMinutes, parseDate, tzOffsetMinutes, zonedInstant } from "./time";
import { PROJECTS, type Project, type Task } from "./types";

export interface ParseContext {
  now: Date;
  tz: string;
  openTasks?: { id: string; title: string }[];
}

export type ChipKind =
  | "deadline"
  | "scheduled"
  | "start"
  | "ready"
  | "followup"
  | "priority"
  | "project"
  | "estimate"
  | "energy"
  | "waiting"
  | "repeat"
  | "after"
  | "value";

export interface Chip {
  kind: ChipKind;
  label: string;
}

export interface ParsedQuickAdd {
  title: string;
  fields: Partial<Task>;
  chips: Chip[];
  dependsOn: { query: string; match: { id: string; title: string } | null } | null;
  duplicate: { id: string; title: string; similarity: number } | null;
}

const WEEKDAYS: Record<string, number> = {
  monday: 1, mon: 1, senin: 1,
  tuesday: 2, tue: 2, tues: 2, selasa: 2,
  wednesday: 3, wed: 3, rabu: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, kamis: 4,
  friday: 5, fri: 5, jumat: 5, "jum'at": 5,
  saturday: 6, sat: 6, sabtu: 6,
  sunday: 7, sun: 7, minggu: 7, ahad: 7,
};
const BYDAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ID_TO_EN: Record<string, string> = {
  dalam: "in", hari: "days", minggu: "weeks", bulan: "months",
  januari: "january", februari: "february", maret: "march", mei: "may", juni: "june", juli: "july",
  agustus: "august", agu: "aug", agt: "aug", oktober: "october", okt: "oct", desember: "december", des: "dec",
};
const MONTH = "(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)";
const MONTH_DAY = new RegExp(`^(?:\\d{1,2} ${MONTH}|${MONTH} \\d{1,2})(?: \\d{4})?$`);
const IN_N = /^in \d{1,3} (?:days?|weeks?|months?)$/;

const PROJECT_NAMES: Record<Project, string> = { omnisync: "OmniSync", teba: "Teba", content: "Content", personal: "Personal" };

const clean = (w: string) => w.toLowerCase().replace(/[,;.:!]+$/, "");

interface Hit {
  len: number;
  apply: () => void;
}

export function parseQuickAdd(input: string, ctx: ParseContext): ParsedQuickAdd {
  const { now, tz } = ctx;
  const openTasks = ctx.openTasks ?? [];
  const words = input.trim().split(/\s+/).filter(Boolean);
  const today = localDate(now, tz);
  const thisYear = parseDate(today).y;

  const fields: Partial<Task> = {};
  const chips: Chip[] = [];
  // An object, not lets, so TS keeps the full types after closures write to it.
  const st: {
    dependsOn: ParsedQuickAdd["dependsOn"];
    date: { value: string; unconfirmed: boolean; chip: Chip } | null;
    time: { value: string; chip: Chip } | null;
  } = { dependsOn: null, date: null, time: null };

  const fmt = (d: string) => {
    const { y, m, d: day } = parseDate(d);
    return `${DAY_SHORT[isoWeekday(d)]} ${day} ${MONTH_SHORT[m]}${y === thisYear ? "" : ` ${y}`}`;
  };

  const weekday = (wd: number, strict: boolean) => {
    const ahead = (wd - isoWeekday(today) + 7) % 7;
    return addDays(today, ahead === 0 && strict ? 7 : ahead);
  };

  // Month-day without a year rolls to next year once passed; today still counts.
  const rollYear = (m: number, d: number) => {
    const iso = formatDate(thisYear, m, d);
    return iso < today ? formatDate(thisYear + 1, m, d) : iso;
  };

  function phraseDate(ws: string[]): string | null {
    const p = ws.join(" ");
    if (/^(today|tonight|hari ini)$/.test(p)) return today;
    if (/^(tomorrow|tmr|tmrw|besok)$/.test(p)) return addDays(today, 1);
    if (p === "lusa" || p === "day after tomorrow") return addDays(today, 2);
    if (p === "next week" || p === "minggu depan") return weekday(1, true);
    const wd = /^(?:(next|this) )?([a-z']+)(?: (depan|ini))?$/.exec(p);
    if (wd && WEEKDAYS[wd[2]] && p !== "sun") return weekday(WEEKDAYS[wd[2]], wd[1] === "next" || wd[3] === "depan");
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
    if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
    const dm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(p); // Indonesian order: DD/MM
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : null;
      return y ? validDate(y, +dm[2], +dm[1]) : validDate(thisYear, +dm[2], +dm[1]) && rollYear(+dm[2], +dm[1]);
    }
    const en = ws.map((w) => ID_TO_EN[w] ?? w).join(" ");
    if (!MONTH_DAY.test(en) && !IN_N.test(en)) return null;
    const r = chrono.strict.parse(en, { instant: now, timezone: tzOffsetMinutes(now, tz) })[0];
    if (!r || r.index !== 0 || r.text.length !== en.length) return null;
    const s = r.start;
    const m = s.get("month")!;
    const d = s.get("day")!;
    if (IN_N.test(en) || s.isCertain("year")) return formatDate(s.get("year")!, m, d);
    return rollYear(m, d);
  }

  function validDate(y: number, m: number, d: number): string | null {
    const iso = formatDate(y, m, d);
    return parseDate(iso).m === m && parseDate(iso).d === d ? iso : null;
  }

  /** Longest date phrase starting at i (up to 3 words); a trailing '?' marks it unconfirmed. */
  function dateAt(i: number): { len: number; value: string; unconfirmed: boolean } | null {
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const raw = words.slice(i, i + n);
      const unconfirmed = raw[n - 1].endsWith("?");
      const ws = raw.map((w, k) => (k === n - 1 ? clean(w.replace(/\?$/, "")) : w.toLowerCase()));
      const value = phraseDate(ws);
      if (value) return { len: n, value, unconfirmed };
    }
    return null;
  }

  function timeAt(i: number): { len: number; value: string } | null {
    const w = words[i + 1]?.toLowerCase();
    if (!w) return null;
    if (w === "noon") return { len: 2, value: "12:00" };
    const m = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/.exec(clean(w));
    if (!m) return null;
    let len = 2;
    let mer = m[3];
    const next = words[i + 2] && clean(words[i + 2]);
    if (!mer && (next === "am" || next === "pm")) {
      mer = next;
      len = 3;
    }
    let h = +m[1];
    const min = +(m[2] ?? 0);
    if (h > 23 || min > 59 || (mer && (h === 0 || h > 12))) return null;
    if (mer === "am" && h === 12) h = 0;
    else if (mer === "pm" && h < 12) h += 12;
    else if (!mer && h >= 1 && h <= 7) h += 12;
    return { len, value: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
  }

  function repeatAt(i: number): { len: number; rule: string; label: string } | null {
    const ws = words.slice(i + 1).map(clean);
    const first = ws[0];
    if (/^(day|daily|hari)$/.test(first)) return { len: 2, rule: "FREQ=DAILY", label: "Repeats daily" };
    if (/^(weekdays?|workdays?)$/.test(first))
      return { len: 2, rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Repeats weekdays" };
    if (/^(week|weekly|minggu)$/.test(first)) return { len: 2, rule: "FREQ=WEEKLY", label: "Repeats weekly" };
    if (/^(month|monthly|bulan)$/.test(first)) return { len: 2, rule: "FREQ=MONTHLY", label: "Repeats monthly" };
    if (/^(year|yearly|tahun)$/.test(first)) return { len: 2, rule: "FREQ=YEARLY", label: "Repeats yearly" };
    const unit = /^(days?|hari|weeks?|minggu|months?|bulan|years?|tahun)$/.exec(ws[1] ?? "");
    if (/^\d{1,3}$/.test(first ?? "") && unit && +first > 0) {
      const freq = /^(d|h)/.test(unit[1]) ? "DAILY" : /^(w|mi)/.test(unit[1]) ? "WEEKLY" : /^(m|b)/.test(unit[1]) ? "MONTHLY" : "YEARLY";
      const word = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" }[freq];
      return +first === 1
        ? { len: 3, rule: `FREQ=${freq}`, label: `Repeats ${freq.toLowerCase()}` }
        : { len: 3, rule: `FREQ=${freq};INTERVAL=${first}`, label: `Repeats every ${first} ${word}` };
    }
    const days: number[] = [];
    let n = 0;
    while (n < ws.length) {
      const w = ws[n];
      if (WEEKDAYS[w]) {
        if (!days.includes(WEEKDAYS[w])) days.push(WEEKDAYS[w]);
      } else if (!(days.length && /^(and|dan|&)$/.test(w))) break;
      n++;
    }
    if (!days.length) return null;
    if (/^(and|dan|&)$/.test(ws[n - 1])) n--;
    days.sort((a, b) => a - b);
    return {
      len: n + 1,
      rule: `FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(",")}`,
      label: `Repeats ${days.map((d) => DAY_SHORT[d]).join(", ")}`,
    };
  }

  /** Words from i up to the next token or end, for '@wait:Name' and 'after:query'. */
  function runUntilToken(i: number): number {
    let j = i;
    while (j < words.length && !matchAt(j)) j++;
    return j;
  }

  const chip = (kind: ChipKind, label: string) => {
    const c = { kind, label };
    chips.push(c);
    return c;
  };

  const matchers: ((i: number) => Hit | null)[] = [
    (i) => {
      const m = /^!([0-4])$/.exec(words[i]);
      return m && { len: 1, apply: () => { fields.priority = +m[1]; chip("priority", `P${m[1]}`); } };
    },
    (i) => {
      const m = /^#(\w+)$/.exec(words[i]);
      const p = m && PROJECTS.find((x) => x.startsWith(m[1].toLowerCase()));
      return p ? { len: 1, apply: () => { fields.project = p; chip("project", PROJECT_NAMES[p]); } } : null;
    },
    (i) => {
      const w = words[i].toLowerCase();
      const preset: Record<string, number> = { "~s": 15, "~m": 60, "~l": 180 };
      const m = /^~(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/.exec(w);
      const min = preset[w] ?? (m ? Math.round(+(m[1] ?? 0) * 60) + +(m[2] ?? 0) : 0);
      if (!min) return null;
      const h = Math.floor(min / 60);
      const label = h ? `~${h} hr${min % 60 ? ` ${min % 60} min` : ""}` : `~${min} min`;
      return { len: 1, apply: () => { fields.estimate_min = min; chip("estimate", label); } };
    },
    (i) => {
      const m = /^\^(high|low)$/i.exec(words[i]);
      if (!m) return null;
      const e = m[1].toLowerCase() as "high" | "low";
      return { len: 1, apply: () => { fields.energy = e; chip("energy", e === "high" ? "High energy" : "Low energy"); } };
    },
    (i) => {
      const m = /^@wait(?::(.*))?$/i.exec(words[i]);
      if (!m) return null;
      const end = m[1] === undefined ? i + 1 : runUntilToken(i + 1);
      const name = fixNames([m[1] ?? "", ...words.slice(i + 1, end)].join(" "));
      return {
        len: end - i,
        apply: () => {
          fields.status = "waiting";
          if (name) fields.waiting_on = name;
          chip("waiting", name ? `Waiting on ${name}` : "Waiting");
        },
      };
    },
    (i) => {
      const m = /^after:(.*)$/i.exec(words[i]);
      if (!m) return null;
      const end = runUntilToken(i + 1);
      const query = [m[1], ...words.slice(i + 1, end)].join(" ").trim();
      if (!query) return null;
      return {
        len: end - i,
        apply: () => {
          const best = findBestMatch(query, openTasks);
          const match = best && best.similarity >= 0.45 ? { id: best.id, title: best.title } : null;
          st.dependsOn = { query, match };
          if (match) fields.depends_on = [match.id];
          const t = match?.title;
          chip("after", t ? `After: ${t.length > 20 ? t.slice(0, 20).trimEnd() + "..." : t}` : `After: ${query}, no match`);
        },
      };
    },
    (i) => {
      const m = /^rp(.*)$/i.exec(words[i]);
      if (!m) return null;
      let len = 1;
      let amount = m[1];
      if (!amount && words[i + 1]) {
        amount = words[i + 1];
        len = 2;
        if (/^\d[\d.,]*$/.test(amount) && /^(jt|juta|rb|ribu|k)$/i.test(words[i + 2] ?? "")) {
          amount += words[i + 2];
          len = 3;
        }
      }
      const v = parseIdr(amount);
      return v === null ? null : { len, apply: () => { fields.value_idr = v; chip("value", formatIdr(v)); } };
    },
    (i) => {
      if (!/^(every|setiap|tiap)$/i.test(words[i])) return null;
      const r = repeatAt(i);
      return r && { len: r.len, apply: () => { fields.rrule = r.rule; chip("repeat", r.label); } };
    },
    (i) => {
      if (st.time || !/^(at|jam)$/i.test(words[i])) return null;
      const t = timeAt(i);
      return t && { len: t.len, apply: () => { st.time = { value: t.value, chip: chip("scheduled", "") }; } };
    },
    (i) => {
      const key = /^(start|ready|fu)$/i.exec(words[i])?.[1].toLowerCase();
      const d = key ? dateAt(i + 1) : null;
      if (!d) return null;
      return {
        len: d.len + 1,
        apply: () => {
          if (key === "start") {
            fields.start_by_manual = d.value;
            chip("start", `Start ${fmt(d.value)}`);
          } else if (key === "ready") {
            fields.ready_by = d.value;
            chip("ready", `Ready ${fmt(d.value)}`);
          } else {
            fields.follow_up = d.value;
            fields.status = "waiting";
            chip("followup", `Follow up ${fmt(d.value)}`);
          }
        },
      };
    },
    (i) => {
      const d = st.date ? null : dateAt(i);
      return d && { len: d.len, apply: () => { st.date = { value: d.value, unconfirmed: d.unconfirmed, chip: chip("deadline", "") }; } };
    },
  ];

  function matchAt(i: number): Hit | null {
    for (const m of matchers) {
      const hit = m(i);
      if (hit) return hit;
    }
    return null;
  }

  const rest: string[] = [];
  for (let i = 0; i < words.length; ) {
    const hit = matchAt(i);
    if (hit) {
      hit.apply();
      i += hit.len;
    } else rest.push(words[i++]);
  }

  const { date: d, time: t } = st;
  if (t) {
    const day = d?.value ?? (hm(t.value) <= localMinutes(now, tz) ? addDays(today, 1) : today);
    fields.scheduled_at = zonedInstant(day, t.value, tz).toISOString();
    const label = `At ${fmt(day)}, ${t.value}`;
    if (d) {
      const [keep, drop] = chips.indexOf(d.chip) < chips.indexOf(t.chip) ? [d.chip, t.chip] : [t.chip, d.chip];
      chips.splice(chips.indexOf(drop), 1);
      keep.kind = "scheduled";
      keep.label = label;
    } else t.chip.label = label;
  } else if (d) {
    fields.deadline = d.value;
    fields.deadline_confirmed = !d.unconfirmed;
    d.chip.label = `Due ${fmt(d.value)}${d.unconfirmed ? ", unconfirmed" : ""}`;
  }

  const fixed = fixNames(rest.join(" "));
  const title = fixed.charAt(0).toUpperCase() + fixed.slice(1);
  return {
    title,
    fields,
    chips,
    dependsOn: st.dependsOn,
    duplicate: title ? findDuplicate(title, openTasks) : null,
  };
}
