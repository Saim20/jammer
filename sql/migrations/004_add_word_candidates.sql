-- ============================================================
-- Migration 004: word_candidates table
-- Stores AI-generated word suggestions pending admin review.
-- ============================================================

create table if not exists public.word_candidates (
  id                uuid        primary key default gen_random_uuid(),
  word              text        not null,
  correct_definition text       not null,
  distractors       text[]      not null default '{}',
  example_sentences text[]      not null default '{}',
  difficulty        integer     not null check (difficulty between 1 and 10),
  embedding         vector(1536),
  status            text        not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  ai_model          text,
  review_notes      text,
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid        references public.users(id) on delete set null,
  constraint word_candidates_word_unique unique (word),
  constraint word_candidates_distractors_count check (cardinality(distractors) <= 3),
  constraint word_candidates_sentences_count   check (cardinality(example_sentences) <= 3)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.word_candidates enable row level security;

-- Only admins can view or manage candidates
create policy "word_candidates_admin_all"
  on public.word_candidates for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists word_candidates_status_idx
  on public.word_candidates (status, created_at desc);

create index if not exists word_candidates_embedding_hnsw_idx
  on public.word_candidates using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
