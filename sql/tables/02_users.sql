-- ============================================================
-- USERS (profile table)
-- ============================================================
-- Single source of truth for user display data.
-- Synced automatically from auth.users via triggers.
-- role column replaces the separate admins table.
-- All other tables reference this table instead of storing
-- name/avatar redundantly.

create table if not exists public.users (
  id         uuid        primary key references auth.users(id) on delete cascade,
  name       text,
  avatar_url text,
  role       text        not null default 'player'
               check (role in ('player', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create profile row on first sign-in
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep display data current when Google re-issues the token with new metadata
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
  set
    name       = new.raw_user_meta_data->>'full_name',
    avatar_url = new.raw_user_meta_data->>'avatar_url'
  where id = new.id;
  return new;
end;
$$;

create or replace trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- Backfill profiles for any users who existed before this schema was applied
insert into public.users (id, name, avatar_url)
select
  id,
  raw_user_meta_data->>'full_name',
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;

-- All authenticated users can read profiles (needed for leaderboard view join)
create policy "users_select_authenticated"
  on public.users for select to authenticated
  using (true);

-- Users can update their own profile display data but cannot escalate their role
create policy "users_update_own_profile"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid() and
    role = (select role from public.users where id = auth.uid())
  );

-- Inserts are handled exclusively by the handle_new_user() trigger
-- (security definer, runs as postgres — bypasses RLS)
create policy "users_insert_deny_direct"
  on public.users for insert to authenticated
  with check (false);
