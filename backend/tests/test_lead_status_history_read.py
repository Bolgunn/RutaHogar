"""Contract for authenticated read access to lead_status_history."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261003120000_lead_status_history_read.sql"
ROLLBACK = ROOT / "supabase/rollback/20261003120000_lead_status_history_read_rollback.sql"


def normalize(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", "", sql)
    return re.sub(r"\s+", " ", sql.lower()).strip()


def test_migration_grants_read_only_to_authenticated():
    sql = normalize(MIGRATION.read_text(encoding="utf-8"))
    assert "grant select on table public.lead_status_history to authenticated;" in sql
    assert " to anon" not in sql
    assert not re.search(r"grant [^;]*(insert|update|delete)", sql)


def test_migration_is_noop_when_table_is_absent():
    # develop does not create lead_status_history yet; db reset must not fail.
    sql = normalize(MIGRATION.read_text(encoding="utf-8"))
    assert "if to_regclass('public.lead_status_history') is null then return; end if;" in sql


def test_staff_read_is_scoped_to_own_inmobiliaria():
    sql = normalize(MIGRATION.read_text(encoding="utf-8"))
    policy = sql.split('create policy "staff select lead_status_history"', 1)[1].split(";", 1)[0]
    assert "public.get_my_role() = 'admin'" in policy
    assert "actor.inmobiliaria_id = public.get_my_inmobiliaria()" in policy
    assert "changed_by is null" in policy


def test_rollback_revokes_the_grant():
    sql = normalize(ROLLBACK.read_text(encoding="utf-8"))
    assert "revoke select on table public.lead_status_history from authenticated;" in sql
    assert "grant " not in sql
