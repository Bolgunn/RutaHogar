"""Static safeguards for the public, token-gated HU18 Edge Function."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "supabase/functions/co-debtor-consent/index.ts"


def test_resend_failure_logging_cannot_include_email_content_or_tokens():
    source = SOURCE.read_text(encoding="utf-8")

    assert "await response.text()" not in source
    error_log = source.split('console.error("Resend rechazó el correo de co-deudor.", {', 1)[1].split("});", 1)[0]
    assert "token" not in error_log.lower()
    assert "body" not in error_log.lower()
    assert "status: response.status" in error_log
