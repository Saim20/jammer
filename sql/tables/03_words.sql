-- ============================================================
-- WORDS
-- ============================================================

create table if not exists public.words (
  id                 uuid        primary key default gen_random_uuid(),
  word               text        not null,
  correct_definition text        not null,
  distractors        text[]      not null default '{}',
  example_sentences  text[]      not null default '{}',
  difficulty         integer     not null check (difficulty between 1 and 10),
  -- AI / vector search support.
  -- Populate via scripts/seed-supabase.mjs using Google Gemini gemini-embedding-001
  -- with outputDimensionality=1536 and taskType=RETRIEVAL_DOCUMENT (L2-normalised).
  -- Use taskType=RETRIEVAL_QUERY when building the query vector for match_words().
  -- NULL until embedding is generated; match_words() skips NULL rows.
  embedding          vector(1536),
  -- Flashcard set membership (FK to flashcard_sets; added in 08_flashcard_sets.sql)
  -- set_id is defined here as a nullable FK, populated after flashcard_sets exists.
  set_id             uuid,       -- FK added via ALTER in 08_flashcard_sets.sql
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint words_word_unique unique (word),
  constraint distractors_count check (cardinality(distractors) = 3),
  constraint example_sentences_count check (cardinality(example_sentences) <= 3)
);

create trigger words_updated_at
  before update on public.words
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.words enable row level security;

create policy "words_select_authenticated"
  on public.words for select to authenticated
  using (true);

create policy "words_write_admin"
  on public.words for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Difficulty range filter used by game config
create index if not exists words_difficulty_idx
  on public.words (difficulty);

-- Trigram index for fast admin panel search (ILIKE / similarity queries)
create index if not exists words_word_trgm_idx
  on public.words using gin (word gin_trgm_ops);

-- HNSW approximate nearest-neighbour index for vector search.
-- Partial index — only indexes rows that already have an embedding.
-- Rebuild with: reindex index words_embedding_hnsw_idx;
create index if not exists words_embedding_hnsw_idx
  on public.words using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Word filtering by set (FK populated after 08_flashcard_sets.sql runs)
create index if not exists words_set_idx
  on public.words (set_id);

-- Difficulty range filter (flashcard system)
create index if not exists words_difficulty_range_idx
  on public.words (difficulty)
  where difficulty is not null;
