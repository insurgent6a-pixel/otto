# Otto

A personal command center for Electra: one green card, two after it, everything else one tap away.
Otto plans the day, Electra overrides anything. Claude writes tasks in through Supabase.

- **Set it up:** [SETUP.md](SETUP.md)
- **Spec:** [otto-master-prompt.md](otto-master-prompt.md)
- **Build status:** [PROGRESS.md](PROGRESS.md)

## Stack

Next.js 16 (App Router, TypeScript strict) PWA on Vercel, Supabase (Postgres + RLS, magic link and code sign-in, Realtime, pg_cron), Web Push, Tailwind v4 with the Solarpunk Day / Forest Night tokens. All "smart" behavior is deterministic code in `src/engine`; there are no AI API calls in the app.

## Layout

| Path | What |
|---|---|
| `src/engine/` | Pure TypeScript: quick-add parser, fuzzy names, money, priority score, start-by, force rule, nightly sweep, scheduler, daily score and momentum, Otto's lines, learning, repeats, ICS, pipelines. 99% test coverage. |
| `src/lib/store.ts` | Client store: auth, cached first paint, Realtime, optimistic writes, and the reconcile loop that keeps start-by dates and the schedule current. |
| `src/lib/jobs.ts` | Server jobs behind the 5-minute cron tick: sweep, plan, summaries, reminders, score snapshot, repeats, email fallback. |
| `src/app/api/` | `cron/tick`, `capture` (Siri), `push/test`, `mcp/[secret]` (Otto connector for Claude). `src/app/cal/[file]` is the calendar feed. |
| `supabase/migrations/` | The whole schema. `supabase/cron.sql` installs the clock. |

## Develop

```
npm install
npx supabase start          # local Postgres, Auth, Realtime (needs Docker)
cp .env.example .env.local  # fill from `npx supabase status` and `npx web-push generate-vapid-keys`
npm run dev
```

Checks:

```
npm test                    # engine unit tests
npm run test:cov            # with coverage (90% minimum)
npm run typecheck && npm run lint
npx playwright test         # e2e at 390x844 and 1440x900; signs in through the local mail catcher
```

`npx playwright test perf --project phone` against a production build (`OTTO_URL=http://localhost:3001`) measures first load on throttled 4G.
