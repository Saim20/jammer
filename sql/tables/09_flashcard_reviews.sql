-- ============================================================
-- FLASHCARD REVIEWS  (SM-2 spaced repetition)
-- ============================================================
-- One row per (user, word) — tracks review schedule and performance.
--
-- SM-2 fields:
--   ease_factor    — how easy the card is (starts at 2.5, min 1.3)
--   interval_days  — current review interval in days
--   next_review_at — when the card is next due
--   repetitions    — consecutive successful reviews (resets on fail)
--   last_quality   — 0–5 rating from the most recent review (0–2 = fail, 3–5 = pass)

create table if not exists public.flashcard_reviews (
  user_id          uuid        not null references public.users(id)  on delete cascade,
  word_id          uuid        not null references public.words(id)  on delete cascade,
  ease_factor      float       not null default 2.5,
  interval_days    integer     not null default 1,
  next_review_at   timestamptz not null default now(),
  repetitions      integer     not null default 0,
  last_quality     integer              check (last_quality between 0 and 5),
  last_reviewed_at timestamptz,
  primary key (user_id, word_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.flashcard_reviews enable row level security;

-- Users can read their own rows; writes go through the RPC
create policy "flashcard_reviews_select_own"
  on public.flashcard_reviews for select to authenticated
  using (user_id = auth.uid());

create policy "flashcard_reviews_write_via_function"
  on public.flashcard_reviews for all to authenticated
  using (false) with check (false);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Due-review lookup: (user, schedule) — the most common flashcard query
create index if not exists flashcard_reviews_due_idx
  on public.flashcard_reviews (user_id, next_review_at asc);
