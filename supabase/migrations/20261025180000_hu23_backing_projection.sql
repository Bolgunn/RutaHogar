-- HU23 T7. Private read port for E4. No table/Storage permission changes.
begin;
create function public.hu23_backing_evidence(p_subject uuid,p_owner boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_owner then
   perform hu23_require_owner(p_subject);
 elsif not exists(select 1 from profiles where id=p_subject) then raise exception 'not_found';
 end if;
 -- p_owner=false is exclusively a backend call AFTER existing commercial authorization.
 return coalesce((
   select jsonb_agg(jsonb_build_object('field',x.field,'backing_at_confirmation',x.backing_at_confirmation,
     'confirmed_at',x.confirmed_at,'source_event_id',x.source_event_id) order by x.field)
   from (
     select distinct on(e.field) e.field,e.backing_at_confirmation,e.confirmed_at,e.source_event_id
     from document_field_evidence e join document_processes p on p.id=e.process_id and p.user_id=e.user_id
     where e.user_id=p_subject and p.state='confirmed'
     order by e.field,e.confirmed_at desc,e.process_id desc
   ) x
 ),'[]'::jsonb);
end;
$$;
revoke all on function public.hu23_backing_evidence(uuid,boolean) from public,anon,authenticated;
grant execute on function public.hu23_backing_evidence(uuid,boolean) to service_role;
commit;
