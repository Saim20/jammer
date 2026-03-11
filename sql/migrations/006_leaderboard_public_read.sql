-- ============================================================
-- Migration 006: Allow public (anon) reads on leaderboard
-- ============================================================

-- Grant anon role read access to leaderboard and the ranked view
create policy "leaderboard_select_public"
  on public.leaderboard for select to anon
  using (true);

-- The leaderboard_ranked view references public.users — grant read on that too
-- (users_select_authenticated already covers authenticated; add anon read)
create policy "users_select_public"
  on public.users for select to anon
  using (true);
