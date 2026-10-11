-- Run once in the Supabase SQL Editor after Otto is deployed.
-- Replace both values, then run. Re-running replaces the job.
-- Every 5 minutes Supabase pings Otto; Otto works out what's due in YOUR timezone
-- (sweep 00:30, plan 06:00, summary 08:00, wrap-up 17:00, score 23:55, reminders any time).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('otto-tick') where exists (select 1 from cron.job where jobname = 'otto-tick');

select cron.schedule(
  'otto-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-OTTO.vercel.app/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it ran: select * from cron.job_run_details order by start_time desc limit 5;
