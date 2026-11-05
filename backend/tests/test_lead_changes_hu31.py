from datetime import datetime, timezone

from app.lead_changes.email import build_digest_html, build_subject
from app.lead_changes.service import LeadChangeService, recalculate_favorite_compatibility


NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


class FakeRepo:
    def __init__(self, leads, projects=None, preference=True, already_sent=False):
        self.leads = leads
        self.projects = projects or []
        self.preference = preference
        self.already_sent = already_sent
        self.events = []
        self.notifications = []
        self.updated_thresholds = []

    def due_leads(self, limit=100):
        return self.leads[:limit]

    def available_projects(self):
        return self.projects

    def record_event(self, event):
        saved = {**event, "id": event.get("id") or f"event-{len(self.events) + 1}"}
        self.events.append(saved)
        return saved

    def record_notification(self, notification):
        saved = {**notification, "id": f"notification-{len(self.notifications) + 1}"}
        self.notifications.append(saved)
        return saved

    def unseen_events(self, user_id, limit=50):
        return [event for event in self.events if event.get("user_id") == user_id][:limit]

    def preference_enabled(self, user_id, event_type, channel="email"):
        return self.preference

    def event_email_sent(self, event_id):
        return self.already_sent

    def update_favorite_thresholds(self, user_id, proyecto_id, precio_min_uf, precio_max_uf, bono_pie_pct=0):
        self.updated_thresholds.append({
            "user_id": user_id,
            "proyecto_id": proyecto_id,
            "precio_min_uf": precio_min_uf,
            "precio_max_uf": precio_max_uf,
            "bono_pie_pct": bono_pie_pct,
        })


class FakeEmail:
    def __init__(self):
        self.sent = []

    def send_digest_email(self, lead, events):
        self.sent.append((lead, events))
        return {
            "provider_message_id": "msg-hu31",
            "subject": "Oportunidad en favorito",
            "recipient": lead.get("email"),
            "payload": {"ok": True},
        }


def make_lead(watched_favorites, capacidad_uf=2850, ahorro_clp=25000000):
    return {
        "user_id": "00000000-0000-0000-0000-000000000031",
        "email": "comprador.hu31@example.com",
        "latest_evaluation_id": "eval-hu31",
        "latest_evaluation_at": "2026-10-25T12:00:00+00:00",
        "score": 76,
        "classification": "Medio",
        "financial_data": {
            "input": {
                "ingreso_mensual": 1850000,
                "ahorro_disponible": ahorro_clp,
                "deuda_mensual": 150000,
            },
            "result": {
                "financial_indicators": {
                    "capacidad_compra_estimada_uf": capacidad_uf,
                },
                "market_context": {
                    "uf_value": 38000,
                },
            },
        },
        "last_lead_change_email_at": None,
        "watched_favorites": watched_favorites,
    }


def test_recalculate_favorite_compatibility_reflects_price_drop_and_bono_pie():
    financial_data = {
        "input": {"ahorro_disponible": 14000000},
        "result": {
            "financial_indicators": {"capacidad_compra_estimada_uf": 2850},
            "market_context": {"uf_value": 38000},
        },
    }

    before = recalculate_favorite_compatibility(financial_data, precio_min_uf=3200, bono_pie_pct=0)
    assert before["status"] == "no_compatible"
    assert before["brecha_uf"] == 350.0

    after = recalculate_favorite_compatibility(financial_data, precio_min_uf=2800, bono_pie_pct=5)
    assert after["status"] in {"compatible", "compatible_con_ajustes"}
    assert after["aporte_bono_pie_uf"] == 140.0
    assert after["capacidad_efectiva_uf"] == 2990.0
    assert after["brecha_uf"] == 0.0


def test_detects_favorite_opportunity_on_price_drop_and_updates_thresholds(monkeypatch):
    monkeypatch.delenv("LEAD_CHANGES_EMAIL_ENABLED", raising=False)
    project_id = "11111111-2222-3333-4444-555555555555"
    watched = [
        {
            "proyecto_id": project_id,
            "notificar_cambios": True,
            "umbral_precio_min_uf": 3200,
            "umbral_precio_max_uf": 3800,
            "umbral_bono_pie_pct": 0,
            "project_name": "Mirador del Parque",
        }
    ]
    projects = [
        {
            "id": project_id,
            "nombre": "Mirador del Parque",
            "comuna": "Ñuñoa",
            "tipo": "Departamento",
            "precio_min_uf": 2800,
            "precio_max_uf": 3500,
            "bono_pie_pct": 0,
            "estado": "disponible",
        }
    ]

    repo = FakeRepo([make_lead(watched, capacidad_uf=2850)], projects=projects)
    result = LeadChangeService(repo, FakeEmail(), clock=lambda: NOW).run_daily_digest()

    fav_events = [e for e in repo.events if e["event_type"] == "favorite_project_opportunity"]
    assert len(fav_events) == 1
    event = fav_events[0]
    assert event["project_name"] == "Mirador del Parque"
    assert event["source"] == "catalog_update"
    assert event["payload"]["price_dropped"] is True
    assert event["payload"]["bono_pie_increased"] is False
    assert event["payload"]["precio_min_anterior_uf"] == 3200
    assert event["payload"]["precio_min_actual_uf"] == 2800
    assert event["payload"]["compatibility_before"]["status"] == "no_compatible"
    assert event["payload"]["compatibility_after"]["status"] == "compatible"
    assert len(repo.updated_thresholds) == 1
    assert repo.updated_thresholds[0]["precio_min_uf"] == 2800
    assert result["events"] >= 1


def test_detects_favorite_opportunity_on_5_percent_bono_pie(monkeypatch):
    monkeypatch.setenv("LEAD_CHANGES_EMAIL_ENABLED", "true")
    project_id = "22222222-3333-4444-5555-666666666666"
    watched = [
        {
            "proyecto_id": project_id,
            "notificar_cambios": True,
            "umbral_precio_min_uf": 3000,
            "umbral_precio_max_uf": 3600,
            "umbral_bono_pie_pct": 0,
            "project_name": "Altos de Macul",
        }
    ]
    projects = [
        {
            "id": project_id,
            "nombre": "Altos de Macul",
            "comuna": "Macul",
            "tipo": "En verde",
            "precio_min_uf": 3000,
            "precio_max_uf": 3600,
            "bono_pie_pct": 5,
            "estado": "en_verde",
        }
    ]

    repo = FakeRepo([make_lead(watched, capacidad_uf=2900)], projects=projects)
    email = FakeEmail()
    LeadChangeService(repo, email, clock=lambda: NOW).run_daily_digest()

    fav_events = [e for e in repo.events if e["event_type"] == "favorite_project_opportunity"]
    assert len(fav_events) == 1
    event = fav_events[0]
    assert event["payload"]["bono_pie_increased"] is True
    assert event["payload"]["bono_pie_actual_pct"] == 5
    assert "bono pie de 5%" in event["title"].lower()
    assert build_subject(event) == "Nueva oportunidad comercial en tu favorito Altos de Macul"
    html = build_digest_html(make_lead(watched), [event])
    assert "Oportunidad en favorito" in html


def test_ignores_favorite_when_price_increases_or_alert_inactive():
    project_id = "33333333-4444-5555-6666-777777777777"
    watched = [
        {
            "proyecto_id": project_id,
            "notificar_cambios": True,
            "umbral_precio_min_uf": 2800,
            "umbral_precio_max_uf": 3400,
            "umbral_bono_pie_pct": 5,
            "project_name": "Edificio Sin Baja",
        }
    ]
    projects = [
        {
            "id": project_id,
            "nombre": "Edificio Sin Baja",
            "comuna": "Providencia",
            "tipo": "Departamento",
            "precio_min_uf": 2950,
            "precio_max_uf": 3500,
            "bono_pie_pct": 5,
            "estado": "disponible",
        }
    ]

    repo = FakeRepo([make_lead(watched, capacidad_uf=2500)], projects=projects)
    LeadChangeService(repo, FakeEmail(), clock=lambda: NOW).run_daily_digest()

    fav_events = [e for e in repo.events if e["event_type"] == "favorite_project_opportunity"]
    assert fav_events == []
