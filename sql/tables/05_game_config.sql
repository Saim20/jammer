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

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.game_config enable row level security;

create policy "game_config_select_authenticated"
  on public.game_config for select to authenticated
  using (true);

create policy "game_config_write_admin"
  on public.game_config for all to authenticated
  using   (public.is_admin())
  with check (public.is_admin());
