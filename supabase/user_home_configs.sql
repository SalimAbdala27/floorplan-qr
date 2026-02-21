create table if not exists public.user_home_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"homes":[],"activeHomeId":null}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_home_configs enable row level security;

create policy if not exists "user_home_configs_select_own"
  on public.user_home_configs
  for select
  using (auth.uid() = user_id);

create policy if not exists "user_home_configs_insert_own"
  on public.user_home_configs
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "user_home_configs_update_own"
  on public.user_home_configs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
