import { describe, expect, it } from "vitest";
import { RRule } from "rrule";
import { parseQuickAdd, type ParseContext } from "./parse";

// Monday 12 Oct 2026, 10:00 WITA.
const NOW = new Date("2026-10-12T02:00:00Z");
const WITA = "Asia/Makassar";
const WIB = "Asia/Jakarta";
const ctx: ParseContext = { now: NOW, tz: WITA };
const p = (input: string, c: Partial<ParseContext> = {}) => parseQuickAdd(input, { ...ctx, ...c });
const due = (input: string, c: Partial<ParseContext> = {}) => p(input, c).fields.deadline;

const OPEN = [
  { id: "a", title: "Follow up Pak Arief on the Sultan down payment" },
  { id: "b", title: "Navaho payments" },
  { id: "c", title: "Film Teba compost reel" },
];

describe("parseQuickAdd: plain titles", () => {
  it("returns the input as title when there are no tokens", () => {
    expect(p("buy compost bags")).toEqual({ title: "Buy compost bags", fields: {}, chips: [], dependsOn: null, duplicate: null });
  });

  it("collapses whitespace", () => {
    expect(p("  water   the   plants ").title).toBe("Water the plants");
  });

  it("does not eat month names without a day", () => {
    const r = p("Send may newsletter draft");
    expect(r.title).toBe("Send may newsletter draft");
    expect(r.chips).toEqual([]);
  });

  it("does not eat ordinary words chrono likes", () => {
    for (const t of ["Buy sun hat", "Second draft now", "Plan march campaign", "Put stuff in 3 boxes"]) {
      expect(p(t).chips, t).toEqual([]);
      expect(p(t).title).toBe(t);
    }
  });

  it("fixes misheard names in the title", () => {
    expect(p("call navajo about demi an").title).toBe("Call Navaho about Demian");
  });

  it("returns an empty title when everything is a token", () => {
    const r = p("fri !1");
    expect(r.title).toBe("");
    expect(r.duplicate).toBeNull();
  });
});

describe("parseQuickAdd: deadlines", () => {
  it("bare weekday 'fri' is the coming Friday, confirmed", () => {
    const r = p("Invoice Sultan fri");
    expect(r.title).toBe("Invoice Sultan");
    expect(r.fields).toEqual({ deadline: "2026-10-16", deadline_confirmed: true });
    expect(r.chips).toEqual([{ kind: "deadline", label: "Due Fri 16 Oct" }]);
  });

  it("full weekday names work", () => {
    expect(due("x friday")).toBe("2026-10-16");
    expect(due("x Tuesday")).toBe("2026-10-13");
  });

  it("bare weekday equal to today means today; 'next' means a week later", () => {
    expect(due("x mon")).toBe("2026-10-12");
    expect(due("x next mon")).toBe("2026-10-19");
    expect(due("x this fri")).toBe("2026-10-16");
  });

  it("'fri?' is an unconfirmed deadline", () => {
    const r = p("x fri?");
    expect(r.fields).toEqual({ deadline: "2026-10-16", deadline_confirmed: false });
    expect(r.chips[0].label).toBe("Due Fri 16 Oct, unconfirmed");
  });

  it("today and tomorrow", () => {
    expect(due("x today")).toBe("2026-10-12");
    expect(due("x tomorrow")).toBe("2026-10-13");
    expect(due("x tmr")).toBe("2026-10-13");
  });

  it("'12 nov' and 'nov 12'", () => {
    expect(due("x 12 nov")).toBe("2026-11-12");
    expect(due("x nov 12")).toBe("2026-11-12");
    expect(p("x 12 nov").chips[0].label).toBe("Due Thu 12 Nov");
  });

  it("a passed month-day rolls to next year and the label shows the year", () => {
    const r = p("x 11 oct");
    expect(r.fields.deadline).toBe("2027-10-11");
    expect(r.chips[0].label).toBe("Due Mon 11 Oct 2027");
    expect(due("x 12 oct")).toBe("2026-10-12");
  });

  it("explicit years, ISO and DD/MM dates", () => {
    expect(due("x 12 nov 2027")).toBe("2027-11-12");
    expect(due("x 2026-12-01")).toBe("2026-12-01");
    expect(due("x 20/11")).toBe("2026-11-20");
    expect(due("x 1/2/27")).toBe("2027-02-01");
    expect(due("x 1/2/2028")).toBe("2028-02-01");
    expect(p("x 31 feb").title).toBe("X 31 feb");
    expect(due("x 5/10")).toBe("2027-10-05");
    expect(p("x 31/2").title).toBe("X 31/2");
    expect(p("x 2026-02-30").title).toBe("X 2026-02-30");
  });

  it("'in 3 days' and 'in 2 weeks'", () => {
    expect(due("x in 3 days")).toBe("2026-10-15");
    expect(due("x in 2 weeks")).toBe("2026-10-26");
  });

  it("'next week' is next Monday", () => {
    expect(due("x next week")).toBe("2026-10-19");
  });

  it("only the first date is a token", () => {
    const r = p("move fri meeting to 12 nov");
    expect(r.fields.deadline).toBe("2026-10-16");
    expect(r.title).toBe("Move meeting to 12 nov");
  });

  it("strips trailing punctuation from a date word", () => {
    const r = p("fri, call Sundari");
    expect(r.fields.deadline).toBe("2026-10-16");
    expect(r.title).toBe("Call Sundari");
  });
});

describe("parseQuickAdd: Indonesian", () => {
  it("besok, lusa, hari ini", () => {
    expect(due("x besok")).toBe("2026-10-13");
    expect(due("x lusa")).toBe("2026-10-14");
    const r = p("bayar listrik hari ini");
    expect(r.fields.deadline).toBe("2026-10-12");
    expect(r.title).toBe("Bayar listrik");
  });

  it("senin to minggu map to Mon..Sun", () => {
    const want = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"].forEach((d, k) => expect(due(`x ${d}`), d).toBe(want[k]));
  });

  it("'minggu depan' is next week, 'senin depan' is next Monday", () => {
    expect(due("x minggu depan")).toBe("2026-10-19");
    expect(due("x senin depan")).toBe("2026-10-19");
  });

  it("Indonesian months and 'dalam N hari'", () => {
    expect(due("x 17 agustus")).toBe("2027-08-17");
    expect(due("x 5 okt")).toBe("2027-10-05");
    expect(due("x 25 desember")).toBe("2026-12-25");
    expect(due("x dalam 3 hari")).toBe("2026-10-15");
    expect(due("x dalam 2 minggu")).toBe("2026-10-26");
  });

  it("'besok?' is unconfirmed", () => {
    expect(p("x besok?").fields.deadline_confirmed).toBe(false);
  });
});

describe("parseQuickAdd: at <time>", () => {
  it("date plus 'at' sets scheduled_at only, one merged chip", () => {
    const r = p("Call Sundari fri at 2pm");
    expect(r.title).toBe("Call Sundari");
    expect(r.fields).toEqual({ scheduled_at: "2026-10-16T06:00:00.000Z" });
    expect(r.chips).toEqual([{ kind: "scheduled", label: "At Fri 16 Oct, 14:00" }]);
  });

  it("'at' before the date keeps the chip at the first position", () => {
    const r = p("x !1 at 2pm fri");
    expect(r.fields.scheduled_at).toBe("2026-10-16T06:00:00.000Z");
    expect(r.chips.map((c) => c.kind)).toEqual(["priority", "scheduled"]);
  });

  it("'at 14:00' alone is today when still ahead", () => {
    expect(p("x at 14:00").fields.scheduled_at).toBe("2026-10-12T06:00:00.000Z");
    expect(p("x at 14.30").fields.scheduled_at).toBe("2026-10-12T06:30:00.000Z");
  });

  it("'at 9' alone after 9:00 rolls to tomorrow", () => {
    const r = p("x at 9");
    expect(r.fields.scheduled_at).toBe("2026-10-13T01:00:00.000Z");
    expect(r.chips[0].label).toBe("At Tue 13 Oct, 09:00");
  });

  it("bare 1..7 means pm; explicit am wins", () => {
    expect(p("x at 2").fields.scheduled_at).toBe("2026-10-12T06:00:00.000Z");
    expect(p("x at 7").fields.scheduled_at).toBe("2026-10-12T11:00:00.000Z");
    expect(p("x besok at 7 am").fields.scheduled_at).toBe("2026-10-12T23:00:00.000Z");
    expect(p("x besok at 12am").fields.scheduled_at).toBe("2026-10-12T16:00:00.000Z");
    expect(p("x at 12").fields.scheduled_at).toBe("2026-10-12T04:00:00.000Z");
    expect(p("x at noon").fields.scheduled_at).toBe("2026-10-12T04:00:00.000Z");
  });

  it("'jam 2' is Indonesian for at 2", () => {
    const r = p("rapat jam 2 besok");
    expect(r.title).toBe("Rapat");
    expect(r.fields.scheduled_at).toBe("2026-10-13T06:00:00.000Z");
  });

  it("'at' without a valid time stays in the title", () => {
    for (const t of ["Meet Sundari at cafe", "x at 25", "x at 13pm", "x at", "x at 9:75"]) expect(p(t).chips, t).toEqual([]);
  });
});

describe("parseQuickAdd: start, ready, fu", () => {
  it("start <date> sets start_by_manual", () => {
    const r = p("x start mon");
    expect(r.fields).toEqual({ start_by_manual: "2026-10-12" });
    expect(r.chips).toEqual([{ kind: "start", label: "Start Mon 12 Oct" }]);
  });

  it("ready <date> sets ready_by", () => {
    const r = p("compost ready 20 nov");
    expect(r.fields).toEqual({ ready_by: "2026-11-20" });
    expect(r.chips[0].label).toBe("Ready Fri 20 Nov");
  });

  it("fu <date> sets follow_up and waiting", () => {
    const r = p("quote from IVG fu thu");
    expect(r.fields).toEqual({ follow_up: "2026-10-15", status: "waiting" });
    expect(r.chips).toEqual([{ kind: "followup", label: "Follow up Thu 15 Oct" }]);
  });

  it("keyword without a date stays in the title", () => {
    expect(p("start the engine").title).toBe("Start the engine");
    expect(p("start the engine").chips).toEqual([]);
  });

  it("start and deadline together", () => {
    const r = p("x start mon fri");
    expect(r.fields).toEqual({ start_by_manual: "2026-10-12", deadline: "2026-10-16", deadline_confirmed: true });
  });
});

describe("parseQuickAdd: small tokens", () => {
  it("!0..!4 set priority", () => {
    for (let n = 0; n <= 4; n++) {
      const r = p(`x !${n}`);
      expect(r.fields.priority).toBe(n);
      expect(r.chips).toEqual([{ kind: "priority", label: `P${n}` }]);
    }
    expect(p("x !5").title).toBe("X !5");
  });

  it("#tag matches projects by prefix", () => {
    expect(p("x #omni").fields.project).toBe("omnisync");
    expect(p("x #t").fields.project).toBe("teba");
    expect(p("x #con").fields.project).toBe("content");
    expect(p("x #Pers").fields.project).toBe("personal");
    expect(p("x #omni").chips[0]).toEqual({ kind: "project", label: "OmniSync" });
  });

  it("unknown tag stays in the title with no chip", () => {
    const r = p("x #misc");
    expect(r.title).toBe("X #misc");
    expect(r.chips).toEqual([]);
  });

  it("estimates", () => {
    const cases: [string, number, string][] = [
      ["~15m", 15, "~15 min"],
      ["~1h", 60, "~1 hr"],
      ["~1h30m", 90, "~1 hr 30 min"],
      ["~90m", 90, "~1 hr 30 min"],
      ["~1.5h", 90, "~1 hr 30 min"],
      ["~s", 15, "~15 min"],
      ["~m", 60, "~1 hr"],
      ["~l", 180, "~3 hr"],
    ];
    for (const [tok, min, label] of cases) {
      const r = p(`x ${tok}`);
      expect(r.fields.estimate_min, tok).toBe(min);
      expect(r.chips[0].label).toBe(label);
    }
    expect(p("x ~0m").chips).toEqual([]);
    expect(p("x ~").title).toBe("X ~");
  });

  it("^high and ^low set energy", () => {
    expect(p("x ^high").fields.energy).toBe("high");
    expect(p("x ^high").chips[0].label).toBe("High energy");
    expect(p("x ^LOW").fields.energy).toBe("low");
    expect(p("x ^LOW").chips[0].label).toBe("Low energy");
  });
});

describe("parseQuickAdd: waiting", () => {
  it("@wait sets status only", () => {
    const r = p("contract @wait");
    expect(r.fields).toEqual({ status: "waiting" });
    expect(r.chips).toEqual([{ kind: "waiting", label: "Waiting" }]);
  });

  it("@wait:Pak Arief takes a multi-word name", () => {
    const r = p("signed contract @wait:Pak Arief");
    expect(r.title).toBe("Signed contract");
    expect(r.fields).toEqual({ status: "waiting", waiting_on: "Pak Arief" });
    expect(r.chips[0].label).toBe("Waiting on Pak Arief");
  });

  it("the name stops at the next token and is name-fixed", () => {
    const r = p("contract @wait:pak arif fri !2");
    expect(r.fields.waiting_on).toBe("Pak Arief");
    expect(r.fields.deadline).toBe("2026-10-16");
    expect(r.fields.priority).toBe(2);
  });

  it("'@wait:' with a space before the name", () => {
    expect(p("x @wait: sundary").fields.waiting_on).toBe("Sundari");
    expect(p("x @wait:").fields).toEqual({ status: "waiting" });
  });
});

describe("parseQuickAdd: every", () => {
  const rule = (input: string) => p(input).fields.rrule;

  it("every mon wed fri", () => {
    const r = p("gym every mon wed fri");
    expect(r.title).toBe("Gym");
    expect(r.fields.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(r.chips).toEqual([{ kind: "repeat", label: "Repeats Mon, Wed, Fri" }]);
    expect(RRule.fromString(r.fields.rrule!).options.byweekday).toEqual([0, 2, 4]);
  });

  it("day, weekday, week, month, year", () => {
    expect(rule("x every day")).toBe("FREQ=DAILY");
    expect(rule("x every weekday")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(rule("x every week")).toBe("FREQ=WEEKLY");
    expect(rule("x every month")).toBe("FREQ=MONTHLY");
    expect(rule("x every year")).toBe("FREQ=YEARLY");
  });

  it("intervals", () => {
    expect(rule("x every 2 weeks")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(p("x every 2 weeks").chips[0].label).toBe("Repeats every 2 weeks");
    expect(rule("x every 3 days")).toBe("FREQ=DAILY;INTERVAL=3");
    expect(rule("x every 6 months")).toBe("FREQ=MONTHLY;INTERVAL=6");
    expect(rule("x every 2 years")).toBe("FREQ=YEARLY;INTERVAL=2");
    expect(rule("x every 1 week")).toBe("FREQ=WEEKLY");
  });

  it("Indonesian: setiap hari, tiap minggu, setiap senin dan kamis, setiap sabtu minggu", () => {
    expect(rule("x setiap hari")).toBe("FREQ=DAILY");
    expect(rule("x tiap minggu")).toBe("FREQ=WEEKLY");
    expect(rule("x setiap 2 minggu")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(rule("x setiap bulan")).toBe("FREQ=MONTHLY");
    expect(rule("x setiap senin dan kamis")).toBe("FREQ=WEEKLY;BYDAY=MO,TH");
    expect(rule("x setiap sabtu minggu")).toBe("FREQ=WEEKLY;BYDAY=SA,SU");
  });

  it("commas, 'and' and order", () => {
    expect(rule("x every fri, mon and wed")).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(rule("x every mon monday")).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(p("x every mon and").title).toBe("X and");
  });

  it("all generated rules are valid for rrule", () => {
    for (const t of ["every day", "every weekday", "every 2 weeks", "every month", "setiap selasa jumat"]) {
      expect(() => RRule.fromString(rule(`x ${t}`)!)).not.toThrow();
    }
  });

  it("every without a rule stays in the title", () => {
    expect(p("eat every vegetable").title).toBe("Eat every vegetable");
    expect(p("x every").chips).toEqual([]);
  });
});

describe("parseQuickAdd: after", () => {
  it("fuzzy matches an open task by abbreviation", () => {
    const r = p("send contract after:sultan dp", { openTasks: OPEN });
    expect(r.title).toBe("Send contract");
    expect(r.dependsOn).toEqual({ query: "sultan dp", match: { id: "a", title: OPEN[0].title } });
    expect(r.fields.depends_on).toEqual(["a"]);
    expect(r.chips).toEqual([{ kind: "after", label: "After: Follow up Pak Arief..." }]);
  });

  it("query stops at the next token", () => {
    const r = p("x after:navaho payment fri", { openTasks: OPEN });
    expect(r.dependsOn?.match?.id).toBe("b");
    expect(r.chips[0].label).toBe("After: Navaho payments");
    expect(r.fields.deadline).toBe("2026-10-16");
  });

  it("no match keeps the query and sets no depends_on", () => {
    const r = p("x after:quarterly tax", { openTasks: OPEN });
    expect(r.dependsOn).toEqual({ query: "quarterly tax", match: null });
    expect(r.fields.depends_on).toBeUndefined();
    expect(r.chips[0].label).toBe("After: quarterly tax, no match");
  });

  it("works without openTasks and ignores an empty query", () => {
    expect(p("x after:compost").dependsOn).toEqual({ query: "compost", match: null });
    expect(p("x after:").title).toBe("X after:");
  });
});

describe("parseQuickAdd: money", () => {
  it("Rp5jt and Rp 750rb", () => {
    expect(p("x Rp5jt").fields.value_idr).toBe(5_000_000);
    expect(p("x Rp5jt").chips).toEqual([{ kind: "value", label: "Rp 5.000.000" }]);
    expect(p("x Rp 750rb").fields.value_idr).toBe(750_000);
  });

  it("Rp 50.000.000 and 'rp 5 jt'", () => {
    expect(p("x Rp 50.000.000").fields.value_idr).toBe(50_000_000);
    const r = p("deal rp 5 jt sultan");
    expect(r.fields.value_idr).toBe(5_000_000);
    expect(r.title).toBe("Deal Sultan");
  });

  it("non-amounts stay in the title", () => {
    expect(p("x rpg night").title).toBe("X rpg night");
    expect(p("x Rp").title).toBe("X Rp");
  });
});

describe("parseQuickAdd: duplicates", () => {
  it("offers 'Navaho payments' for 'navajo payment'", () => {
    const r = p("navajo payment", { openTasks: OPEN });
    expect(r.title).toBe("Navaho payment");
    expect(r.duplicate?.id).toBe("b");
    expect(r.duplicate!.similarity).toBeGreaterThan(0.8);
  });

  it("no duplicate for a different task", () => {
    expect(p("payment", { openTasks: OPEN }).duplicate).toBeNull();
    expect(p("call Demian", { openTasks: OPEN }).duplicate).toBeNull();
  });
});

describe("parseQuickAdd: midnight edges", () => {
  // 00:30 Monday in WITA, still 23:30 Sunday in WIB.
  const late = new Date("2026-10-11T16:30:00Z");

  it("besok follows the local day", () => {
    expect(due("x besok", { now: late, tz: WITA })).toBe("2026-10-13");
    expect(due("x besok", { now: late, tz: WIB })).toBe("2026-10-12");
  });

  it("hari ini and senin", () => {
    expect(due("x hari ini", { now: late, tz: WITA })).toBe("2026-10-12");
    expect(due("x hari ini", { now: late, tz: WIB })).toBe("2026-10-11");
    expect(due("x senin", { now: late, tz: WITA })).toBe("2026-10-12");
    expect(due("x senin", { now: late, tz: WIB })).toBe("2026-10-12");
    expect(due("x minggu", { now: late, tz: WIB })).toBe("2026-10-11");
  });

  it("'in 3 days' counts from the local day", () => {
    expect(due("x in 3 days", { now: late, tz: WITA })).toBe("2026-10-15");
    expect(due("x in 3 days", { now: late, tz: WIB })).toBe("2026-10-14");
  });

  it("'at 9' lands on the next local 09:00 in each zone", () => {
    expect(p("x at 9", { now: late, tz: WITA }).fields.scheduled_at).toBe("2026-10-12T01:00:00.000Z");
    expect(p("x at 9", { now: late, tz: WIB }).fields.scheduled_at).toBe("2026-10-12T02:00:00.000Z");
  });
});

describe("parseQuickAdd: combined", () => {
  it("many tokens at once, chips in input order", () => {
    const r = p("call pak arif about sultan dp fri? !1 #omni ~30m ^high Rp5jt", { openTasks: OPEN });
    expect(r.title).toBe("Call Pak Arief about Sultan dp");
    expect(r.fields).toEqual({
      deadline: "2026-10-16",
      deadline_confirmed: false,
      priority: 1,
      project: "omnisync",
      estimate_min: 30,
      energy: "high",
      value_idr: 5_000_000,
    });
    expect(r.chips.map((c) => c.label)).toEqual([
      "Due Fri 16 Oct, unconfirmed",
      "P1",
      "OmniSync",
      "~30 min",
      "High energy",
      "Rp 5.000.000",
    ]);
  });

  it("repeat, wait, follow up and schedule together", () => {
    const r = p("weekly sync every mon at 9am #teba fu thu");
    expect(r.title).toBe("Weekly sync");
    expect(r.fields.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(r.fields.scheduled_at).toBe("2026-10-13T01:00:00.000Z");
    expect(r.fields.follow_up).toBe("2026-10-15");
    expect(r.fields.status).toBe("waiting");
    expect(r.chips.map((c) => c.kind)).toEqual(["repeat", "scheduled", "project", "followup"]);
  });
});
