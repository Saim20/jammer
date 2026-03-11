-- ============================================================
-- Migration 003: Add plan column to users + admin update policy
-- ============================================================

-- 1. Add the plan column (no-op if re-run)
alter table public.users
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'student', 'pro'));

-- 2. Replace the self-update policy to also prevent plan escalation by the user
drop policy if exists "users_update_own_profile" on public.users;

create policy "users_update_own_profile"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- user cannot elevate their own role
    and role = (select role from public.users where id = auth.uid())
    -- user cannot change their own plan
    and plan = (select plan from public.users where id = auth.uid())
  );

-- 3. Admin policy — allows admins to update any user's plan and role
-- (permissive WITH CHECK uses OR semantics — admin bypass covers their own row too)
drop policy if exists "users_update_admin" on public.users;

create policy "users_update_admin"
  on public.users for update to authenticated
  using  (public.is_admin())
  with check (public.is_admin());
