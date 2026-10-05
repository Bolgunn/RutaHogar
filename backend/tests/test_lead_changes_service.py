from datetime import datetime, timezone

from app.lead_changes.contracts import LeadChangeError
from app.lead_changes.service import LeadChangeService


NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


class FakeRepo:
    def __init__(self, leads, preference=True, already_sent=False):
        self.leads = leads
        self.preference = preference
        self.already_sent = already_sent
        self.events = []
        self.notifications = []

    def due_leads(self, limit=100):
        return self.leads[:limit]

    def available_projects(self):
        return []

    def record_event(self, event):
        saved = {**event, "id": event.get("id") or "event-1"}
        self.events.append(saved)
        return saved

    def record_notification(self, notification):
        saved = {**notification, "id": f"notification-{len(self.notifications) + 1}"}
        self.notifications.append(saved)
        return saved

    def preference_enabled(self, user_id, event_type, channel="email"):
        return self.preference

    def event_email_sent(self, event_id):
        return self.already_sent


class FakeEmail:
    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []

    def send_change_email(self, lead, event):
        if self.fail:
            raise LeadChangeError("email_provider_unavailable")
        self.sent.append((lead, event))
        return {
            "provider_message_id": "msg-1",
            "subject": "Algo cambio",
            "recipient": lead.get("email"),
            "payload": {"ok": True},
        }


def lead(overrides=None):
    return {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "email": "lead@example.com",
        "latest_evaluation_id": "eval-1",
        "latest_evaluation_at": "2026-08-20T12:00:00+00:00",
        "score": 72,
        "classification": "Medio",
        "financial_data": {"input": {"project_goal": {"nombre": "Parque Ruta"}}},
        "last_lead_change_email_at": None,
        **(overrides or {}),
    }


def test_monthly_plan_event_records_event_with_email_disabled_by_default(monkeypatch):
    monkeypatch.delenv("LEAD_CHANGES_EMAIL_ENABLED", raising=False)
    repo = FakeRepo([lead()])
    email = FakeEmail()
    result = LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    assert result["events"] == 1
    assert result["emails_sent"] == 0
    assert repo.events[0]["event_type"] == "monthly_plan_summary"
    assert repo.events[0]["project_name"] == "Parque Ruta"
    assert repo.notifications[0]["status"] == "skipped"
    assert repo.notifications[0]["error_code"] == "email_disabled"


def test_monthly_plan_event_sends_email_when_enabled(monkeypatch):
    monkeypatch.setenv("LEAD_CHANGES_EMAIL_ENABLED", "true")
    repo = FakeRepo([lead()])
    email = FakeEmail()
    result = LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    assert result["events"] == 1
    assert result["emails_sent"] == 1
    assert repo.notifications[0]["status"] == "sent"


def test_monthly_plan_respects_frequency_cap(monkeypatch):
    monkeypatch.setenv("LEAD_CHANGES_EMAIL_ENABLED", "true")
    repo = FakeRepo([lead({"last_lead_change_email_at": "2026-10-01T12:00:00+00:00"})])
    email = FakeEmail()
    result = LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    assert result["events"] == 1
    assert result["emails_sent"] == 0
    assert repo.notifications[0]["status"] == "skipped"
    assert repo.notifications[0]["error_code"] == "frequency_cap"


def test_monthly_plan_respects_opt_out(monkeypatch):
    monkeypatch.setenv("LEAD_CHANGES_EMAIL_ENABLED", "true")
    repo = FakeRepo([lead()], preference=False)
    email = FakeEmail()
    result = LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    assert result["emails_sent"] == 0
    assert repo.notifications[0]["error_code"] == "opt_out"


def test_monthly_plan_does_not_send_duplicate_event_email(monkeypatch):
    monkeypatch.setenv("LEAD_CHANGES_EMAIL_ENABLED", "true")
    repo = FakeRepo([lead()], already_sent=True)
    email = FakeEmail()
    result = LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    assert result["emails_sent"] == 0
    assert repo.notifications[0]["error_code"] == "already_sent"
    assert email.sent == []


def test_no_event_before_month_elapsed():
    repo = FakeRepo([lead({"latest_evaluation_at": "2026-09-20T12:00:00+00:00"})])
    result = LeadChangeService(repo, FakeEmail(), clock=lambda: NOW).run_daily_digest()

    assert result["events"] == 0
    assert repo.events == []
