"""Regression checks for authenticated access to evaluations behind RLS."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260923090000_evaluations_authenticated_grants.sql"
ROLLBACK = ROOT / "supabase/rollback/20260923090000_evaluations_authenticated_grants_rollback.sql"
SCHEMA = ROOT / "supabase/schema.sql"


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
    assert (
        'create policy "evaluations select own" on public.evaluations for select '
        "using ( (auth.uid() = user_id) or "
        "(public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text])) );"
    ) in sql
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
