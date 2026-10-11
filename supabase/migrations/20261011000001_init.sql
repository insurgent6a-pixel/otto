-- Otto part 1 and 2: tables, rules and the Siri capture function (spec Appendix A).
-- Default timezone is WITA (Asia/Makassar). Change it any time in Otto > Settings.

create table public.otto_settings (
  id int primary key default 1 check (id = 1),
  owner_id uuid references auth.users on delete cascade,
  capture_secret text,
  timezone text not null default 'Asia/Makassar'
);
alter table public.otto_settings enable row level security;

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

alter publication supabase_realtime add table public.tasks;

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
create unique index goals_one_current on public.goals (user_id) where is_current;

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
