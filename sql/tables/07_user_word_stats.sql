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

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.user_word_stats enable row level security;

create policy "user_word_stats_select_own_or_admin"
  on public.user_word_stats for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_word_stats_write_via_function"
  on public.user_word_stats for all to authenticated
  using (false) with check (false);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Surface most-missed words per user quickly
create index if not exists user_word_stats_incorrect_idx
  on public.user_word_stats (user_id, incorrect_count desc);
