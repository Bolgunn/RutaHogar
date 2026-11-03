select public.hu22_record_export('{"id":"66666666-6666-4666-8666-666666666666","actor_id":"11111111-1111-4111-8111-111111111111","actor_role":"ejecutivo","inmobiliaria_id":"22222222-2222-4222-8222-222222222222","kind":"leads","format":"xlsx","blocks":["profile"],"evaluation_ids":[],"filters":{},"generated_at":"2026-10-29T12:00:00Z","status":"prepared"}'::jsonb);
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin
 if (select count(*) from public.export_events)<>1 then raise exception 'Own history missing'; end if;
 begin perform public.hu22_export_rows('{}'::uuid[],'{}'::uuid[]); raise exception 'Private read RPC exposed'; exception when insufficient_privilege then null; end;
 begin perform public.hu22_export_delivery('66666666-6666-4666-8666-666666666666',repeat('a',64)); raise exception 'Private delivery RPC exposed'; exception when insufficient_privilege then null; end;
 begin delete from public.export_events; raise exception 'Audit delete exposed'; exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',false);
do $$begin if (select count(*) from public.export_events)<>0 then raise exception 'Other executive history exposed'; end if; end$$;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
do $$begin if (select count(*) from public.export_events)<>1 then raise exception 'Tenant admin missing history'; end if; end$$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$begin if (select count(*) from public.export_events)<>0 then raise exception 'Cross tenant history exposed'; end if; end$$;
reset role;
set role service_role;
do $$begin
 if jsonb_array_length(public.hu22_export_rows(array['44444444-4444-4444-8444-444444444444']::uuid[],array['33333333-3333-4333-8333-333333333333']::uuid[]))<>1 then raise exception 'Authorized batch read failed'; end if;
 if jsonb_array_length(public.hu22_export_rows(array['44444444-4444-4444-8444-444444444444']::uuid[],array['88888888-8888-4888-8888-888888888888']::uuid[]))<>0 then raise exception 'Cross project data exposed'; end if;
 perform public.hu22_export_delivery('66666666-6666-4666-8666-666666666666',repeat('a',64));
 begin
   perform public.hu22_export_delivery('66666666-6666-4666-8666-666666666666',repeat('b',64));
   raise exception 'Hash mismatch accepted';
 exception when raise_exception then
   if sqlerrm <> 'idempotency_conflict' then raise; end if;
 end;
 if not exists(select 1 from public.export_events where status='delivery_requested') then raise exception 'Delivery not recorded'; end if;
end$$;
reset role;
