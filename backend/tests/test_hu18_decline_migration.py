"""Static contract checks for HU18's decline migration and matching rollback."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261007130000_hu18_decline_invitation.sql"
ROLLBACK = ROOT / "supabase/rollback/20261007130000_hu18_decline_invitation_rollback.sql"
SCHEMA = ROOT / "supabase/schema.sql"


def normalize(sql):
    return re.sub(r"\s+", " ", sql.lower()).strip()


def test_decline_migration_allows_declined_event_status_and_matches_bootstrap_schema():
    migration = normalize(MIGRATION.read_text(encoding="utf-8"))
    schema = normalize(SCHEMA.read_text(encoding="utf-8"))
    expected = "check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'declined', 'replaced'))"

    assert "drop constraint if exists co_debtor_consent_events_invitation_status_check;" in migration
    assert expected in migration
    assert expected in schema


def test_decline_rollback_removes_only_the_decline_operation_and_restores_prior_constraints():
    rollback = normalize(ROLLBACK.read_text(encoding="utf-8"))

    assert "safe only before production decline use" in rollback
    assert "drop function if exists public.hu18_decline_invitation(uuid);" in rollback
    assert "co_debtor_invitations_status_check" in rollback
    assert "co_debtor_consent_events_event_type_check" in rollback
    assert "co_debtor_consent_events_invitation_status_check" in rollback
    assert "check (status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced'))" in rollback
    assert "check (event_type in ('invited', 'replaced', 'expired', 'consent_granted', 'confirmed', 'revoked'))" in rollback
    assert "check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced'))" in rollback
