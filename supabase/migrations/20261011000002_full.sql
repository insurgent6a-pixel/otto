-- Otto phases 1 to 6: settings, history, scheduling, push, pipelines.
-- Run after 20261011000001_init.sql. Safe to run before anyone has logged in.

-- Settings -----------------------------------------------------------------

alter table public.otto_settings
  add column if not exists display_name text not null default 'Electra',
  add column if not exists work_start text not null default '08:30' check (work_start ~ '^\d{2}:\d{2}$'),
  add column if not exists work_end text not null default '16:30' check (work_end ~ '^\d{2}:\d{2}$'),
  add column if not exists work_days int[] not null default '{1,2,3,4,5,6}',
  add column if not exists energy_windows jsonb not null default '[{"start":"08:30","end":"11:30"}]',
  add column if not exists daily_goal int not null default 3 check (daily_goal between 1 and 20),
  add column if not exists focus_cap_min int not null default 300 check (focus_cap_min between 30 and 960),
  add column if not exists quiet_start text not null default '21:00' check (quiet_start ~ '^\d{2}:\d{2}$'),
  add column if not exists quiet_end text not null default '08:00' check (quiet_end ~ '^\d{2}:\d{2}$'),
  add column if not exists tone text not null default 'steady' check (tone in ('steady','hype')),
  add column if not exists sound boolean not null default true,
  add column if not exists haptics boolean not null default true,
  add column if not exists speak boolean not null default true,
  add column if not exists followup_days int not null default 3 check (followup_days between 1 and 60),
  add column if not exists ics_secret text,
  add column if not exists mcp_secret text,
  add column if not exists fallback_email text,
  -- Otto's own memory: last messages, tough-love day, last snapshot. Written by the app and the cron job.
  add column if not exists state jsonb not null default '{}';

alter table public.otto_settings alter column timezone set default 'Asia/Makassar';
alter table public.otto_settings
  add constraint otto_settings_timezone_valid
  check (now() at time zone timezone is not null);

-- The owner reads and edits their own settings. Nobody else sees the row.
create policy "owner reads settings" on public.otto_settings
  for select to authenticated using (owner_id = auth.uid());
create policy "owner updates settings" on public.otto_settings
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter publication supabase_realtime add table public.otto_settings;

create or replace function public.otto_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.otto_settings where id = 1), 'Asia/Makassar')
$$;

-- Claude reads these instead of hardcoding a timezone.
create or replace function public.otto_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone public.otto_tz())::date
$$;

-- '+08:00' for WITA. Claude appends this to scheduled_at values.
create or replace function public.otto_utc_offset() returns text
language sql stable security definer set search_path = public as $$
  with x as (select (now() at time zone public.otto_tz()) - (now() at time zone 'UTC') as o)
  select case when o < interval '0' then '-' else '+' end || to_char(greatest(o, -o), 'HH24:MI') from x
$$;

create or replace function public.otto_local_now() returns text
language sql stable security definer set search_path = public as $$
  select to_char(now() at time zone public.otto_tz(), 'Dy YYYY-MM-DD HH24:MI')
    || ' ' || public.otto_tz() || ' (UTC' || public.otto_utc_offset() || ')'
$$;

grant execute on function public.otto_tz(), public.otto_today(), public.otto_utc_offset(),
  public.otto_local_now() to authenticated;

-- Seed tasks (Appendix A part 4) ------------------------------------------

create or replace function public.otto_seed_tasks(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from public.tasks where user_id = p_user) then
    return 0;
  end if;
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
  select p_user, title, project, priority, notes from seed;
  get diagnostics n = row_count;

  update public.tasks set depends_on = array[
    (select id from public.tasks where user_id = p_user and title = 'Follow up Pak Arief on the Sultan down payment')
  ] where user_id = p_user and title = 'Sultan agreement';
  return n;
end $$;
revoke all on function public.otto_seed_tasks(uuid) from public, anon, authenticated;

-- Owner setup (replaces Appendix A part 3). The first account to sign in owns Otto.
-- After your first login, turn off "Allow new users to sign up" in Supabase Auth.
create or replace function public.otto_claim() returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  current_owner uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  select owner_id into current_owner from public.otto_settings where id = 1;
  if current_owner is not null and current_owner <> me then
    raise exception 'This Otto belongs to another account.';
  end if;
  insert into public.otto_settings (id, owner_id, capture_secret, ics_secret, mcp_secret)
  values (1, me,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    replace(gen_random_uuid()::text, '-', ''),
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (id) do update set
    owner_id = me,
    capture_secret = coalesce(public.otto_settings.capture_secret, excluded.capture_secret),
    ics_secret = coalesce(public.otto_settings.ics_secret, excluded.ics_secret),
    mcp_secret = coalesce(public.otto_settings.mcp_secret, excluded.mcp_secret);
  perform public.otto_seed_tasks(me);
  return 'ok';
end $$;
revoke all on function public.otto_claim() from public, anon;
grant execute on function public.otto_claim() to authenticated;

-- History ------------------------------------------------------------------

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  task_id uuid references public.tasks on delete set null,
  kind text not null check (kind in ('created','done','undone','postponed','dropped',
    'waiting_started','resumed','focus_started','focus_ended','forced','rescheduled')),
  at timestamptz not null default now(),
  meta jsonb
);
alter table public.task_events enable row level security;
create policy "owner reads and writes own events" on public.task_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index task_events_at_idx on public.task_events (user_id, at desc);
create index task_events_task_idx on public.task_events (task_id, at desc);

-- done_at follows status, whoever writes (app, Claude or Siri).
create or replace function public.otto_task_before() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') and new.done_at is null then
    new.done_at := now();
  elsif new.status <> 'done' and new.done_at is not null then
    new.done_at := null;
  end if;
  if new.title is not null then
    new.title := btrim(new.title);
  end if;
  return new;
end $$;
create trigger tasks_before before insert or update on public.tasks
  for each row execute function public.otto_task_before();

-- Logs events and credits goal money, so Claude's writes count the same as the app's.
create or replace function public.otto_task_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g public.goals;
  credit jsonb;
  amount numeric;
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, kind, meta)
    values (new.user_id, new.id, 'created', jsonb_build_object('source', new.source));
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      credit := null;
      if coalesce(new.value_idr, 0) > 0 then
        update public.goals set saved_idr = saved_idr + new.value_idr
          where user_id = new.user_id and is_current
          returning * into g;
        if g.id is not null then
          credit := jsonb_build_object('goal_id', g.id, 'amount', new.value_idr);
          if g.target_idr is not null and g.saved_idr >= g.target_idr and g.reached_at is null then
            update public.goals set reached_at = now() where id = g.id;
          end if;
        end if;
      end if;
      insert into public.task_events (user_id, task_id, kind, meta)
      values (new.user_id, new.id, 'done', credit);
    elsif old.status = 'done' then
      select meta into credit from public.task_events
        where task_id = new.id and kind = 'done' order by at desc limit 1;
      if credit ? 'goal_id' then
        amount := (credit->>'amount')::numeric;
        update public.goals set saved_idr = greatest(0, saved_idr - amount),
          reached_at = case when target_idr is not null and saved_idr - amount < target_idr then null else reached_at end
          where id = (credit->>'goal_id')::uuid;
      end if;
      insert into public.task_events (user_id, task_id, kind, meta)
      values (new.user_id, new.id, 'undone', credit);
    elsif new.status = 'dropped' then
      insert into public.task_events (user_id, task_id, kind) values (new.user_id, new.id, 'dropped');
    elsif new.status = 'waiting' then
      insert into public.task_events (user_id, task_id, kind, meta)
      values (new.user_id, new.id, 'waiting_started', jsonb_build_object('waiting_on', new.waiting_on));
    elsif old.status = 'waiting' and new.status = 'todo' then
      insert into public.task_events (user_id, task_id, kind, meta)
      values (new.user_id, new.id, 'resumed', jsonb_build_object('waiting_on', old.waiting_on));
    end if;
  end if;

  if new.postpone_count > old.postpone_count then
    insert into public.task_events (user_id, task_id, kind, meta)
    values (new.user_id, new.id, 'postponed', jsonb_build_object('count', new.postpone_count));
  end if;
  if new.forced and not old.forced then
    insert into public.task_events (user_id, task_id, kind) values (new.user_id, new.id, 'forced');
  end if;
  if new.scheduled_at is distinct from old.scheduled_at then
    insert into public.task_events (user_id, task_id, kind, meta)
    values (new.user_id, new.id, 'rescheduled', jsonb_build_object('from', old.scheduled_at, 'to', new.scheduled_at));
  end if;
  return new;
end $$;
create trigger tasks_events after insert or update on public.tasks
  for each row execute function public.otto_task_events();

-- Scheduling -----------------------------------------------------------------

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  pinned boolean not null default false,
  source text not null default 'auto' check (source in ('auto','manual','force')),
  created_at timestamptz not null default now()
);
alter table public.schedule_blocks enable row level security;
create policy "owner reads and writes own blocks" on public.schedule_blocks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index schedule_blocks_start_idx on public.schedule_blocks (user_id, start_at);
alter publication supabase_realtime add table public.schedule_blocks;

create table public.busy_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  created_at timestamptz not null default now()
);
alter table public.busy_blocks enable row level security;
create policy "owner reads and writes own busy blocks" on public.busy_blocks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.busy_blocks;

-- Score history --------------------------------------------------------------

create table public.daily_scores (
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  day date not null,
  score int check (score between 0 and 100),
  parts jsonb,
  momentum numeric,
  done_count int not null default 0,
  daily_goal int,
  planned_ids uuid[],
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_scores enable row level security;
create policy "owner reads and writes own scores" on public.daily_scores
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.goals;

-- Push -----------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures int not null default 0
);
alter table public.push_subscriptions enable row level security;
create policy "owner reads and writes own subscriptions" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- One row per reminder sent, for the 2-per-task-per-day limit and dedupe.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  task_id uuid references public.tasks on delete cascade,
  kind text not null,
  day date not null,
  title text,
  body text,
  delivered boolean not null default false,
  sent_at timestamptz not null default now()
);
alter table public.notification_log enable row level security;
create policy "owner reads own notifications" on public.notification_log
  for select to authenticated using (user_id = auth.uid());
create index notification_log_day_idx on public.notification_log (user_id, day);

-- Jobs run once per local day; this table makes the 5-minute tick idempotent.
create table public.job_runs (
  job text not null,
  day date not null,
  ran_at timestamptz not null default now(),
  primary key (job, day)
);
alter table public.job_runs enable row level security;

-- Pipelines ------------------------------------------------------------------

create table public.pipeline_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default coalesce(auth.uid(), public.otto_owner())
    references auth.users on delete cascade,
  name text not null,
  steps jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.pipeline_templates enable row level security;
create policy "owner reads and writes own pipelines" on public.pipeline_templates
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
