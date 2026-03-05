-- Vocab Jam - Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up your project.

-- ============================================================
-- EXTENSIONS
-- ============================================================

-- Vector similarity search for word embeddings and AI agent features
create extension if not exists vector;

-- Trigram index for fast fuzzy word search in the admin panel
create extension if not exists pg_trgm;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Reusable updated_at trigger (attached to any table that needs it)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

-- ============================================================
-- WORDS
-- ============================================================

create table if not exists public.words (
  id                 uuid        primary key default gen_random_uuid(),
  word               text        not null,
  correct_definition text        not null,
  distractors        text[]      not null default '{}',
  difficulty         integer     not null check (difficulty between 1 and 10),
  -- AI / vector search support.
  -- Populate via scripts/seed-supabase.mjs using Google Gemini gemini-embedding-001
  -- with outputDimensionality=1536 and taskType=RETRIEVAL_DOCUMENT (L2-normalised).
  -- Use taskType=RETRIEVAL_QUERY when building the query vector for match_words().
  -- NULL until embedding is generated; match_words() skips NULL rows.
  embedding          vector(1536),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint words_word_unique unique (word),
  constraint distractors_count check (cardinality(distractors) = 3)
);

create trigger words_updated_at
  before update on public.words
  for each row execute function public.set_updated_at();

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

-- ============================================================
-- GAME CONFIG
-- ============================================================

create table if not exists public.game_config (
  id             integer primary key default 1,
  word_count     integer not null default 10,
  timer_seconds  integer not null default 10,
  difficulty_min integer not null default 1,
  difficulty_max integer not null default 10,
  constraint single_row check (id = 1)
);

insert into public.game_config (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- GAME SESSIONS
-- ============================================================
-- One row per completed game — source of truth for session-level analytics.

create table if not exists public.game_sessions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  score      integer     not null,
  word_count integer     not null,
  max_score  integer     not null,
  type       text        not null default 'global',
  created_at timestamptz not null default now()
);

-- Per-word results within a session.
-- Normalised raw data; aggregates live in user_word_stats.
-- answer_index: canonical slot the player chose, independent of shuffle order:
--   0 = correct_definition
--   1 = distractors[1]  (SQL arrays are 1-indexed)
--   2 = distractors[2]
--   3 = distractors[3]
--   NULL = timed out without answering
-- correct is a generated column — always consistent with answer_index, never writable directly.
create table if not exists public.session_words (
  session_id    uuid     not null references public.game_sessions(id) on delete cascade,
  word_id       uuid     not null references public.words(id)         on delete cascade,
  answer_index  smallint,           -- NULL = timed out; 0 = correct; 1-3 = distractor slot
  time_taken    integer,            -- seconds elapsed when the player answered
  -- Generated: true iff answer_index = 0 (chose the correct definition)
  correct       boolean  not null generated always as
                  (answer_index is not null and answer_index = 0) stored,
  primary key (session_id, word_id),
  constraint answer_index_range check (answer_index between 0 and 3)
);

-- ============================================================
-- USER WORD STATS
-- ============================================================
-- Aggregated performance per user per word across all sessions.
-- Updated atomically inside submit_game_session().

create table if not exists public.user_word_stats (
  user_id         uuid        not null references public.users(id)  on delete cascade,
  word_id         uuid        not null references public.words(id)  on delete cascade,
  correct_count   integer     not null default 0,
  incorrect_count integer     not null default 0,
  last_seen_at    timestamptz not null default now(),
  last_correct    boolean,
  primary key (user_id, word_id)
);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

alter table public.users           enable row level security;
alter table public.words           enable row level security;
alter table public.leaderboard     enable row level security;
alter table public.game_config     enable row level security;
alter table public.game_sessions   enable row level security;
alter table public.session_words   enable row level security;
alter table public.user_word_stats enable row level security;

-- Centralised admin check used by all admin-only policies.
-- security definer + stable makes this cheap to call in policies.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- users ----
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

-- ---- words ----
create policy "words_select_authenticated"
  on public.words for select to authenticated
  using (true);

create policy "words_write_admin"
  on public.words for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());

-- ---- leaderboard ----
create policy "leaderboard_select_authenticated"
  on public.leaderboard for select to authenticated
  using (true);

-- All writes go through submit_game_session() (security definer)
create policy "leaderboard_write_via_function"
  on public.leaderboard for all to authenticated
  using (false) with check (false);

-- ---- game_config ----
create policy "game_config_select_authenticated"
  on public.game_config for select to authenticated
  using (true);

create policy "game_config_write_admin"
  on public.game_config for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());

-- ---- game_sessions ----
create policy "game_sessions_select_own_or_admin"
  on public.game_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- All writes go through submit_game_session()
create policy "game_sessions_write_via_function"
  on public.game_sessions for all to authenticated
  using (false) with check (false);

-- ---- session_words ----
create policy "session_words_select_own_or_admin"
  on public.session_words for select to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = session_id
        and (gs.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "session_words_write_via_function"
  on public.session_words for all to authenticated
  using (false) with check (false);

-- ---- user_word_stats ----
create policy "user_word_stats_select_own_or_admin"
  on public.user_word_stats for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_word_stats_write_via_function"
  on public.user_word_stats for all to authenticated
  using (false) with check (false);

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- submit_game_session
-- Single atomic function for ALL end-of-game persistence:
--   1. Inserts a game_sessions row
--   2. Bulk-inserts session_words rows
--   3. Upserts user_word_stats aggregate counters
--   4. Upserts the leaderboard personal best (never lowers a score)
-- Returns the new session UUID.
create or replace function public.submit_game_session(
  p_user_id   uuid,
  p_score     integer,
  p_max_score integer,
  p_words     jsonb,  -- [{"word_id":"<uuid>","answer_index":0,"time_taken":3}, ...]
  p_type      text    default 'global'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
  r            jsonb;
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  -- 1. Session record
  insert into public.game_sessions (user_id, score, word_count, max_score, type)
  values (p_user_id, p_score, jsonb_array_length(p_words), p_max_score, p_type)
  returning id into v_session_id;

  -- 2. Per-word results + aggregate stats (single loop, one round-trip per word)
  for r in select * from jsonb_array_elements(p_words) loop
    -- Raw session result (correct is a generated column — derived from answer_index)
    insert into public.session_words (session_id, word_id, answer_index, time_taken)
    values (
      v_session_id,
      (r->>'word_id')::uuid,
      (r->>'answer_index')::smallint,
      (r->>'time_taken')::integer
    );

    -- Aggregate counters (derive correctness from answer_index = 0)
    insert into public.user_word_stats
      (user_id, word_id, correct_count, incorrect_count, last_seen_at, last_correct)
    values (
      p_user_id,
      (r->>'word_id')::uuid,
      case when (r->>'answer_index')::smallint = 0 then 1 else 0 end,
      case when (r->>'answer_index')::smallint = 0 then 0 else 1 end,
      now(),
      coalesce((r->>'answer_index')::smallint = 0, false)
    )
    on conflict (user_id, word_id) do update set
      correct_count   = user_word_stats.correct_count
                          + case when (r->>'answer_index')::smallint = 0 then 1 else 0 end,
      incorrect_count = user_word_stats.incorrect_count
                          + case when (r->>'answer_index')::smallint = 0 then 0 else 1 end,
      last_seen_at    = now(),
      last_correct    = coalesce((r->>'answer_index')::smallint = 0, false);
  end loop;

  -- 3. Leaderboard personal best (never lower the score)
  insert into public.leaderboard (user_id, score, type)
  values (p_user_id, p_score, p_type)
  on conflict (user_id, type) do update set
    score      = greatest(leaderboard.score, excluded.score),
    created_at = case
      when excluded.score > leaderboard.score then now()
      else leaderboard.created_at
    end;

  return v_session_id;
end;
$$;

-- match_words
-- Vector cosine similarity search for AI agents.
-- Query with an embedding to find semantically related words.
-- Words without an embedding are excluded.
create or replace function public.match_words(
  query_embedding vector(1536),
  match_threshold float   default 0.5,
  match_count     integer default 10
) returns table (
  id                 uuid,
  word               text,
  correct_definition text,
  difficulty         integer,
  similarity         float
) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    w.id,
    w.word,
    w.correct_definition,
    w.difficulty,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.words w
  where w.embedding is not null
    and 1 - (w.embedding <=> query_embedding) > match_threshold
  order by w.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- get_weak_words
-- Returns words a user has answered incorrectly, ordered by failure count.
-- Powers the personalised "practice weak words" game mode.
create or replace function public.get_weak_words(
  p_user_id   uuid,
  p_limit     integer default 10,
  p_threshold integer default 1   -- min incorrect_count to qualify
) returns table (
  id                 uuid,
  word               text,
  correct_definition text,
  distractors        text[],
  difficulty         integer,
  incorrect_count    integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id != auth.uid() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    w.id,
    w.word,
    w.correct_definition,
    w.distractors,
    w.difficulty,
    uws.incorrect_count
  from public.user_word_stats uws
  join public.words w on w.id = uws.word_id
  where uws.user_id  = p_user_id
    and uws.incorrect_count >= p_threshold
  order by uws.incorrect_count desc, w.difficulty desc
  limit p_limit;
end;
$$;

grant execute on function public.submit_game_session to authenticated;
grant execute on function public.match_words         to authenticated;
grant execute on function public.get_weak_words      to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================

-- Clients subscribe to the leaderboard table directly (not the view).
-- When a row changes, the app re-queries leaderboard_ranked to get
-- the joined display data.
alter publication supabase_realtime add table public.leaderboard;

-- ============================================================
-- INDEXES
-- ============================================================

-- Leaderboard: most common query pattern (type filter + score order)
create index if not exists leaderboard_type_score_idx
  on public.leaderboard (type, score desc);

-- Words: difficulty range filter used by game config
create index if not exists words_difficulty_idx
  on public.words (difficulty);

-- Words: trigram index for fast admin panel search (ILIKE / similarity queries)
create index if not exists words_word_trgm_idx
  on public.words using gin (word gin_trgm_ops);

-- Words: HNSW approximate nearest-neighbour index for vector search.
-- Partial index — only indexes rows that already have an embedding.
-- Rebuild with: reindex index words_embedding_hnsw_idx;
create index if not exists words_embedding_hnsw_idx
  on public.words using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Sessions: per-user chronological lookup
create index if not exists game_sessions_user_idx
  on public.game_sessions (user_id, created_at desc);

-- Session words: aggregate queries across all sessions for a word
create index if not exists session_words_word_idx
  on public.session_words (word_id);

-- Word stats: surface most-missed words per user quickly
create index if not exists user_word_stats_incorrect_idx
  on public.user_word_stats (user_id, incorrect_count desc);

-- ============================================================
-- GRANTING ADMIN ACCESS
-- ============================================================
-- To make a user an admin, run:
--   update public.users set role = 'admin' where id = '<user-uuid>';
