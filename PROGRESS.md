# Progress

Spec: otto-master-prompt.md
Current phase: all phases built and verified locally. Waiting on the user for accounts and deploy (see below).

## Phases
- [x] 0. Tonight: database, Claude connection, one app. Verified by `npx playwright test acceptance -g "Phase 0"` (Claude ramble appears live in Today and Calendar, Siri capture lands in Unsorted, Low gives a 5 minute task, 50jt goal shows a progress bar, Just this one survives reload, pulse bar sticky at 390px).
- [x] 1. Real app: Next.js 16 PWA, quick-add parser, tokens, bottom tabs, desktop three panes. Verified by typecheck, lint, `npm run build`, screenshots at 390 and 1440 in light and dark.
- [x] 2. Smart core: score with reasons, auto start-by, postpones, force rule, nightly sweep, Siri text through parser and name fixer. Verified by `-g "Phase 2"` (postponed 3 times locks into the next high-energy slot) and curl on `/api/capture`.
- [x] 3. Scheduler: blocks, energy matching, dependencies, knock-on, overload warnings, week timeline with drag, focus timer. Verified by `-g "Phase 3"` (moving Sultan DP moves Sultan agreement after it, with a toast).
- [x] 4. Notifications: web push, health line, test send, resubscribe on open, badge, 404/410 cleanup, quiet hours, 2-per-task limit, email fallback. 4b Otto MCP server. Verified by `-g "Phase 4"` (notification URL opens the exact task) and pg_cron → pg_net → `/api/cron/tick` returning 200 locally. Real lock-screen delivery needs the deployed HTTPS app and an iPhone.
- [x] 5. Score and history: daily score, momentum, goal messages and tough love, goal credit from value_idr (DB trigger, Undo takes it back), energy learning, estimate learning, best hours, per-contact follow-up, weekly review. Verified by `-g "Phase 5"` and engine tests.
- [x] 6. Repeats, pipelines, duplicate check, command palette, calendar feed. Verified by engine tests and curl on `/cal/<secret>.ics`.

Quality bar (spec 19):
- Engine: 317 tests, 99.7% statements, 97.8% branches (`npm run test:cov`). Fixtures cover an overloaded week, a dependency chain, forced tasks, quiet hours, a deadline on a non-working day and midnight in WITA vs WIB.
- First load on throttled 4G (4 Mbps, 100ms RTT, 4x CPU), signed in, empty caches: 1.79s (`e2e/perf.spec.ts`). Warm: 0.36s.
- Lighthouse (production build, login page): accessibility 100, best practices 100, performance 89. Lighthouse 12 no longer has a PWA category; installability comes from the manifest, icons and service worker.
- axe WCAG 2.1 AA on all 7 signed-in screens, light and dark, 390 and 1440: 28 of 28 clean (`npx playwright test a11y`).

## Assumptions
- Timezone: the user asked for WITA and a changeable zone. Default is `Asia/Makassar`, stored in `otto_settings.timezone`, editable in Settings (WIB/WITA/WIT quick picks plus every IANA zone). Every "WIB" time in the spec (00:30 sweep, 06:00 plan, 23:59 score, quiet hours) runs in the chosen zone. Claude's instructions read the zone from `otto_today()` and `otto_utc_offset()` instead of hardcoding +07:00.
- Skipped the throwaway Phase 0 `index.html` and built the Phase 1 Next.js app directly on the same Phase 0 schema, since all phases were requested in one go.
- `otto-preview.html` was not in the folder. The look follows the spec's tokens and layout text.
- Three colors moved slightly for WCAG AA text contrast: muted `#66766b` → `#5f6f64` (light), a `--fire-ink` `#c4381f` for small fire-red text in light mode (rings, gauge and flame keep `#e0442a`), and secondary buttons on the green card use a deeper fern instead of a translucent white.
- Owner setup (Appendix A part 3) and seeding (part 4) happen on first sign-in via `otto_claim()`. The first account to sign in owns Otto; SETUP.md says to turn off sign-ups right after.
- Sign-in sends a link and a 6-digit code, because a magic link opens Safari, not the home-screen app.
- Jobs run in Next.js route handlers behind one 5-minute pg_cron tick instead of Supabase Edge Functions, so the engine code is shared and the timezone can change without rescheduling cron.
- The Otto MCP server (4b) is a Next.js route with a secret URL rather than a Supabase Edge Function, for the same reason.
- Daily focus cap default: 5 hours (spec gives none).
- Tone setting: `steady` (tough love allowed) or `hype`.
- "Later today" hides the task from the top of Today for 2 hours on that device.
- Streak counts days the daily goal was hit; days off neither break nor add to it.
- Push email fallback uses Resend when `RESEND_API_KEY` is set; without it, the fallback is skipped.
- Next's automatic instant-navigation validation is set to opt-in (`manual-warning`): the app renders data on the client after sign-in, so every page would be flagged.

## Waiting on the user
- Create the Supabase project and run the two migrations (SETUP.md steps 1).
- Generate VAPID keys and a cron secret, deploy to Vercel with the env vars (steps 2 and 3).
- Set Site URL and redirect URL in Supabase Auth, sign in once, turn off sign-ups (steps 4 and 5).
- Run `supabase/cron.sql` with the deployed URL and cron secret (step 7).
- Connect the Supabase connector in Claude and paste the instructions from Settings > Claude (step 8).
- Build the Siri Shortcut (step 10).
- Fill in what Otto never invents: goals, real deadlines, the compost timeline, work hours.

## Notes for the next session
- Local stack: `npx supabase start` (Docker), `npm run dev`. Local keys are in `.env.local` (gitignored). The mail catcher is at http://127.0.0.1:54324; e2e reads sign-in codes from it.
- `window.__otto` exposes the store in development only; e2e uses it to pin a block.
- e2e tests that change data run on the phone project only. `npx supabase db reset` gives a clean slate; the global setup signs in again and re-seeds.
- Next 16 here has breaking changes: read `node_modules/next/dist/docs/` before touching routing or caching.
