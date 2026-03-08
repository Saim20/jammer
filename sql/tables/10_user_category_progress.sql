-- ============================================================
-- USER CATEGORY PROGRESS
-- ============================================================
-- Aggregated learning progress per (user, category).
-- words_seen     — unique words encountered at least once in flashcard sessions
-- words_mastered — words with repetitions >= 3 (recomputed on each upsert
--                  inside submit_flashcard_review)

create table if not exists public.user_category_progress (
  user_id         uuid                 not null references public.users(id) on delete cascade,
  category        public.word_category not null,
  words_seen      integer              not null default 0,
  words_mastered  integer              not null default 0,
  last_studied_at timestamptz,
  primary key (user_id, category)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.user_category_progress enable row level security;

create policy "user_category_progress_select_own"
  on public.user_category_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_category_progress_write_via_function"
  on public.user_category_progress for all to authenticated
  using (false) with check (false);
