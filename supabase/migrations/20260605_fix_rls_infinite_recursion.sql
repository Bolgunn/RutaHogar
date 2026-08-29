-- =============================================================
-- RutaHogar — Fix 42P17 infinite recursion in profiles RLS
-- =============================================================

-- 1. Función helper SECURITY DEFINER (no dispara RLS)
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 2. Eliminar policy recursiva en profiles
drop policy if exists "Profiles select staff" on public.profiles;

-- 3. Garantizar que la policy simple existe
drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own"
  on public.profiles
  for select
  using (auth.uid() = id);

-- 4. Reemplazar policy de evaluaciones con versión sin subquery a profiles
drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]))
  );
