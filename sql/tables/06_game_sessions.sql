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
  mode       text        not null default 'vocabulary'
               check (mode in ('vocabulary', 'sentence_blank', 'sentence_match')),
  created_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.game_sessions enable row level security;

create policy "game_sessions_select_own_or_admin"
  on public.game_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- All writes go through submit_game_session()
create policy "game_sessions_write_via_function"
  on public.game_sessions for all to authenticated
  using (false) with check (false);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Per-user chronological lookup
create index if not exists game_sessions_user_idx
  on public.game_sessions (user_id, created_at desc);

-- ============================================================
-- SESSION WORDS
-- ============================================================
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

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.session_words enable row level security;

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

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Aggregate queries across all sessions for a word
create index if not exists session_words_word_idx
  on public.session_words (word_id);
