do $$
begin
  if to_regclass('public.lead_status_history') is null then
    return;
  end if;

  drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
  create policy "Staff select lead_status_history"
    on public.lead_status_history
    for select
    using (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]));

  revoke select on table public.lead_status_history from authenticated;
end
$$;
