-- ============================================================
-- LEADERBOARD
-- ============================================================
-- Personal bests only — one row per (user, type).
-- user_name / user_photo are NOT stored here; join public.users instead.
-- All display data comes from the leaderboard_ranked view below.

create table if not exists public.leaderboard (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  score      integer     not null,
  type       text        not null default 'global',
  created_at timestamptz not null default now(),
  unique (user_id, type)
);

-- View that surfaces display data without redundant storage.
-- security_invoker = true means the caller's RLS is applied on the
-- underlying tables (leaderboard + users), not the view owner's.
create or replace view public.leaderboard_ranked
with (security_invoker = true) as
select
  l.id,
  l.user_id,
  u.name       as user_name,
  u.avatar_url as user_photo,
  l.score,
  l.type,
  l.created_at
from public.leaderboard l
join public.users u on u.id = l.user_id;

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard enable row level security;

create policy "leaderboard_select_authenticated"
  on public.leaderboard for select to authenticated
  using (true);

-- All writes go through submit_game_session() (security definer)
create policy "leaderboard_write_via_function"
  on public.leaderboard for all to authenticated
  using (false) with check (false);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Clients subscribe to the leaderboard table directly (not the view).
-- When a row changes, the app re-queries leaderboard_ranked to get
-- the joined display data.
alter publication supabase_realtime add table public.leaderboard;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Most common query pattern (type filter + score order)
create index if not exists leaderboard_type_score_idx
  on public.leaderboard (type, score desc);
