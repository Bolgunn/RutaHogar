#!/usr/bin/env python3
"""Run HU23/HU13 persistence tests on a new local-only PostgreSQL cluster.
No URL, remote host or production credentials are accepted. Requires PostgreSQL
binaries and the backend test environment. Example:
  python scripts/test-hu23-persistence.py --pg-bin /usr/lib/postgresql/16/bin
"""
import argparse
import getpass
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', type=Path, default=Path(shutil.which('initdb') or '/usr/lib/postgresql/16/bin/initdb').parent)
parser.add_argument('--share-dir', type=Path, help='Only needed for PostgreSQL binaries unpacked in /tmp')
args = parser.parse_args()
pg = args.pg_bin.resolve()
for executable in ('initdb','pg_ctl','psql'):
    if not (pg/executable).is_file():
        parser.error(f'local PostgreSQL executable missing: {pg/executable}')

with tempfile.TemporaryDirectory(prefix='hu23-sql-') as scratch:
    scratch = Path(scratch)
    data = scratch/'data'
    env = {**os.environ, 'GROQ_API_KEY':'', 'HU23_TEST_PSQL':str(pg/'psql'),
           'HU23_TEST_SOCKET':str(scratch), 'HU23_TEST_PORT':'55423', 'HU23_TEST_USER':getpass.getuser()}
    init = [str(pg/'initdb'),'-D',str(data),'--no-locale','--encoding=UTF8','-A','trust']
    if args.share_dir:
        init += ['-L',str(args.share_dir.resolve())]
    subprocess.run(init,check=True,stdout=subprocess.DEVNULL,env=env)
    started = False
    def run_sql(*, file=None, statement=None, capture=False):
        cmd = [str(pg/'psql'),'-X','-qAt','-h',str(scratch),'-p','55423','-U',getpass.getuser(),
               '-d','postgres','-v','ON_ERROR_STOP=1']
        cmd += ['-f',str(file)] if file else ['-c',statement]
        result = subprocess.run(cmd,check=True,env=env,capture_output=True,text=True)
        return result.stdout.strip() if capture else None
    try:
        subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(scratch/'postgres.log'),'-w',
                        '-o',f"-k {shlex.quote(str(scratch))} -p 55423 -c listen_addresses=''",'start'],
                       check=True,stdout=subprocess.DEVNULL,env=env)
        started = True
        run_sql(file=ROOT/'supabase/tests/hu13_bootstrap.sql')
        # The canonical schema defines some unrelated commercial functions before
        # their catalogue dependencies and requires pgvector later. Use its real
        # base tables/roles, then the real HU13 migrations; no financial stubs.
        schema = (ROOT/'supabase/schema.sql').read_text()
        base = schema[:schema.index('drop policy if exists "Profiles select own"')]
        base = base.replace('create extension if not exists pgcrypto;', '-- UUID built into PostgreSQL 16 in this fixture.')
        base_file = scratch/'base.sql'
        base_file.write_text(base)
        run_sql(file=base_file)
        run_sql(file=ROOT/'supabase/tests/hu23_storage_bootstrap.sql')
        for filename in ('20260920190000_hu13_immutable_tracking.sql',
                         '20260921090000_hu13_target_project_jsonb_null.sql',
                         '20261025120000_hu23_document_foundation.sql',
                         '20261025130000_hu23_private_upload.sql',
                         '20261025140000_hu23_azure_ocr.sql',
                         '20261025150000_hu23_document_parsing.sql',
                         '20261025160000_hu23_explicit_review.sql',
                         '20261025170000_hu23_explicit_score.sql',
                         '20261025180000_hu23_backing_projection.sql',
                         '20261025190000_hu23_periodic_cleanup.sql'):
            run_sql(file=ROOT/'supabase/migrations'/filename)
        run_sql(file=ROOT/'supabase/tests/hu13_tracking.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_documents.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_storage.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_ocr.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_parsing.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_score.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_backing.sql')
        run_sql(file=ROOT/'supabase/tests/hu23_cleanup.sql')
        subprocess.run([sys.executable,'-m','pytest','backend/tests/documents','-q'],
                       cwd=ROOT,env=env,check=True)
        def fingerprint():
            return run_sql(statement="""select jsonb_build_object(
              'processes',(select jsonb_agg(to_jsonb(p) order by id) from document_processes p),
              'candidates',(select jsonb_agg(to_jsonb(c) order by process_id,field) from document_candidates c),
              'evidence',(select jsonb_agg(to_jsonb(e) order by process_id,field) from document_field_evidence e),
              'events',(select jsonb_agg(to_jsonb(t) order by event_id) from tracking_events t),
              'evaluations',(select jsonb_agg(to_jsonb(e) order by id) from evaluations e),
              'score_requests',(select jsonb_agg(to_jsonb(r) order by user_id,request_id) from document_score_requests r),
              'uploads',(select jsonb_agg(to_jsonb(u)-'upload_expires_at' order by process_id) from document_uploads u),
              'ocr_jobs',(select jsonb_agg(to_jsonb(j) order by process_id) from document_ocr_jobs j),
              'history',(select jsonb_agg(to_jsonb(h) order by id) from scoring_history h));""",capture=True)
        # T2 rollback intentionally revokes unadmitted upload leases. Facts and
        # locators above exclude that operational expiry; T8 must preserve it too.
        uploads_before = run_sql(statement="select jsonb_agg(to_jsonb(u) order by process_id) from document_uploads u;",capture=True)
        before = fingerprint()
        run_sql(file=ROOT/'supabase/rollback/20261025190000_hu23_periodic_cleanup_rollback.sql')
        assert before == fingerprint(), 'T8 rollback modified retained facts or deletion duties'
        assert uploads_before == run_sql(statement="select jsonb_agg(to_jsonb(u) order by process_id) from document_uploads u;",capture=True), 'T8 rollback modified upload locators/leases'
        run_sql(statement="""do $$ begin
          if not (hu23_cleanup('begin')->>'busy')::boolean then raise exception 'T8 rollback permits new runs'; end if;
          end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025180000_hu23_backing_projection_rollback.sql')
        assert before == fingerprint(), 'T7 rollback modified evidence or evaluations'
        run_sql(statement="""do $$ begin
          if has_function_privilege('service_role','hu23_backing_evidence(uuid,boolean)','EXECUTE') then
            raise exception 'T7 rollback did not disable E4 read port'; end if;
        end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025170000_hu23_explicit_score_rollback.sql')
        assert before == fingerprint(), 'T6 rollback modified evaluations or pending score intents'
        run_sql(statement="""do $$ declare j document_score_requests; r jsonb; begin
          if hu23_score_enabled() then raise exception 'T6 rollback left scoring enabled'; end if;
          select * into j from document_score_requests where completed_at is not null limit 1;
          if not found then raise exception 'missing T6 completed replay fixture'; end if;
          r:=hu23_score_intent(j.user_id,'find',jsonb_build_object('request_id',j.request_id,
            'expected_revision',j.revision,'validation_token',j.validation_token));
          if r->>'completed_at' is null then raise exception 'T6 rollback disabled completed replay'; end if;
          select * into j from document_score_requests where completed_at is null limit 1;
          begin
            perform hu23_score_intent(j.user_id,'prepare',jsonb_build_object('request_id',j.request_id,
              'expected_revision',j.revision,'validation_token',j.validation_token));
            raise exception 'T6 rollback permits scoring preparation';
          exception when raise_exception then if sqlerrm<>'score_update_disabled' then raise; end if; end;
        end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025160000_hu23_explicit_review_rollback.sql')
        assert before == fingerprint(), 'T5 rollback modified confirmed evidence or financial facts'
        run_sql(statement="""do $$ declare p document_processes; begin
          if hu23_confirmation_enabled() then raise exception 'T5 rollback left confirmation enabled'; end if;
          select * into p from document_processes where state='awaiting_review' limit 1;
          if not found then raise exception 'missing T5 rollback fixture'; end if;
          begin
            perform hu23_confirm(p.user_id,p.id,'{}',null);
            raise exception 'T5 rollback permits new confirmation';
          exception when raise_exception then if sqlerrm<>'confirmation_disabled' then raise; end if; end;
          select * into p from document_processes where state='confirmed' limit 1;
          perform hu23_confirm(p.user_id,p.id,p.confirm_request,null);
        end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025150000_hu23_document_parsing_rollback.sql')
        assert before == fingerprint(), 'T4 rollback modified candidates, OCR metadata or financial facts'
        run_sql(statement="""do $$ declare p document_processes; begin
          if hu23_parsing_enabled() then raise exception 'T4 rollback did not disable parsing'; end if;
          select * into p from document_processes where state='ocr_ready' limit 1;
          if not found then raise exception 'missing OCR-ready rollback fixture'; end if;
          begin
            perform hu23_parse_control(p.user_id,p.id,'claim');
            raise exception 'rollback permits new parsing';
          exception when raise_exception then if sqlerrm<>'parsing_disabled' then raise; end if; end;
        end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025140000_hu23_azure_ocr_rollback.sql')
        assert before == fingerprint(), 'T3 rollback modified OCR metadata or financial facts'
        run_sql(statement="""do $$ begin
          if not exists(select 1 from pg_trigger where tgname='hu23_ocr_disabled') then
            raise exception 'T3 rollback did not disable submissions'; end if;
        end $$;""")
        run_sql(statement="""begin;
          do $$ declare p document_processes; j document_ocr_jobs; r jsonb; begin
            select d.* into p from document_processes d join document_uploads u on u.process_id=d.id
              join storage.objects o on o.id=u.storage_object_id where d.state='ready' limit 1;
            if not found then raise exception 'missing T3 rollback start fixture'; end if;
            begin
              perform hu23_ocr_step(p.user_id,p.id,'start');
              raise exception 'T3 rollback permits new submit';
            exception when raise_exception then if sqlerrm<>'hu23_disabled' then raise; end if; end;
            select * into j from document_ocr_jobs where deletion_state='retry_required' and result_id is not null limit 1;
            if not found then raise exception 'missing T3 cleanup fixture'; end if;
            update document_ocr_jobs set next_attempt_at=now()-interval '1 second' where process_id=j.process_id;
            r:=hu23_ocr_step(j.user_id,j.process_id,'cleanup');
            if r->>'action'<>'delete' then raise exception 'T3 rollback disabled cleanup claim'; end if;
            r:=hu23_ocr_step(j.user_id,j.process_id,'settle',(r->'job'->>'lease_token')::uuid,'{"outcome":"deleted"}');
            if r->'job'->>'deletion_state'<>'deleted' then raise exception 'T3 rollback disabled cleanup acknowledgement'; end if;
          end $$; rollback;""")
        assert before == fingerprint(), 'rollback validation modified retained facts'
        run_sql(file=ROOT/'supabase/rollback/20261025130000_hu23_private_upload_rollback.sql')
        assert before == fingerprint(), 'T2 rollback modified financial facts or evidence'
        run_sql(statement="""do $$ begin
          if has_function_privilege('service_role','hu23_upload_authorize(uuid,uuid,jsonb)','execute') then
            raise exception 'upload authorization still enabled after T2 rollback'; end if;
          if (select public from storage.buckets where id='hu23-document-temporary') then
            raise exception 'rollback made bucket public'; end if; end $$;""")
        run_sql(file=ROOT/'supabase/rollback/20261025120000_hu23_document_foundation_rollback.sql')
        assert before == fingerprint(), 'rollback modified stored facts or evidence'
        run_sql(statement="""do $$ begin
          if has_function_privilege('service_role','hu23_create(uuid,uuid,text,timestamptz)','execute')
             or has_function_privilege('service_role','hu23_confirm(uuid,uuid,jsonb,jsonb)','execute') then
            raise exception 'writes still enabled after rollback'; end if;
          if not has_function_privilege('service_role','hu23_lifecycle(uuid,uuid,integer,text,jsonb)','execute') then
            raise exception 'cleanup disabled by rollback'; end if;
          end $$;""")
        run_sql(statement="""begin; set local role service_role;
          do $$ declare p document_processes; r jsonb; begin
            select * into p from document_processes where deletion_state='delete_pending' limit 1;
            if not found then raise exception 'missing rollback fixture'; end if;
            begin
              perform hu23_create(p.user_id,gen_random_uuid(),p.document_type,now()+interval '1 hour');
              raise exception 'rollback still permits creation';
            exception when insufficient_privilege then null; end;
            begin
              perform hu23_lifecycle(p.user_id,p.id,p.revision,'start','{}');
              raise exception 'rollback still permits processing';
            exception when raise_exception then if sqlerrm <> 'hu23_disabled' then raise; end if; end;
            r := hu23_lifecycle(p.user_id,p.id,p.revision,'cleanup','{"deletion_state":"deleting"}');
            -- Fixture simulates deletion through the authorized Storage API.
            delete from storage.objects where bucket_id='hu23-document-temporary'
              and name in(select storage_path from document_uploads where process_id=p.id);
            r := hu23_lifecycle(p.user_id,p.id,(r->'process'->>'revision')::integer,'cleanup','{"deletion_state":"deleted"}');
            if r->'process'->>'deletion_state' <> 'deleted' then raise exception 'rollback disabled cleanup'; end if;
          end $$; rollback;""")
        print('HU13 SQL, HU23 grants/RLS/atomicity and non-destructive rollback: PASS (local disposable cluster).')
    finally:
        if started:
            subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],
                           env=env,check=True,stdout=subprocess.DEVNULL)
