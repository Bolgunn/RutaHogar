"""Regression checks for authenticated access to evaluations behind RLS."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260923090000_evaluations_authenticated_grants.sql"
ROLLBACK = ROOT / "supabase/rollback/20260923090000_evaluations_authenticated_grants_rollback.sql"
SCHEMA = ROOT / "supabase/schema.sql"
HU18_POLICY_MIGRATION = ROOT / "supabase/migrations/20261004130000_hu18_remove_evaluations_sales_policy.sql"
HU18_POLICY_ROLLBACK = ROOT / "supabase/rollback/20261004130000_hu18_remove_evaluations_sales_policy_rollback.sql"


def normalize(sql: str) -> str:
    return re.sub(r"\s+", " ", sql.lower()).strip()


EXPECTED_GRANT = (
    "grant select, insert, update, delete "
    "on table public.evaluations to authenticated;"
)
EXPECTED_REVOKE = (
    "revoke select, insert, update, delete "
    "on table public.evaluations from authenticated;"
)


def test_migration_grants_only_the_required_evaluations_privileges():
    sql = normalize(MIGRATION.read_text(encoding="utf-8"))
    assert EXPECTED_GRANT in sql
    assert "scoring_history" not in sql
    assert "profiles" not in sql
    assert " to anon" not in sql
    assert "create policy" not in sql
    assert "drop policy" not in sql


def test_rollback_symmetrically_revokes_the_grant():
    sql = normalize(ROLLBACK.read_text(encoding="utf-8"))
    assert EXPECTED_REVOKE in sql
    assert "scoring_history" not in sql
    assert "profiles" not in sql
    assert "grant " not in sql


def test_bootstrap_has_the_same_grant_and_keeps_evaluations_rls_enabled():
    sql = normalize(SCHEMA.read_text(encoding="utf-8"))
    assert EXPECTED_GRANT in sql
    assert "alter table public.evaluations enable row level security;" in sql


def test_evaluations_policies_keep_authenticated_access_row_scoped():
    sql = normalize(SCHEMA.read_text(encoding="utf-8"))
    final_select_policy = sql.rsplit('create policy "evaluations select own"', 1)[1].split(";", 1)[0]
    assert "on public.evaluations for select to authenticated using (auth.uid() = user_id)" in final_select_policy
    assert "get_my_role" not in final_select_policy
    assert (
        'create policy "evaluations insert own" on public.evaluations for insert '
        "with check (auth.uid() = user_id::uuid);"
    ) in sql
    assert (
        'create policy "evaluations delete own" on public.evaluations for delete '
        "using (auth.uid() = user_id::uuid);"
    ) in sql

    migrations = " ".join(
        normalize(path.read_text(encoding="utf-8"))
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))
    )
    assert (
        'create policy "evaluations update own" on public.evaluations for update '
        "using (auth.uid() = user_id) with check (auth.uid() = user_id);"
    ) in migrations


def test_hu18_cleanup_removes_only_the_direct_staff_evaluations_policy():
    sql = normalize(HU18_POLICY_MIGRATION.read_text(encoding="utf-8"))

    assert 'drop policy if exists "evaluations select sales" on public.evaluations;' in sql
    assert "create policy" not in sql
    assert "scoring_history" not in sql
    assert "evaluation_events" not in sql
    assert " for insert" not in sql
    assert " for update" not in sql
    assert " for delete" not in sql


def test_hu18_cleanup_rollback_restores_only_the_removed_policy():
    sql = normalize(HU18_POLICY_ROLLBACK.read_text(encoding="utf-8"))

    assert 'create policy "evaluations select sales" on public.evaluations for select to authenticated' in sql
    assert 'drop policy if exists "evaluations select own"' not in sql
    assert "scoring_history" not in sql
    assert "evaluation_events" not in sql
    assert " for insert" not in sql
    assert " for update" not in sql
    assert " for delete" not in sql


def test_final_hu18_schema_denies_direct_staff_history_and_event_reads():
    sql = normalize(SCHEMA.read_text(encoding="utf-8"))
    final_hu18_state = sql.rsplit("-- hu18 step 8:", 1)[1]

    assert 'drop policy if exists "evaluations select sales" on public.evaluations;' in final_hu18_state
    assert 'drop policy if exists "scoring history select staff" on public.scoring_history;' in final_hu18_state
    assert 'drop policy if exists "evaluation events select staff" on public.evaluation_events;' in final_hu18_state
    assert final_hu18_state.count("create policy") == 1
    assert 'create policy "evaluations select own"' in final_hu18_state


SELECT_POLICY_MIGRATION = ROOT / "supabase/migrations/20261001120000_evaluations_select_policy.sql"
SELECT_POLICY_ROLLBACK = ROOT / "supabase/rollback/20261001120000_evaluations_select_policy_rollback.sql"


def test_select_policy_gives_admin_inmobiliario_executive_access():
    sql = normalize(SELECT_POLICY_MIGRATION.read_text(encoding="utf-8"))
    assert (
        'create policy "evaluations select own" on public.evaluations for select '
        "using ( (auth.uid() = user_id) or "
        "(public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, "
        "'admin_inmobiliario'::text])) );"
    ) in sql


def test_select_policy_does_not_reference_revoked_tables():
    # Postgres checks privileges on every relation a policy mentions at plan
    # time, so a revoked table inside an OR branch blocks every read.
    for path in (SELECT_POLICY_MIGRATION, SELECT_POLICY_ROLLBACK, SCHEMA):
        sql = normalize(path.read_text(encoding="utf-8"))
        policy = sql.split('create policy "evaluations select own"', 1)[1].split(";", 1)[0]
        assert "lead_status_history" not in policy
        assert " from " not in policy
