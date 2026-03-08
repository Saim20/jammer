-- ============================================================
-- FLASHCARD SETS
-- ============================================================

-- ── Word category enum ────────────────────────────────────────────────────────
-- Derived from difficulty — category is NOT stored on words themselves.
-- difficulty 1–3  → survival     (everyday essentials)
-- difficulty 4–6  → social       (communication & interpersonal)
-- difficulty 7–8  → professional (workplace & academic)
-- difficulty 9–10 → eloquent     (advanced literary & rhetorical)

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'word_category' and n.nspname = 'public'
  ) then
    create type public.word_category as enum (
      'survival', 'social', 'professional', 'eloquent'
    );
  end if;
end
$$;

-- Pure function: maps any difficulty value to its category.
-- immutable + security definer so it can be inlined by the planner.
create or replace function public.difficulty_to_category(p_difficulty integer)
returns public.word_category language sql immutable security definer set search_path = public as $$
  select case
    when p_difficulty <= 3 then 'survival'::public.word_category
    when p_difficulty <= 6 then 'social'::public.word_category
    when p_difficulty <= 8 then 'professional'::public.word_category
    else                        'eloquent'::public.word_category
  end;
$$;

grant execute on function public.difficulty_to_category to authenticated;

-- ── Flashcard sets table ───────────────────────────────────────────────────────
-- Words are grouped into named sets within a category (e.g. "Animals", "Travel").
-- category here mirrors the difficulty band the set targets.
-- display_order controls the order sets appear within a category.

create table if not exists public.flashcard_sets (
  id            uuid                 primary key default gen_random_uuid(),
  name          text                 not null,
  description   text,
  category      public.word_category not null,
  display_order integer              not null default 0,
  created_at    timestamptz          not null default now()
);

-- ── Extend words with set membership ──────────────────────────────────────────
-- category is intentionally NOT stored on words; it is always derived from
-- difficulty via difficulty_to_category(). This prevents redundancy and
-- guarantees consistency: moving a word's difficulty automatically moves
-- it to the right category without any additional bookkeeping.
alter table public.words
  add column if not exists set_id uuid references public.flashcard_sets(id)
                                      on delete set null;

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.flashcard_sets enable row level security;

-- Anyone can read; only admins can write
create policy "flashcard_sets_select_authenticated"
  on public.flashcard_sets for select to authenticated
  using (true);

create policy "flashcard_sets_write_admin"
  on public.flashcard_sets for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Flashcard sets by category (for category page listing)
create index if not exists flashcard_sets_category_idx
  on public.flashcard_sets (category, display_order asc);
