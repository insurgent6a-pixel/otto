# Otto: Master Build Prompt

You are building **Otto**, a personal command center for one person (Electra) who has ADHD and runs two businesses plus personal commitments. Otto is an installable web app (PWA), mobile-first and native-feeling on desktop. Electra talks to Claude, and Claude writes into Otto's database through the Supabase connector.

## How to use this file

- Build in phases (section 18). Finish, test and deploy each phase before starting the next. Re-read this file at the start of every phase.
- **Phase 0 is tonight's version:** one database, Claude connected, and one web page. The appendices hold everything needed for it:
  - Appendix A: the SQL setup.
  - Appendix B: the Claude Project instructions.
  - Appendix C: the Siri Shortcut.
- Before writing frontend code or UI copy, invoke the `frontend-design` and `anti-ai-voice` skills if they are available.
- **Visual reference:** `otto-preview.html` is the approved look and Today layout. Match its tokens, fonts, energy check-in, next card, folded sections, Your day card and goal card.

---

## 0. Otto, the name and the voice

- **App name:** Otto. It goes on the home-screen icon, browser tab, manifest `name` and `short_name`, and login screen.
- **Why Otto:** it sounds like "auto". Otto plans the day automatically, and Electra can override anything it decides.
- **What Otto is:** the assistant voice, not a chatbot inside the app. Otto is the name on every message the rules engine produces: notifications, reason lines, score messages, schedule changes. The understanding and conversation come from Claude (section 13).
- **Message format:**
  - Notifications have the title "Otto" and a first-person, present-tense body: "Locked Navaho payments in for 09:00. You postponed it 3 times."
  - In the app, system messages get a small "Otto" label. Electra's own task text never does.
- **Personality:**
  - Calm, direct, warm, on Electra's side: a sharp operations manager who wants Electra to reach the goal she picked (section 9).
  - Two sentences max per message.
  - No emoji, no apologies, no "I think" or "I feel".
- **Voice examples:**
  - "Moved 2 tasks after Sultan agreement."
  - "Thursday's overloaded. 7h planned, 4h free. Pick 2 to move."
  - "Score 34. At this rate Trip to Japan stays a phone wallpaper. Start the green card."
  - "Low battery is fine. Here's a 5 minute one. Finish it and you're already moving."
  - "Nice. That's 3. Everything else today is bonus."
- **Icon:** a bold lowercase "o" in fern green on warm paper (mint on forest for the dark icon variant), with a small notch that reads as a gauge needle. Provide 180, 192 and 512px PNGs plus a maskable version.

## 1. Who it's for

- **User:** Electra. iPhone plus a desktop computer. Time zone `Asia/Jakarta` (WIB).
- **Projects** (stored as slugs):
  - `omnisync`: client web development. Clients: Sultan (contact Pak Arief), Navaho, Sundari, Demian, Rumahati.
  - `teba`: Teba Compost. Batches run in the background for weeks.
  - `content`: IVG post, mailing list, social.
  - `personal`: workouts, commitments.
- **Goal:** whatever Electra chooses to work toward, picked from her own bucket list (section 9). Otto never presets one.

## 2. Product principles (non-negotiable)

1. **One thing on screen.** Today shows one "Do this next" task and two after it. Everything else is one tap away.
2. **Capture costs nothing.** Type, speak or ramble to Claude. No required fields. Sorting happens later.
3. **Nothing gets forgotten.** Every open task has a scheduled time, a start-by date, or (if waiting) a return date. A nightly sweep enforces this.
4. **Otto decides, Electra overrides.** Start-by dates, schedule blocks and priority order are computed automatically. Every computed value changes with one tap, and a manual value always wins.
5. **Every suggestion shows its reason.** One short line: "P1, due in 2 days, postponed twice."
6. **Never invent facts.** Unknown deadlines show as "deadline unconfirmed". Neither Otto nor Claude ever makes up a deadline.
7. **Forgiving, not punishing.** Overdue items get triage buttons, not red walls. Tough love follows strict rules (section 9).
8. **Plan stability.** Re-running the scheduler keeps existing blocks where they still work.
9. **No AI API calls from the app.** All in-app "smart" behavior is deterministic code. Language understanding comes from Electra's Claude subscription through the connector (section 13). Never add an Anthropic API key.
10. **Ask, don't demand.** Ask one question at a time (energy first), with big buttons. Fold everything except the next task; every folded section shows its count.
11. **Make starting tiny.** The second button on the next card is always "Start 5 min". Starting is the hard part, so Otto asks for 5 minutes, not a commitment.
12. **Electra feels in it.** Greet her by name, react to what she does, and tie every win back to her own goal.

## 3. Stack

- **Phase 0 (tonight):**
  - One static `index.html` with vanilla JS.
  - `@supabase/supabase-js` UMD build from jsDelivr, pinned to an exact version.
  - Deploy by dragging the folder onto Netlify Drop or Vercel.
- **Phase 1 onward:** Next.js (App Router) + TypeScript strict, deployed on Vercel. It uses the same database, which Phase 0 already created, so no migration is needed.
- **Styling:** design tokens as CSS variables (Tailwind with custom tokens from Phase 1). Rules:
  - No default Tailwind blue or indigo anywhere.
  - Never use `transition-all`; name the properties.
- **Backend:** Supabase.
  - Postgres with Row Level Security, email magic-link login, and Realtime for live updates when Claude writes.
  - `pg_cron` plus Edge Functions for jobs.
- **Push:** Web Push with VAPID keys (`web-push`).
- **Parsing:** `chrono-node` for dates, `rrule` for repeats.
- **Tests:** Vitest for the engine; Playwright at 390x844 and 1440x900.

## 4. Data model

The full schema is created in Phase 0 (Appendix A), so later phases only add tables.

`tasks` columns:

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | defaults to the logged-in user, or the owner when Claude or Siri writes |
| title | text | required |
| project | text | `omnisync`, `teba`, `content`, `personal`, or null |
| priority | int | 0 to 4, null = unsorted |
| status | text | `todo`, `waiting`, `done`, `dropped` |
| estimate_min | int | null is treated as 60 |
| energy | text | `high`, `low`, or null |
| scheduled_at | timestamptz | a fixed time (meetings, calls, pinned blocks) |
| deadline | date | |
| deadline_confirmed | bool | false unless Electra stated a firm date |
| start_by_auto | date | computed (section 6) |
| start_by_manual | date | Electra's override, wins |
| follow_up | date | return date for waiting items |
| ready_by | date | expected ready (compost, deliveries) |
| next_action | text | first concrete step |
| waiting_on | text | |
| notes | text | |
| plan_for | date | set by "Move to tomorrow" |
| postpone_count | int | |
| forced | bool | section 7 |
| depends_on | uuid[] | |
| rrule | text | repeating rule |
| series_id | uuid | |
| value_idr | numeric | money the task brings in |
| source | text | `app`, `claude`, `siri` |
| raw_text | text | the spoken or rambled original |
| done_at | timestamptz | |
| created_at, updated_at | timestamptz | |

Tables added in later phases:
- `otto_settings`: single row; owner id, capture secret, timezone, working hours, energy windows, daily goal, quiet hours, tone, sound and haptics, default follow-up days.
- `goals` and `energy_checkins` are created in Phase 0 (Appendix A, sections 9 and 8a).
- `task_events`: created, done, undone, postponed, dropped, waiting_started, resumed, focus_started, focus_ended, forced, rescheduled.
- `schedule_blocks`: task_id, start_at, end_at, pinned, source.
- `busy_blocks`: fixed commitments.
- `daily_scores`: day, score, parts, momentum.
- `push_subscriptions`: endpoint, keys, last_ok_at, failures.
- `pipeline_templates`: name, steps of `{offset_days, title, kind, estimate_min}`.

RLS on every table: `user_id = auth.uid()`.

## 5. Priority score

A pure function `scoreTask(task, now, ctx) -> { score, reasons[] }`.

| Part | Points |
|---|---|
| Priority | P0 50, P1 40, P2 25, P3 15, P4 5, unsorted 20 |
| Deadline urgency | `40 * clamp(1 - (daysLeft - estimateDays) / 14, 0, 1)`, times 0.7 if unconfirmed |
| Overdue deadline | +45 |
| Start-by passed | +15 |
| Postponed | +8 each, max +32 |
| Age | +1 per 3 days open, max +10 |
| Waiting item, return date reached | +30 |
| Blocked by an unfinished dependency | score 0, hidden from Today |

`reasons` holds the top two parts as plain fragments ("due in 2 days", "postponed 3 times").

Today's order:
1. Forced tasks.
2. Today's timed items and blocks, in time order.
3. Everything else by score.

## 6. Auto start-by

`start_by_auto = deadline - ceil(estimate_min / daily_focus_cap_min) working days - buffer`. The buffer is 1 working day, or 2 when the deadline is unconfirmed.

- Display `start_by_manual ?? start_by_auto`, with an "auto" tag on computed values.
- Tapping the date opens a picker; saving writes `start_by_manual`. "Reset to auto" clears it.

## 7. Postponed too long: locked in, never forgotten

- "Move to tomorrow" and "Not today" add 1 to `postpone_count`.
- **Force rule:** at `postpone_count >= 3`, or after 14 days open with nothing scheduled:
  - set `forced = true`;
  - pin a block in the next free high-energy slot;
  - show "Postponed 3 times. Locked in for 09:00."
- A forced task loses "Move to tomorrow" and gets these instead:
  - **Do it now**: starts the focus timer.
  - **Shrink it**: asks for a first step under 15 minutes, sets the estimate to 15 and resets the count to 1.
  - **Hand it off**: status waiting, with who and a return date.
  - **Drop it**.
- **Nightly sweep (00:30 WIB):**
  - Schedule any open todo that has no block in the next 7 days and no start-by.
  - Give any waiting item without `follow_up` a return date (default follow-up days).
  - Bring waiting items past their return date back to todo.

## 8. Scheduler

`buildSchedule(tasks, blocks, busy, settings, now) -> { blocks, warnings }` works over 14 days in 15-minute slots.

1. Keep pinned blocks, timed items (`scheduled_at`), and still-valid auto blocks (the stability rule).
2. Place the rest in this order: forced first, then by latest feasible start, then by score.
3. `high` energy tasks go into high-energy windows first. `low` tasks avoid them when possible. Today's energy check-in (section 8a) overrides the windows for the rest of the day.
4. Respect dependencies, the daily focus cap, busy blocks, working days and quiet hours.
5. When something can't fit before its deadline, warn: "Thursday is overloaded: 7h planned, 4h free. Move 2 tasks or drop 1."
6. **Knock-on:** re-run after any task or block change. Moving one task moves its dependents. A toast says what moved.
7. Also run daily at 06:00 WIB.

## 8a. Energy check-in

Electra loved this one. It sits at the top of Today and drives what Otto picks.

### The question

- The first time Today opens each day, Otto asks: "How's your energy right now?"
- Three big buttons, each with a 3-bar signal icon: **Low**, **Okay**, **Charged**.
- After a tap, it collapses to one line: "Energy: Okay. Otto picked a task to match." with a **Change** link.
- Otto asks again after 13:00 if the last check-in was before 12:00: "Afternoon check. Still Okay?" It's one tap, and skipping is allowed.
- Each answer is saved to `energy_checkins` (day, level, time).

### What each answer does

**Low:**
- Next card: the highest-score task with an estimate of 15 minutes or less, or energy `low`.
- If none exists, the top task's `next_action`, shown as a 5 minute version.
- Reason line: "Low energy pick: 5 minutes, easy win".
- The scheduler moves `high` tasks out of the next 2 hours.
- Today's daily goal drops by 1 (minimum 1), and Otto says so: "Goal's 2 today. That's plenty."

**Okay:**
- Normal score order (section 5).

**Charged:**
- Next card: the highest-score `high` energy or estimate 50+ minute task.
- Reason line: "You're charged. Spend it on deep work".
- The scheduler pulls `high` tasks into the next 3 hours.
- The "Start" button offers 25 minutes instead of 5.

### Otto's line for each answer

- **Low:** "Low battery is fine. Here's a 5 minute one. Finish it and you're already moving."
- **Okay:** "Good. Start with {task}, {reason}."
- **Charged:** "Charged. Let's use it on the big one before lunch."

### Rules

- Never shame low energy.
- The score never penalizes a Low day's smaller goal.

### Learning (Phase 5)

- Show average energy by hour and weekday on the weekly review: "You're usually Charged Tuesday mornings."
- After 14 days of data, suggest new high-energy windows from it.

### Claude

Claude can log energy too. "I'm wiped today" in the Claude Otto project inserts a `low` check-in.

## 9. Score, momentum and goal messages

### Daily score (0 to 100), snapshotted at 23:59 WIB

| Part | Max | Rule |
|---|---|---|
| Plan done | 40 | `40 * min(1, doneFromPlan / plannedAt8am)`; with no plan, use the daily goal |
| Priority handled | 20 | share of P0/P1 tasks due or scheduled today that got done |
| On time | 20 | 20 minus 5 per task that went overdue today without triage |
| Clean slate | 10 | no untriaged overdue tasks left at end of day |
| Focus | 10 | `10 * min(1, focusMinutes / 90)` |

**Momentum:** an exponential moving average of 7 days (alpha 0.3), shown with a trend arrow.

### Goal card and bucket list (customizable, starts empty)

- **Empty state:**
  - Title "What are you working toward?", with the line "Pick something that makes the boring tasks worth it. Change it any time."
  - A "Your goal" field with the placeholder "Your dream goal here".
  - Idea chips that fill the field: Trip to Japan, New MacBook, Emergency fund, Own studio, Dream car.
  - An optional "Target amount" field that accepts `50jt`, `Rp 50.000.000` or `750rb`.
  - **Save goal** button.
- **With a goal:**
  - "Working toward" heading, the goal name, and an **Edit** link.
  - With a target: a progress bar plus "Rp 18.500.000" and "37% of Rp 50.000.000".
  - Without a target: "Add a target amount to see a progress bar."
- **Bucket list:** folded under the goal, with a count.
  - Every saved dream is listed. The current one is marked "current", and the others have a "Work toward this" link.
  - An "Add another dream" input at the bottom.
  - Only one goal is current at a time.
- **Progress:** `goals.saved_idr` goes up when a task with `value_idr` is marked done, and Undo takes it back. Electra can also add money by hand: "Add saved amount".
- **Reaching the target:** the biggest celebration in the app, then "You did it. Pick the next one from your bucket list."
- **Never** set a goal, name or price for Electra.

### Messages

Templates use `{goal}`, `{score}`, `{momentum}`, `{delta}` and `{streakDays}`. Never repeat any of the last 5 messages. With no goal set, use the goal-free fallback.

- **High:**
  - "Score {score}. Keep this pace and {goal} stops being a someday."
  - "{streakDays} days above 70. This is how {goal} happens."
- **Rising:**
  - "Up {delta} from yesterday. That's the direction {goal} is in."
- **Middle:**
  - "Score {score}. Solid. One more P1 today and {goal} gets closer."
- **Low:**
  - "Score {score}. At this rate {goal} stays a phone wallpaper."
  - "If you keep this score low, {goal} isn't coming soon. One task now still counts."
- **After each completion:** "Nice. One step closer to {goal}."
- **No goal set:** "Keep the momentum." and "Everything else is bonus."

**Tough-love rules:**
- At most once a day.
- Never right after a completion.
- Always ends with one action.
- Off when the tone setting is `hype`.
- After a low day, the next completion gets a hype line.

## 10. Rewards on completion

1. **Within 100ms:** a check pop, a confetti burst from the button, a 3-note synthesized chime (Web Audio, no files) and a haptic tick where supported.
2. The row slides out after 350ms, and the write is optimistic.
3. A toast shows a rotating praise line with **Undo** for 5 seconds:
   - "Off your plate."
   - "One less thing in your head."
   - "Handled."
   - "Crossed off. Next."
   - For P0 and P1 tasks: "Big one, done."
4. **Daily goal hit:** a big burst, a longer chime, and "Daily goal hit. Everything else today is bonus."
5. About 1 in 8 completions gets a surprise bigger celebration.
6. Respect `prefers-reduced-motion`. Sound and haptics each have a toggle.

## 11. Quick-add syntax (Phase 1+)

One input with live chips under it.

| Token | Meaning | Example |
|---|---|---|
| natural date | deadline, confirmed | `fri`, `besok`, `12 nov`, `in 3 days` |
| date with `?` | deadline, unconfirmed | `fri?` |
| `at <time>` | scheduled_at | `fri at 2pm` |
| `start <date>` | start_by_manual | `start mon` |
| `ready <date>` | ready_by | `ready 20 nov` |
| `fu <date>` | follow_up, status waiting | `fu thu` |
| `!0` to `!4` | priority | `!1` |
| `#tag` | project, prefix match | `#omni` |
| `~15m`, `~1h`, `~s`, `~m`, `~l` | estimate (s=15, m=60, l=180) | `~30m` |
| `^high`, `^low` | energy | `^high` |
| `@wait`, `@wait:Pak Arief` | waiting, waiting_on | |
| `every <rule>` | repeating | `every mon wed fri` |
| `after:<text>` | dependency, fuzzy match | `after:sultan dp` |
| `Rp<amount>` | value_idr | `Rp5jt` |

`parseQuickAdd` is a pure function with at least 40 tests, including Indonesian words (`besok`, `lusa`, `senin` to `minggu`). A fuzzy match over 0.8 against open tasks offers "Looks like 'Navaho payments'. Merge or keep both?"

## 12. Voice (simple)

### Voice in

1. **Siri Shortcut "Otto" (Phase 0):**
   - Electra says "Hey Siri, Otto" and dictates.
   - The Shortcut calls the `otto_capture` database function (Appendix C).
   - The function strips "hey otto", "please" and "add", saves the task to Unsorted with `source = 'siri'` and the original in `raw_text`, and returns "Added to Otto: ...", which Siri reads aloud.
   - Works from the lock screen, AirPods, Apple Watch and CarPlay.
2. **In-app:** the capture box works with the iPhone keyboard's dictation button. Build no custom speech recognition.
3. **Rambling:** Claude voice mode (section 13).
4. **Phase 2+:** `otto_capture` text also runs through `parseQuickAdd` plus a fuzzy name fixer. The fixer matches against known names (Sultan, Pak Arief, Navaho, Sundari, Demian, Rumahati, Teba, IVG), so "navajo" becomes Navaho and "demi an" becomes Demian.

### Voice out

- Otto speaks short lines with the browser's built-in `speechSynthesis`, only after a tap (iPhone rule): the completion praise, goal hit, focus timer end and the morning line on app open.
- One setting: "Otto speaks" on or off, default on. It prefers an Enhanced or Premium system voice when the phone has one.
- Notifications don't speak. They only play the notification sound.
- Later and optional: pre-recorded fixed lines made once with Piper TTS (free, runs locally) for one consistent Otto voice.

## 13. Claude connection (Electra's subscription, no API billing)

- **How it connects:** Claude's official Supabase connector (claude.ai > Settings > Connectors > Supabase), authorized for the `otto` Supabase project only.
- **Where Electra talks:** a Claude Project called "Otto", with the instructions in Appendix B. Electra opens it in the Claude iPhone or desktop app, rambles by voice or text, and Claude writes tasks into `public.tasks` with `source = 'claude'`.
- **What Claude can do there:**
  - Turn a ramble into tasks.
  - Fix names.
  - Set dates, times, waiting items and follow-ups.
  - Mark tasks done.
  - Answer "what's on today" or "what am I waiting on".
  - Plan the week from the data.
- **Live updates:** Otto subscribes to Supabase Realtime on `tasks`, so rows Claude adds appear without a reload. Each new row gets a small "From Claude" tag for 24 hours.
- **Safety:**
  - The Supabase project holds only Otto.
  - The instructions limit Claude to SELECT, INSERT and UPDATE on `public.tasks`, and Claude asks before any delete.
  - Electra deletes in the app.
- **Phase 4b, optional:** a dedicated Otto MCP server as a Supabase Edge Function. It exposes only `add_tasks`, `list_today`, `list_waiting`, `move_task`, `complete_task` and `plan_week`, then replaces the raw Supabase connector for a smaller blast radius.
- **Phase 5, optional:** a scheduled Claude Code routine on the subscription that each morning breaks down tasks marked "too big", drafts follow-up messages into `notes`, and writes the morning line.

## 14. Calendar view

Calendar is a main tab. The views:

- **Month (mobile default):**
  - A 7-column grid, starting Monday.
  - Each day shows up to four marks:
    - deadline: square, red-clay;
    - follow-up: ring, plum;
    - expected ready: dot, sun yellow;
    - timed item: bar, fern green.
  - Unconfirmed deadlines get a dashed outline.
  - Today is outlined.
- **Day agenda:** tapping a day opens a list underneath with timed items in time order, then deadlines, follow-ups and ready dates, each labeled. Tapping an empty area starts quick-add with that date filled in.
- **Week timeline (desktop default, Phase 3):**
  - 7 columns of hours, showing timed items, schedule blocks and busy blocks.
  - Drag to move, which pins the block.
  - Drag a task from the list onto a slot to schedule it.
  - Overload warnings sit above the day they apply to.
- **Undated tasks:** a footer reads "6 open tasks have no date yet," and tapping it opens them in All.
- **Calendar feed (Phase 6):** `/cal/<secret>.ics` for subscribing in iPhone Calendar. Tell Electra to turn **Remove Alerts** off when subscribing.

## 15. Notifications (Phase 4)

- **Channel:** Web Push to the home-screen app (iOS 16.4+) and desktop browsers.
- **Turning it on:** permission is requested only from a "Turn on reminders" tap. If the app isn't installed on iPhone yet, show the Add to Home Screen steps first.
- **Health:**
  - A status line reads "Reminders on. Last delivered 08:00." with a **Send test** button.
  - Re-subscribe on every app open, and delete subscriptions that return 404 or 410.
  - If no push succeeds in 24 hours, the 08:00 summary goes by email instead.
- **What gets sent:**
  - A block starting in 10 minutes.
  - Start-by reached.
  - Deadline in 7 days, in 1 day, today, and overdue.
  - A waiting item's return date reached.
  - An 08:00 summary and a 17:00 wrap-up.
- **Limits:**
  - Quiet hours 21:00 to 08:00 WIB.
  - At most 2 reminders per task per day.
  - The home-screen icon badge shows overdue plus forced tasks.
- **Tapping a notification** opens `/t/<id>` with Done, Tomorrow and Too big? ready.

## 16. Screens and layout

### Mobile (base, under 768px)

- **Bottom tab bar** (safe-area aware): Today, Calendar, **+** (center, raised), Waiting, Goals. "All tasks" lives inside Waiting's header and the desktop sidebar.
- **ADHD layout rules for Today:**
  - The things that matter are always visible without scrolling: streak, score, how many are done, time left, and the one task.
  - Everything else sits below, and most of it is folded.
  - The Done button is always in the same spot.
  - At most one "you could also" list (Up next), capped at 2 items.
- **Today, top to bottom:**
  1. **Pulse bar:** sticky at the top (safe-area aware), one row of pills that scrolls sideways if needed, always visible while scrolling.
     - **Streak** in fire red with a flame: "4 day streak".
     - **Score** in fire red, with a mini progress ring.
     - **Done today:** 3 sun bars and "1/3".
     - **Time left today:** a clock and "6h 20m", counting down to the end of work hours. This is a time-blindness anchor.
     - On narrow phones, every label except the streak's hides.
  2. **Greeting:**
     - The date in small muted text.
     - "Morning, Electra." (Afternoon and Evening by time of day.)
     - Otto's line with the small green OTTO badge.
  3. **Energy check-in** (section 8a).
  4. **The green "Do this next" card:**
     - Label row: "Do this next · OmniSync · ~15 min" on the left, a **Just this one** pill on the right (focus mode).
     - Big title, then "First step: ...", then the reason line.
     - Two big buttons side by side: **Done** and **Start 5 min** (25 when Charged). The start button turns into a countdown with a thin progress bar. When it ends: "5 minutes done. Starting was the hard part."
     - A "Not right now" link opens three choices: **Later today**, **Tomorrow**, **It's too big**. They're never all visible at once.
  5. **Up next card**, always open:
     - At most 2 tasks, each with a tick and a time.
     - The line "Otto keeps the order. You only need the green card."
  6. **Folded sections**, each with a count pill, closed by default:
     - "Needs a quick decision" (overdue triage, red-clay border, with the line "No stress, just pick one.")
     - "Waiting on others"
     - "Done today"
  7. **Your day card:**
     - Score gauge, with the arc and number in fire red.
     - "1 of 3 done" with three sun step bars.
     - The line "Two more and today counts as a win."
     - A fire-red streak, "4 days in a row".
  8. **Goal card** (section 9).
  9. **Today's plan:** time blocks, folded on mobile and open on desktop.
- **Focus mode ("Just this one"):**
  - Hides everything except the pulse bar and the green card.
  - A dashed bar under the card reads "Everything else is hidden. Just this one." with a **Show everything** link.
  - The setting is remembered between visits.
  - When the card is done, the next task takes its place, still in focus mode.
- **Quick-add:** the **+** opens a bottom sheet titled "What's on your mind?", with an input, a mic button, the line "Just get it out of your head. Otto sorts it later." and **Add it**.
- **Gestures:**
  - Swipe right: Done.
  - Swipe left: Tomorrow.
  - Long-press: Edit.
  - Every gesture also has a visible button.
- **Editing:** bottom sheets.
- **Tap targets:** at least 44px.

### Desktop (768px and up)

Desktop is not a stretched phone.

- **Today on desktop:** two columns. The left column holds the greeting, energy check-in, next card and folded lists. The right column holds Your day, the goal card and today's plan (open). An **Add a task** button sits in the top bar.
- **Three panes elsewhere:** sidebar (views, projects, score card); middle (list or week timeline); right (task detail, edited inline).
- **Shortcuts:**

  | Key | Action |
  |---|---|
  | `N` or `/` | add |
  | `J` / `K` | move |
  | `D` | done |
  | `T` | tomorrow |
  | `E` | edit |
  | `F` | focus |
  | `Cmd/Ctrl+K` | command palette |
  | `1` to `4` | views |
  | `?` | help |

- **Install:** with Chrome's Install, or Safari's Add to Dock on macOS 14+.

### Focus timer

- "Start 5 min" from the next card by default. It's 25 on a Charged day, and 15, 25 and 50 are offered from the task detail.
- Shows a progress bar on the card and a countdown in the tab title.
- At the end: chime, then "Time's up. Done, or another round?"
- Logs focus minutes.

## 17. Visual design and copy

- **Direction:** "Solarpunk Day". Fern green and sun yellow on warm paper: plants plus solar.
  - It's eco and optimistic. Clean type, thin lines and lots of space keep it futuristic.
  - Light is the default. Dark mode is its night twin, "Forest Night": deep forest green, never plain black.
  - No neon glows, no purple gradients, no glassmorphism except the blurred bottom bar.
- **Tokens:** copy these from `otto-preview.html`, light first.

  | Token | Light (Solarpunk Day) | Dark (Forest Night) |
  |---|---|---|
  | bg | `#f5f4ec` | `#0f1e19` |
  | panel | `#ffffff` | `#152822` |
  | panel-2 | `#f8f8f1` | `#1a302a` |
  | line | `#e3e2d5` | `#24413a` |
  | ink | `#1c2a21` | `#e8f2ea` |
  | muted | `#66766b` | `#9db7a9` |
  | accent (fern / mint) | `#2f7d5b` | `#9fe3bd` |
  | accent-ink (text on accent) | `#ffffff` | `#0b1f17` |
  | sun (goal, done bars, celebration) | `#f2bf45` | `#f1d48a` |
  | fire (streak, score) | `#e0442a` | `#ff6a4d` |
  | late | `#b8442b` | `#ef8a6d` |
  | ok (done) | `#2f7d5b` | `#9fe3bd` |
  | amber (OmniSync) | `#c98a12` | `#e6b75a` |
  | soil (Teba) | `#8a5a33` | `#c99a6e` |
  | plum (Content, from Claude) | `#7b56ad` | `#bea2e8` |
  | coral (Personal) | `#c45a36` | `#f29473` |

- **Color roles:**
  - **Green** (accent): the next card, primary buttons, the energy selection, the gauge, the OTTO badge and the logo.
  - **Sun:** goal progress, the day's step bars and confetti.
  - **Fire red:** only the streak (with the flame) and the score: the ring, gauge arc and number. Nothing else is fire red, so it always reads as "this matters, keep it alive".
  - **Late (red-clay):** stays a separate, softer color for overdue items, so overdue never looks like the streak.
  - In short: green means act, sun means progress, fire means don't break the chain.
  - No blue or indigo anywhere.
- **Type:**
  - Michroma only for the OTTO wordmark, the OTTO badge and the gauge label.
  - Geist for everything else, in sentence case. No all-caps labels.
  - Geist Mono for numbers, times and amounts, with tabular numbers.
  - Body text at 16px.
- **Shape:** rounded but not bubbly. Cards 16 to 22px, buttons 12 to 14px, pills fully round. Tap targets are 44px or larger.
- **Themes:** light and dark follow the system, with a manual toggle.
- **Motion:** only on completion, sheets and dragging. Respect reduced motion.
- **Copy rules:**
  - No em dashes and no filler words.
  - Buttons start with a verb.
  - Errors say what failed and what to do.
  - Empty states say what to do next.
  - Countdowns in plain words: "due in 2 days", "3 days late".
  - Unconfirmed deadlines always say "unconfirmed".

## 18. Phases

### Phase 0: Tonight

- **Electra:**
  - Creates a Supabase project `otto` (region Singapore) and runs Appendix A parts 1 and 2.
  - Logs into the deployed app once, then runs part 3 (owner setup) and part 4 (seed).
  - Connects the Supabase connector in Claude and creates the "Otto" Claude Project with Appendix B.
  - Builds the Siri Shortcut from Appendix C.
- **Build `index.html`:** match `otto-preview.html`.
  - Magic-link login.
  - Today, laid out as in section 16:
    - sticky pulse bar (fire streak, fire score ring, done bars, time left);
    - greeting;
    - energy check-in (section 8a, without the scheduler effects);
    - next card with Done, Start 5 min, Not right now and Just this one (focus mode);
    - Up next card (max 2);
    - folded Needs a quick decision, Waiting on others and Done today;
    - Your day card with the fire gauge and streak;
    - goal card with bucket list (section 9).
  - Waiting.
  - Calendar: month grid plus day agenda (section 14).
  - All, grouped by project with filters.
  - Capture box and edit sheet.
  - Rewards (section 10, without the surprise rule).
  - Otto speaks (section 12).
  - Realtime updates.
  - Web app manifest and apple-touch-icon so it installs on the home screen.
- **Supabase setting:** in Supabase Auth > URL Configuration, set Site URL and Redirect URLs to the deployed address, or the magic links will point to localhost.
- **Done when:**
  - Rambling "Demian meeting tomorrow at 2 for 30 minutes, chase Pak Arief about the Sultan DP Thursday" in the Claude Otto project makes both items appear in Otto (Today and Calendar) without a reload.
  - "Hey Siri, Otto, buy compost bags" lands in Unsorted.
  - Tapping Low changes the next card to a 5 minute task.
  - Saving a goal with `50jt` shows a progress bar.
  - "Just this one" hides everything but the pulse bar and green card, and stays on after a reload.
  - The pulse bar stays visible while scrolling on a 390px-wide phone.

### Phase 1: Real app

- Port to Next.js on Vercel with the same database.
- Full quick-add parser and design tokens.
- Bottom tab bar and desktop three-pane layout.

### Phase 2: Smart core

- Priority score with reasons, auto start-by, postpone count, force rule and nightly sweep.
- Siri text runs through the parser and name fixer.
- **Done when:** a task postponed 3 times locks into the next high-energy slot.

### Phase 3: Scheduler

- Time blocks, energy matching, dependencies, knock-on rescheduling and overload warnings.
- Week timeline with drag.
- Focus timer.
- **Done when:** moving Sultan DP moves Sultan agreement after it, with a toast.

### Phase 4: Notifications

- Section 15 in full.
- **Done when:** a lock-screen notification opens the exact task.
- **4b (optional):** the dedicated Otto MCP server.

### Phase 5: Score and history

- Score, momentum, goal messages and goal progress from `value_idr`.
- Energy learning (section 8a): energy by hour and weekday in the weekly review, and suggested windows.
- Estimate learning: median of actual focus time vs estimate over 20 tasks. Offer auto-adjust when it's outside 0.8 to 1.2.
- Best hours: from 30 days of completion times, suggest new energy windows after 14 days.
- Per-contact follow-up timing.
- Weekly review on Sunday at 17:00.
- Optional Claude morning routine.

### Phase 6: Repeats and extras

- Repeating tasks: the next instance is created only when the current one is done or dropped.
- Pipelines. The compost timeline comes from Electra and is never assumed.
- Duplicate check, command palette and calendar feed.

## 19. Quality bar

- Engine code (`src/engine/*`) is pure TypeScript with at least 90% test coverage.
- Fixtures cover:
  - an overloaded week
  - a dependency chain
  - forced tasks
  - quiet hours
  - a deadline on a non-working day
  - midnight WIB
- First load under 2 seconds on 4G. Every tap responds within 100ms.
- Lighthouse PWA and accessibility scores of 90 or more.
- Light and dark themes both checked at phone and desktop sizes.

## 20. Seed tasks

Appendix A part 4 inserts these 16 with no dates and `deadline_confirmed = false`. Seven more from the original 23 are still missing; Electra adds them by talking to Claude.

- **P1:**
  - IVG post (content)
  - Follow up Pak Arief on Sultan down payment (omnisync)
  - Sultan agreement (omnisync, depends on the down payment)
  - Navaho payments (omnisync)
  - Send Sundari live link (omnisync)
  - Demian invoice module (omnisync)
- **P0:**
  - Start next compost batch (teba)
  - Send client outreach (omnisync)
  - Send feedback requests (omnisync)
- **P2:**
  - Build Sundari system (omnisync)
  - Rumahati project (omnisync, name to confirm)
- **P3:**
  - Build mailing list (content, source to confirm)
  - Set up hour tracking (omnisync, definition to confirm)
  - Teba business development (teba)
- **P4:**
  - Website redesign (omnisync)
  - Workouts (personal, `every mon wed fri` from Phase 6)

## 21. Electra fills these in (never invent them)

- Goals and bucket list items, with optional target amounts in IDR. Electra enters them in the app.
- Compost batch timeline: turning days and ready day.
- Real deadlines for the seed tasks.
- Working hours and high-energy windows. The defaults are 08:30 to 16:30, Monday to Saturday, with high energy from 08:30 to 11:30, and Electra can edit them.

---

## Appendix A: Supabase SQL

Run these in the Supabase SQL Editor, in order.

### Part 1: Tables and rules

```sql
create table public.otto_settings (
  id int primary key default 1 check (id = 1),
  owner_id uuid references auth.users on delete cascade,
  capture_secret text,
  timezone text not null default 'Asia/Jakarta'
);
alter table public.otto_settings enable row level security;
-- No policies on purpose: only the functions below and the SQL editor touch this table.

create or replace function public.otto_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.otto_settings where id = 1
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  title text not null,
  project text check (project in ('omnisync','teba','content','personal')),
  priority int check (priority between 0 and 4),
  status text not null default 'todo' check (status in ('todo','waiting','done','dropped')),
  estimate_min int,
  energy text check (energy in ('high','low')),
  scheduled_at timestamptz,
  deadline date,
  deadline_confirmed boolean not null default false,
  start_by_auto date,
  start_by_manual date,
  follow_up date,
  ready_by date,
  next_action text,
  waiting_on text,
  notes text,
  plan_for date,
  postpone_count int not null default 0,
  forced boolean not null default false,
  depends_on uuid[] not null default '{}',
  rrule text,
  series_id uuid,
  value_idr numeric,
  source text not null default 'app' check (source in ('app','claude','siri')),
  raw_text text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
create policy "owner reads and writes own tasks" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create index tasks_open_idx on public.tasks (user_id, status);

-- Live updates in the app when Claude or Siri writes.
alter publication supabase_realtime add table public.tasks;

-- Goals and bucket list. Starts empty; Electra fills it in the app.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  name text not null,
  target_idr numeric,
  saved_idr numeric not null default 0,
  is_current boolean not null default false,
  reached_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.goals enable row level security;
create policy "owner reads and writes own goals" on public.goals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Only one current goal at a time.
create unique index goals_one_current on public.goals (user_id) where is_current;

-- Energy check-ins (section 8a).
create table public.energy_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  level text not null check (level in ('low','ok','high')),
  source text not null default 'app' check (source in ('app','claude')),
  at timestamptz not null default now()
);
alter table public.energy_checkins enable row level security;
create policy "owner reads and writes own checkins" on public.energy_checkins
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create index energy_checkins_at_idx on public.energy_checkins (user_id, at desc);

alter publication supabase_realtime add table public.energy_checkins;
```

### Part 2: Siri capture function

```sql
create or replace function public.otto_capture(p_secret text, p_text text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.otto_settings;
  clean text;
begin
  select * into s from public.otto_settings where id = 1;
  if s.capture_secret is null or p_secret is distinct from s.capture_secret then
    raise exception 'Wrong capture key. Check the Otto Shortcut.';
  end if;
  clean := btrim(regexp_replace(coalesce(p_text, ''),
    '^\s*(hey\s+)?otto[,.\s]*(please\s+)?(add\s+)?', '', 'i'));
  if clean = '' then
    return 'Didn''t catch that. Try again.';
  end if;
  insert into public.tasks (user_id, title, source, raw_text)
  values (s.owner_id, clean, 'siri', p_text);
  return 'Added to Otto: ' || clean;
end $$;

revoke all on function public.otto_capture(text, text) from public;
grant execute on function public.otto_capture(text, text) to anon, authenticated;
```

### Part 3: Owner setup

Run this after logging into the deployed app once with the magic link. Replace the email.

```sql
insert into public.otto_settings (id, owner_id, capture_secret)
select 1, id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
from auth.users where email = 'YOUR_EMAIL_HERE'
on conflict (id) do update set owner_id = excluded.owner_id;

-- Copy the secret into the Siri Shortcut (Appendix C). Never share it.
select capture_secret from public.otto_settings where id = 1;
```

### Part 4: Seed tasks

```sql
with seed(title, project, priority, notes) as (values
  ('Publish the IVG post', 'content', 1, null),
  ('Follow up Pak Arief on the Sultan down payment', 'omnisync', 1, null),
  ('Sultan agreement', 'omnisync', 1, null),
  ('Navaho payments', 'omnisync', 1, null),
  ('Send the Sundari live link', 'omnisync', 1, null),
  ('Demian invoice module', 'omnisync', 1, null),
  ('Start the next compost batch', 'teba', 0, 'Background task. Once started, set it to waiting with the expected ready date.'),
  ('Send client outreach', 'omnisync', 0, 'Background task. Send, then set to waiting with a return date.'),
  ('Send feedback requests', 'omnisync', 0, 'Background task. Send, then set to waiting with a return date.'),
  ('Build the Sundari system', 'omnisync', 2, null),
  ('Rumahati project', 'omnisync', 2, 'Project name still to confirm.'),
  ('Build the mailing list', 'content', 3, 'Source of the list still to confirm.'),
  ('Set up hour tracking', 'omnisync', 3, 'What counts as tracked hours still to confirm.'),
  ('Teba business development', 'teba', 3, null),
  ('Website redesign', 'omnisync', 4, null),
  ('Workouts', 'personal', 4, null)
)
insert into public.tasks (user_id, title, project, priority, notes)
select public.otto_owner(), title, project, priority, notes from seed;

update public.tasks set depends_on = array[
  (select id from public.tasks where title = 'Follow up Pak Arief on the Sultan down payment')
] where title = 'Sultan agreement';
```

---

## Appendix B: Claude Project instructions

Create a Project in Claude called **Otto** and paste this into its instructions.

```
You are Otto's intake desk. Electra has ADHD and talks fast. Your job: turn what
Electra says into clean rows in Otto's task database, then confirm briefly.

DATABASE
- Use the Supabase connector, project "otto".
- Allowed: SELECT, INSERT, UPDATE on public.tasks. INSERT on
  public.energy_checkins. SELECT on public.goals. Nothing else.
- Never DELETE, DROP, ALTER, TRUNCATE, or touch any other table. If Electra asks
  to delete, say it's done in the app, or ask for an explicit "yes, delete it".
- Don't set user_id. It fills itself in.
- Always set source = 'claude' and raw_text = the part of Electra's message the
  task came from.
- Today's date: select (now() at time zone 'Asia/Jakarta')::date
- Times are WIB. Write scheduled_at with +07:00, e.g. '2026-10-12 14:00+07:00'.

COLUMNS
title (short, starts with a verb when possible), project, priority (0-4 or null),
status (todo | waiting | done | dropped), estimate_min, energy (high | low),
scheduled_at, deadline, deadline_confirmed, start_by_manual, follow_up, ready_by,
next_action, waiting_on, notes, value_idr.

PROJECTS
- omnisync: client web work. Clients: Sultan (contact Pak Arief), Navaho,
  Sundari, Demian, Rumahati. Websites, invoices, client meetings.
- teba: Teba Compost. Batches, turning, selling, compost business.
- content: IVG post, mailing list, social posts.
- personal: workouts, errands, personal commitments.
- If unclear, leave project null.

RULES
1. One row per action. A ramble often holds several tasks. Split them.
2. Fix names to the spellings above (navajo -> Navaho, demi an -> Demian,
   pak arif -> Pak Arief, sundary -> Sundari).
3. Deadlines: a firm date ("due Friday", "must send by the 20th") sets deadline
   and deadline_confirmed = true. A soft hint ("probably Friday", "sometime next
   week") sets deadline with deadline_confirmed = false. No date mentioned means
   deadline stays null. Never invent a deadline.
4. Meetings and calls with a time go in scheduled_at with estimate_min (default
   30). With no time given, title it "Set a time: meeting with <name>" and leave
   scheduled_at null.
5. Waiting: "waiting for", "hasn't replied", "hasn't paid", "chase" means status
   'waiting', waiting_on = who, follow_up = the date Electra gives, or 3 days from
   today if none. next_action = what to do when it comes back.
6. Background jobs (compost batches, deliveries): ready_by = expected ready date
   only if Electra states it.
7. Priority only when clear: "urgent", "today", money on the line = 1. Things to
   start early so they run in the background = 0. Otherwise null.
8. Money: if a task brings in money and Electra says the amount, set value_idr
   (5jt = 5000000).
9. Duplicates: before inserting, search open tasks with
   title ilike '%keyword%'. If it's the same task, UPDATE it instead.
10. "Done with X" means status = 'done', done_at = now() on the matching open task.
    If several match, ask which.
11. Energy: if Electra says how she feels ("I'm wiped", "low energy", "feeling
    great, let's go"), insert into energy_checkins (level low | ok | high,
    source 'claude'). For low, suggest one task of 15 minutes or less. For high,
    suggest the biggest P1/P2 task.
12. Goals: read public.goals where is_current to mention her goal by name when
    it helps ("That invoice gets you closer to <goal>"). Never create or change
    goals. Electra does that in the app.

REPLIES
- After writing, reply in Otto's voice: short, direct, no emoji, no em dashes.
- List what changed, one line each:
  "Added 3.
   - Meeting with Demian, tomorrow 14:00, 30 min.
   - Chase Pak Arief on Sultan DP, waiting, back Thursday.
   - Turn compost, Saturday (deadline unconfirmed)."
- If something was ambiguous, add it anyway with what you know, then ask one
  short question at the end.
- For "what's on today" or "what am I waiting on", query and answer in the same
  short style. Order today by: scheduled times, then priority, then deadline.
```

---

## Appendix C: Siri Shortcut "Otto"

1. Open **Shortcuts** > **+** and name it **Otto**.
2. Add **Dictate Text**. Set Stop Listening to **After Pause**, and Language to English (or Indonesian).
3. Add **Get Contents of URL**:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/rest/v1/rpc/otto_capture`
   - Method: **POST**
   - Headers:
     - `apikey`: your anon or publishable key
     - `Content-Type`: `application/json`
   - Request Body, as JSON:
     - `p_secret` (Text): the capture secret from Appendix A part 3
     - `p_text` (Text): the **Dictated Text** variable
4. Add **Speak Text** with **Contents of URL** as the input.
5. Test it by saying "Hey Siri, Otto", then "buy compost bags". Siri should say "Added to Otto: buy compost bags", and the task appears in Otto under Unsorted.
6. **If it fails:** a "Wrong capture key" reply means the secret doesn't match. A 401 or 404 means the URL or `apikey` is wrong.
