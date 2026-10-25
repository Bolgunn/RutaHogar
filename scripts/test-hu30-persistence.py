#!/usr/bin/env python3
"""HU30 SQL integration in a NEW disposable PostgreSQL container, never remote.

Requires Docker and the already available postgres:16-alpine image. No ports or
volumes are published. Removes only the uniquely named container it creates.
The core-schema fixture explicitly accommodates existing bootstrap defects;
this is not validation of the complete historical migration chain or pgvector.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
NAME = 'rutahogar-hu30-test-' + uuid4().hex[:10]


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], text=True, capture_output=True, **kwargs)


def sql(source, *, check=True):
    result = docker('exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', input=source)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result


def main():
    docker('image', 'inspect', 'postgres:16-alpine', check=True)
    docker('run', '-d', '--name', NAME, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', check=True)
    try:
        for _ in range(30):
            if docker('exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('Disposable PostgreSQL did not start')
        core = (ROOT / 'supabase/schema.sql').read_text().split('-- HU30 T3 — accumulated persistence and authorization state')[0]
        # Existing baseline: SQL functions appear before referenced tables;
        # RAG needs pgvector; a legacy trigger references a missing housing_plan.
        start = core.index('create extension if not exists vector;')
        end = core.index('-- HU18', start)
        core = core[:start] + core[end:]
        marker = 'DROP TRIGGER IF EXISTS trg_check_housing_plan_progress'
        core = core.replace(marker, 'alter table public.evaluations add column if not exists housing_plan jsonb;\n' + marker)
        bootstrap = (ROOT / 'supabase/tests/hu13_bootstrap.sql').read_text()
        sql(bootstrap + '\nalter table auth.users add column email_confirmed_at timestamptz;\n'
            'set check_function_bodies=off;\n' + core + '\nset check_function_bodies=on;')
        sql((ROOT / 'supabase/tests/hu30_legacy_seed.sql').read_text())
        migrations = sorted((ROOT / 'supabase/migrations').glob('2026102*hu30*.sql'))
        for migration in migrations:
            if migration.name == '20261022090000_hu30_legacy_snapshot_guard.sql':
                assert sql("select public.hu30_has_complement('{\"input\":{\"complemento_renta\":false,\"complemento_ingreso_mensual\":1500000}}');").stdout.strip() == 'f'
                print('PASS: T6 preflight reproduced the legacy alias RLS bypass')
            if migration.name == '20261023090000_hu30_staff_contact_isolation.sql':
                sql((ROOT / 'supabase/tests/hu30_staff_contact_preflight.sql').read_text())
                print('PASS: T9B preflight reproduced contact/history/admin report bypasses')
            sql(migration.read_text())
        print('PASS: incremental migrations over legacy HU18 core fixture')
        # Keep this run's fixtures only inside the disposable container so the
        # rollback can be checked against v2 evidence, not just legacy rows.
        tests = (ROOT / 'supabase/tests/hu30_persistence.sql').read_text()
        sql(tests.rsplit('rollback;', 1)[0] + 'commit;')
        print('PASS: SQL assertions (legacy, identity, revisions, closure, RLS, roles)')
        sql((ROOT / 'supabase/tests/hu30_safe_projections.sql').read_text())
        print('PASS: T6 direct RLS legacy aliases, partial snapshots and service-only raw access')
        sql((ROOT / 'supabase/tests/hu30_staff_contact_isolation.sql').read_text())
        print('PASS: T9B contact/history isolation and admin report financial redaction')
        access_tests = (ROOT / 'supabase/tests/hu30_authenticated_access.sql').read_text()
        sql(access_tests.rsplit('rollback;', 1)[0] + 'commit;')
        print('PASS: T4A account linking, identity, state revalidation and no financial revision')
        sql((ROOT / 'supabase/tests/hu30_authenticated_confirmation.sql').read_text())
        print('PASS: T4B scoped review, relation, consent, revisions, idempotency, isolation, no evaluation')

        setup = sql("""
        select invitation_id from public.hu18_create_invitation(
          'a3000000-0000-0000-0000-000000000001','participant@hu30.invalid','12345678-5',
          'concurrent',clock_timestamp()+interval '7 days');
        """).stdout.strip().splitlines()[-1]
        sql("select public.hu30_authorize_invitation('concurrent','a3000000-0000-0000-0000-000000000002');")
        relation = sql(f"select public.hu30_declare_relation('{setup}','a3000000-0000-0000-0000-000000000001','conyuge',0);").stdout.strip()
        def race(delay):
            # Same expected version, independent requests and DB transactions.
            return sql(f"""begin;
              select 1 from public.profiles where id='a3000000-0000-0000-0000-000000000001' for update;
              select pg_sleep({delay});
              select public.hu30_confirm_participation('{setup}',
                'a3000000-0000-0000-0000-000000000002','{uuid4()}',0,'{relation}',true,
                '{{"ingreso_mensual_complementario":1500000,"deuda_mensual_complementario":0,
                  "tipo_contrato_complementario":"indefinido","continuidad_laboral_complementario":"mas_3_anios",
                  "morosidad_complementario":"no"}}',true);
              commit;""", check=False)
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(race, [0.3, 0]))
        assert sum(r.returncode == 0 for r in results) == 1, [r.stderr for r in results]
        assert any('co_debtor_revision_conflict' in r.stderr for r in results)
        assert sql(f"select count(*) from public.co_debtor_confirmations where invitation_id='{setup}';").stdout.strip() == '1'
        print('PASS: concurrent requests serialize; exactly one creates revision 1')
        # T5: real HU13 commits over the authenticated revision selected above.
        # Financial formulas are tested in Python; these fixtures test the DB contract.
        import json
        owner = 'a3000000-0000-0000-0000-000000000001'
        actor = 'a3000000-0000-0000-0000-000000000002'
        confirmed = json.loads(sql(f"select to_jsonb(c) from public.co_debtor_confirmations c where invitation_id='{setup}';").stdout)
        fields = ('ingreso_mensual_complementario', 'deuda_mensual_complementario',
                  'tipo_contrato_complementario', 'continuidad_laboral_complementario', 'morosidad_complementario')
        values = {name: confirmed[name] for name in fields}
        provenance = {'co_debtor_confirmation_id': confirmed['id'], 'co_debtor_consent': {
            'complement_source': 'co_debtor_confirmed', 'revision_number': 1, 'relation_declaration_event_id': relation}}
        snapshot = {**values, 'complemento_renta': True, 'relacion_complementario': 'conyuge'}
        def records(previous=None):
            event, evaluation = str(uuid4()), str(uuid4())
            details = provenance if previous else {}
            state = snapshot if previous else {'complemento_renta': False}
            plan_id = str(uuid4())
            return {'event_id': event}, {
                'plan': None if previous else {'id': plan_id, 'baseline_evaluation_id': evaluation,
                    'root_event_id': event, 'baseline_at': '2026-10-21T00:00:00Z',
                    'original_plan_snapshot': {}, 'target_project_snapshot': None, 'provenance': {}},
                'goals': [], 'result': {'event_id': event, 'evaluation_ids': [evaluation]},
                'evaluations': [{'id': evaluation, 'snapshot': state, 'provenance': details,
                    'result': {'score': 75, 'classification': 'Alto', 'algorithm_version': '1.1.0', 'component_scores': {}}}],
                'events': [{'event_id': event, 'event_kind': 'evaluation' if previous else 'baseline',
                    'effective_at': '2026-10-21T00:00:00Z', 'reason': 'confirmacion_codeudor' if previous else 'baseline',
                    'patch': {}, 'previous': previous, 'recorded_complete_snapshot': state,
                    'evaluation_id': evaluation, 'algorithm_version': 'hu13-lineage-v1', 'provenance': details}]}
        def literal(value):
            return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
        def commit_sql(command, record, previous=None):
            expected = f"'{previous}'::uuid" if previous else 'null::uuid'
            return f"select public.hu13_commit('{owner}',{literal(command)},{expected},{literal(record)});"
        baseline_command, baseline_records = records()
        sql(commit_sql(baseline_command, baseline_records))
        previous = baseline_command['event_id']
        baseline_eval = baseline_records['evaluations'][0]['id']
        baseline_before = sql(f"select financial_data from public.evaluations where id='{baseline_eval}';").stdout
        candidate, prepared = records(previous)
        prepared_eval = prepared['evaluations'][0]['id']
        def must_reject(change, expected):
            failed = sql('begin;\n' + change + '\n' + commit_sql(candidate, prepared, previous) + '\ncommit;', check=False)
            assert failed.returncode != 0 and expected in failed.stderr, failed.stderr
            assert sql(f"select count(*) from public.evaluations where id='{prepared_eval}';").stdout.strip() == '0'
        must_reject(f"select public.hu30_declare_relation('{setup}','{owner}','padre_madre',1);", 'co_debtor_revision_conflict')
        must_reject(f"select public.hu30_confirm_participation('{setup}','{actor}','{uuid4()}',1,'{relation}',false,{literal(values)},true);", 'co_debtor_revision_conflict')
        must_reject(f"select public.hu30_participant_decision('{setup}','{actor}','revoke');", 'co_debtor_revision_conflict')
        must_reject(f"select public.hu18_create_invitation('{owner}','another@hu30.invalid','12345678-5','t5-replacement',clock_timestamp()+interval '7 days');", 'co_debtor_revision_conflict')
        assert sql(f"select financial_data from public.evaluations where id='{baseline_eval}';").stdout == baseline_before
        print('PASS: T5 commit rejects changed revision/relation, revoked or replaced participation atomically')
        commands = [records(previous), records(previous)]
        with ThreadPoolExecutor(2) as pool:
            outcomes = list(pool.map(lambda pair: sql(commit_sql(*pair, previous), check=False), commands))
        assert sum(row.returncode == 0 for row in outcomes) == 1, [row.stderr for row in outcomes]
        assert any('lineage_conflict' in row.stderr for row in outcomes)
        winner = next(i for i, row in enumerate(outcomes) if row.returncode == 0)
        winner_command, winner_records = commands[winner]
        assert sql(commit_sql(winner_command, winner_records, previous)).stdout == outcomes[winner].stdout
        winner_eval = winner_records['evaluations'][0]['id']
        assert sql(f"select count(*) from public.scoring_history where evaluation_id='{winner_eval}';").stdout.strip() == '1'
        assert sql(f"select financial_data from public.evaluations where id='{baseline_eval}';").stdout == baseline_before
        history_before = sql(f"select financial_data from public.evaluations where id='{winner_eval}';").stdout
        sql(f"select public.hu30_participant_decision('{setup}','{actor}','revoke');")
        assert sql(f"select financial_data from public.evaluations where id='{winner_eval}';").stdout == history_before
        print('PASS: T5 concurrent incorporation creates one evaluation/history; retry and later revocation preserve evidence')

        fingerprint = """select md5(coalesce(jsonb_agg(row order by row->>'id')::text,'')) from (
          select to_jsonb(c) row from public.co_debtor_confirmations c
          union all select to_jsonb(e) from public.co_debtor_consent_events e
          union all select to_jsonb(v) from public.evaluations v
          union all select to_jsonb(i) from public.co_debtor_invitations i) evidence;"""
        before = sql(fingerprint).stdout
        for migration in reversed(migrations):
            sql((ROOT / 'supabase/rollback' / (migration.stem + '_rollback.sql')).read_text())
        assert sql(fingerprint).stdout == before
        assert sql("select has_function_privilege('authenticated','public.list_lead_contacts(uuid[])','execute');").stdout.strip() == 'f'
        for name in ('get_reported_leads_for_admin()', 'get_lead_status_history_for_admin()'):
            assert sql(f"select has_function_privilege('authenticated','public.{name}','execute');").stdout.strip() == 'f'
        assert sql("select pg_get_expr(polqual,polrelid) from pg_policy where polname='Staff select lead_status_history';").stdout.strip() == 'false'
        print('PASS: safe rollback preserves revisions, consent events and evaluation evidence')
    finally:
        docker('rm', '-f', NAME)


if __name__ == '__main__':
    main()
