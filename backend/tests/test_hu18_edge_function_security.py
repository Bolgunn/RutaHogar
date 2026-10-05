"""Static safeguards for the public, token-gated HU18 Edge Function."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "supabase/functions/co-debtor-consent/index.ts"
HELPERS = ROOT / "supabase/functions/co-debtor-consent/helpers.ts"
RUT_MIGRATION = ROOT / "supabase/migrations/20261004140000_hu18_co_debtor_declared_rut.sql"
PREFILL_MIGRATION = ROOT / "supabase/migrations/20261004150000_hu18_declared_complement_preload.sql"


def test_resend_failure_logging_cannot_include_email_content_or_tokens():
    source = SOURCE.read_text(encoding="utf-8")

    assert "await response.text()" not in source
    error_log = source.split('console.error("Resend rechazó el correo de co-deudor.", {', 1)[1].split("});", 1)[0]
    assert "token" not in error_log.lower()
    assert "body" not in error_log.lower()
    assert "status: response.status" in error_log


def test_declared_rut_is_validated_server_side_and_stays_out_of_public_contracts():
    source = SOURCE.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")

    assert "normalizeChileanRut(body.recipient_rut)" in source
    assert "p_recipient_rut: recipientRut" in source
    assert 'recipient_email, lead_id' in source
    assert "recipient_rut" not in source.split("function findByToken", 1)[1].split("function materializeExpiry", 1)[0]
    assert "co_debtor_consent_events" not in source
    assert "function normalizeChileanRut" in helpers
    assert "verificationDigit !== expected" in helpers


def test_rut_migration_uses_one_invitation_column_and_service_only_overload():
    migration = RUT_MIGRATION.read_text(encoding="utf-8")

    assert "add column if not exists recipient_rut text" in migration
    assert "p_recipient_rut text" in migration
    assert "to service_role" in migration
    assert "create policy" not in migration.lower()


def test_pending_public_inspection_only_allows_the_five_declared_fields():
    source = SOURCE.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")
    migration = PREFILL_MIGRATION.read_text(encoding="utf-8")

    for field in (
        "ingreso_mensual_complementario",
        "deuda_mensual_complementario",
        "tipo_contrato_complementario",
        "continuidad_laboral_complementario",
        "morosidad_complementario",
    ):
        assert field in migration
        assert field in source.split("function findByToken", 1)[1].split("function materializeExpiry", 1)[0]
    public_context = helpers.split("export function invitationPublicContext", 1)[1].split("export function managementPublicContext", 1)[0]
    assert 'status !== "pending"' in public_context
    for forbidden in ("recipient_email", "recipient_rut", "lead_id", "relacion_complementario", "token_digest", "management_token_digest"):
        assert forbidden not in public_context
    assert "parseLeadDeclaredComplement(body)" in source
