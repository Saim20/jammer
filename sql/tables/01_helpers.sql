-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Reusable updated_at trigger (attached to any table that needs it)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Centralised admin check used by all admin-only policies.
-- security definer + stable makes this cheap to call in policies.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;
