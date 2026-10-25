from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[3]
NAME='20261025120000_hu23_document_foundation'


def test_schema_mirror_and_rollback_preserve_history_and_cleanup():
    migration=(ROOT/'supabase/migrations'/f'{NAME}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{NAME}_rollback.sql').read_text()
    schema=(ROOT/'supabase/schema.sql').read_text()
    assert migration in schema
    assert 'drop table' not in rollback.lower()
    assert "p_action not in ('cancel','fail','expire','cleanup')" in rollback
    assert 'revoke execute on function public.hu23_create' in rollback
    assert 'hu23_confirm(uuid,uuid,jsonb,jsonb) from service_role' in rollback
    assert 'grant execute on function public.hu23_lifecycle' in rollback
    assert not re.search(r'(?:update|delete from)\s+(?:public\.)?(?:evaluations|scoring_history)\b',migration,re.I)
    assert 'create or replace function public.hu13_commit' not in migration
    assert '20261025120000' > '20261023090000'  # latest HU30 inspected, without importing that branch


def test_deployment_uses_existing_backend_rewrite():
    from app.main import app
    paths=set(app.openapi()['paths'])
    assert '/tracking/documents/sessions' in paths
    assert '/tracking/documents/cleanup' in paths # T8: separate cron-secret gate.
    assert not any('/documents/' in p and 'result' in p for p in paths)


def test_private_upload_schema_and_rollback_match_canonical_contract():
    name='20261025130000_hu23_private_upload'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert "storage.allow_only_operation('object.upload')" in migration
    assert "create trigger hu23_storage_object_guard" in migration
    assert 'as restrictive for select' in migration
    assert 'drop table' not in rollback.lower() and 'delete from' not in rollback.lower()
    assert 'revoke execute' in rollback and "set public=true" not in rollback


def test_ocr_metadata_schema_is_mirrored_and_has_no_raw_payload_columns():
    name='20261025140000_hu23_azure_ocr'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert 'result_id uuid unique' in migration
    assert 'grant select on public.document_ocr_jobs to service_role' in migration
    assert 'drop table' not in rollback.lower()
    table=migration.split('create table public.document_ocr_jobs(')[1].split(');')[0]
    assert not any(name in table for name in ('signed_url','ocr_text','raw_text','analyzeResult',' jsonb'))


def test_parser_lifecycle_extension_and_rollback_preserve_candidates():
    name='20261025150000_hu23_document_parsing'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert "p.state in ('processing','ocr_ready')" in migration
    assert "deletion_state='delete_pending'" in migration and "parse_token" in migration
    assert 'select false' in rollback and 'drop table' not in rollback.lower()
    assert not re.search(r'(?:update|delete from)\s+(?:public\.)?(?:evaluations|scoring_history|tracking_events)\b',migration,re.I)


def test_explicit_review_schema_rollback_and_unresolved_decision_contract():
    name='20261025160000_hu23_explicit_review'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert "and detection='detected' and comparison in ('match','difference')" in migration
    assert 'jsonb_array_length(decisions) = 0' not in migration
    assert 'select false' in rollback and 'drop table' not in rollback.lower()


def test_explicit_score_reuses_hu13_and_retains_history_on_rollback():
    name='20261025170000_hu23_explicit_score'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert 'result:=hu13_commit' in migration
    assert 'create or replace function public.hu13_commit' not in migration
    assert 'unique(user_id,revision,validation_token)' in migration
    assert 'select false' in rollback and 'drop table' not in rollback.lower()


def test_backing_projection_is_private_readonly_and_rollback_keeps_evidence():
    name='20261025180000_hu23_backing_projection'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert 'distinct on(e.field)' in migration
    assert 'order by e.field,e.confirmed_at desc,e.process_id desc' in migration
    assert not re.search(r'\b(insert into|update public\.|delete from|create policy|grant select)\b',migration,re.I)
    assert 'revoke execute' in rollback and 'drop table' not in rollback.lower()


def test_cleanup_scheduler_schema_and_non_destructive_rollback():
    import json
    name='20261025190000_hu23_periodic_cleanup'
    migration=(ROOT/'supabase/migrations'/f'{name}.sql').read_text()
    rollback=(ROOT/'supabase/rollback'/f'{name}_rollback.sql').read_text()
    assert migration in (ROOT/'supabase/schema.sql').read_text()
    assert 'for update skip locked' in migration
    assert 'enable row level security' in migration
    assert 'delete from storage.objects' not in migration.lower()
    assert 'delete from document_field_evidence' not in migration.lower()
    assert 'delete from evaluations' not in migration.lower()
    assert 'set enabled=false' in rollback
    assert not any(word in rollback.lower() for word in ('drop table','delete from'))
    config=json.loads((ROOT/'vercel.json').read_text())
    assert not any(job['path']=='/tracking/documents/cleanup' for job in config['crons'])
    workflow=(ROOT/'.github/workflows/hu23-document-cleanup.yml').read_text()
    assert '17 * * * *' in workflow and 'workflow_dispatch:' in workflow
    assert 'cancel-in-progress: false' in workflow
    assert 'run-hu23-cleanup.py' in workflow
    assert {'path':'/lead-changes/daily-digest','schedule':'0 12 * * *'} in config['crons']
