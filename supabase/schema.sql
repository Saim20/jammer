-- Vocab Jam - Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up your project.

-- ============================================================
-- TABLES
-- ============================================================

-- Vocabulary words
create table if not exists public.words (
  id                 uuid        primary key default gen_random_uuid(),
  word               text        not null,
  correct_definition text        not null,
  distractors        text[]      not null default '{}',
  difficulty         integer     not null check (difficulty >= 1 and difficulty <= 10),
  created_at         timestamptz not null default now()
);

-- Player leaderboard
-- * type  separates leaderboard categories ('global', 'weekly', 'hard-mode', etc.)
-- * unique(user_id, type) keeps exactly one entry per player per leaderboard type,
--   so scores are updated in-place rather than growing without bound.
create table if not exists public.leaderboard (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  user_name  text        not null,
  user_photo text        not null default '',
  score      integer     not null,
  type       text        not null default 'global',
  created_at timestamptz not null default now(),
  unique (user_id, type)
);

-- Game configuration (single row, id is always 1)
create table if not exists public.game_config (
  id             integer primary key default 1,
  word_count     integer not null default 10,
  timer_seconds  integer not null default 10,
  difficulty_min integer not null default 1,
  difficulty_max integer not null default 10,
  constraint single_row check (id = 1)
);

-- Seed default config row
insert into public.game_config (id) values (1) on conflict (id) do nothing;

-- Admin users (presence of a row grants admin rights)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Per-user word performance tracking
-- Accumulates correct/incorrect counts across all game sessions.
-- Used to surface weak words in future personalised game modes.
create table if not exists public.user_word_stats (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  word_id         uuid        not null references public.words(id) on delete cascade,
  correct_count   integer     not null default 0,
  incorrect_count integer     not null default 0,
  last_seen_at    timestamptz not null default now(),
  last_correct    boolean,
  primary key (user_id, word_id)
);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

alter table public.words           enable row level security;
alter table public.leaderboard     enable row level security;
alter table public.game_config     enable row level security;
alter table public.admins          enable row level security;
alter table public.user_word_stats enable row level security;

-- words: read for all authenticated users
create policy "words_select_authenticated"
  on public.words for select
  to authenticated
  using (true);

-- words: insert/update/delete for admins only
create policy "words_write_admin"
  on public.words for all
  to authenticated
  using   (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

-- leaderboard: read for all authenticated users
create policy "leaderboard_select_authenticated"
  on public.leaderboard for select
  to authenticated
  using (true);

-- leaderboard: all writes go through submit_score() (security definer);
-- direct inserts/updates from the client are blocked.
create policy "leaderboard_write_via_function"
  on public.leaderboard for all
  to authenticated
  using (false)
  with check (false);

-- game_config: read for all authenticated users
create policy "game_config_select_authenticated"
  on public.game_config for select
  to authenticated
  using (true);

-- game_config: write for admins only
create policy "game_config_write_admin"
  on public.game_config for all
  to authenticated
  using   (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

-- admins: users can only read their own admin row (presence check)
create policy "admins_select_own"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- user_word_stats: users can read their own stats (for future personalisation UI)
create policy "user_word_stats_select_own"
  on public.user_word_stats for select
  to authenticated
  using (user_id = auth.uid());

-- user_word_stats: all writes go through record_word_results() (security definer)
create policy "user_word_stats_write_via_function"
  on public.user_word_stats for all
  to authenticated
  using (false)
  with check (false);

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- submit_score
-- Upserts a leaderboard entry, keeping the highest score the player has ever
-- achieved for this leaderboard type.  Display name and photo are always
-- refreshed so they stay current.
create or replace function public.submit_score(
  p_user_id    uuid,
  p_user_name  text,
  p_user_photo text,
  p_score      integer,
  p_type       text default 'global'
) returns void language plpgsql security definer as $$
begin
  -- Callers can only submit scores for themselves
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  insert into public.leaderboard (user_id, user_name, user_photo, score, type)
  values (p_user_id, p_user_name, p_user_photo, p_score, p_type)
  on conflict (user_id, type) do update set
    -- Only raise the score, never lower it
    score      = greatest(leaderboard.score, excluded.score),
    -- Always keep display info fresh
    user_name  = excluded.user_name,
    user_photo = excluded.user_photo,
    -- Advance timestamp only when the score actually improves
    created_at = case
      when excluded.score > leaderboard.score then now()
      else leaderboard.created_at
    end;
end;
$$;

-- record_word_results
-- Atomically increments correct/incorrect counters for a batch of word results
-- from a single game session.
-- p_results is a JSON array: [{"word_id": "<uuid>", "correct": true}, ...]
create or replace function public.record_word_results(
  p_user_id uuid,
  p_results  jsonb
) returns void language plpgsql security definer as $$
declare
  r jsonb;
begin
  -- Callers can only record stats for themselves
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  for r in select * from jsonb_array_elements(p_results) loop
    insert into public.user_word_stats
      (user_id, word_id, correct_count, incorrect_count, last_seen_at, last_correct)
    values (
      p_user_id,
      (r->>'word_id')::uuid,
      case when (r->>'correct')::boolean then 1 else 0 end,
      case when (r->>'correct')::boolean then 0 else 1 end,
      now(),
      (r->>'correct')::boolean
    )
    on conflict (user_id, word_id) do update set
      correct_count   = user_word_stats.correct_count
                          + case when (r->>'correct')::boolean then 1 else 0 end,
      incorrect_count = user_word_stats.incorrect_count
                          + case when (r->>'correct')::boolean then 0 else 1 end,
      last_seen_at    = now(),
      last_correct    = (r->>'correct')::boolean;
  end loop;
end;
$$;

grant execute on function public.submit_score        to authenticated;
grant execute on function public.record_word_results to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================

-- Enable Postgres changes for the leaderboard table so the client-side
-- Supabase Realtime channel receives live score updates.
alter publication supabase_realtime add table public.leaderboard;

-- ============================================================
-- INDEXES
-- ============================================================

-- Composite index covering the most common leaderboard query pattern
create index if not exists leaderboard_type_score_idx
  on public.leaderboard (type, score desc);

create index if not exists words_difficulty_idx
  on public.words (difficulty);

-- Quickly find a user's most-missed words
create index if not exists user_word_stats_incorrect_idx
  on public.user_word_stats (user_id, incorrect_count desc);

-- ============================================================
-- GRANTING ADMIN ACCESS
-- ============================================================
-- In the Supabase Dashboard -> Table Editor -> admins,
-- insert a row with the target user's UUID.  Or run:
--   insert into public.admins (user_id) values ('<user-uuid>');
