from datetime import datetime, timedelta, timezone
import os

from .contracts import LeadChangeError, parse_time
from .email import ResendEmailClient
from .repository import LeadChangeRepository
from ..market_data.service import MarketRepositoryError, MarketSnapshotUnavailable, resolve_market_snapshot_from_environment
from ..scoring import MarketDataUnavailable, calculate_score


EMAIL_COOLDOWN_DAYS = 7
MONTHLY_PLAN_DAYS = 30


class LeadChangeService:
    def __init__(self, repository=None, email_client=None, clock=None):
        self.repository = repository or LeadChangeRepository()
        self.email_client = email_client or ResendEmailClient()
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def run_daily_digest(self, limit=100, dry_run=False):
        leads = self.repository.due_leads(limit)
        projects = self.repository.available_projects()
        result = {"checked": len(leads), "events": 0, "emails_sent": 0, "emails_skipped": 0, "errors": []}
        for lead in leads:
            try:
                for event in self._detect_events(lead, projects):
                    result["events"] += 1
                    if dry_run:
                        continue
                    saved = self.repository.record_event(event)
                    notification = self._maybe_send_email(lead, saved)
                    if notification.get("status") == "sent":
                        result["emails_sent"] += 1
                    else:
                        result["emails_skipped"] += 1
            except LeadChangeError as error:
                result["errors"].append({"user_id": lead.get("user_id"), "code": error.code})
        return result

    def _detect_events(self, lead, projects):
        events = []
        if event := self._monthly_plan_event(lead):
            events.append(event)
        if event := self._score_band_improved_event(lead):
            events.append(event)
        if event := self._project_compatible_event(lead, projects):
            events.append(event)
        if event := self._uf_reachability_event(lead):
            events.append(event)
        return events

    def _monthly_plan_event(self, lead):
        evaluation_at = parse_time(lead.get("latest_evaluation_at"))
        if not evaluation_at:
            return None
        now = self.clock()
        elapsed_days = (now - evaluation_at).days
        if elapsed_days < MONTHLY_PLAN_DAYS:
            return None
        period = elapsed_days // MONTHLY_PLAN_DAYS
        financial_data = lead.get("financial_data") or {}
        project = _project_reference(financial_data)
        project_name = project.get("nombre") or "tu proyecto objetivo"
        materiality_key = f"monthly-plan:{lead['latest_evaluation_id']}:{period}"
        return {
            "user_id": lead["user_id"],
            "event_type": "monthly_plan_summary",
            "materiality_key": materiality_key,
            "occurred_at": now.isoformat(),
            "project_id": project.get("id"),
            "project_name": project_name,
            "tone": "info",
            "title": f"Ya se cumplio un mes para revisar {project_name}",
            "summary": (
                f"Tu evaluacion tiene {elapsed_days} dias. Revisa si tu ingreso, ahorro o deuda cambiaron "
                f"para actualizar tu brecha frente a {project_name}."
            ),
            "previous_value": {"label": "Ultima evaluacion registrada"},
            "current_value": {"label": f"{elapsed_days} dias desde la ultima evaluacion"},
            "payload": {
                "latest_evaluation_id": lead.get("latest_evaluation_id"),
                "score": lead.get("score"),
                "classification": lead.get("classification"),
                "elapsed_days": elapsed_days,
                "period": period,
                "suggested_update_fields": ["ingreso_mensual", "ahorro_disponible", "deuda_mensual"],
            },
            "source": "job",
        }

    def _score_band_improved_event(self, lead):
        financial_data = lead.get("financial_data") or {}
        input_data = financial_data.get("input") or financial_data.get("input_snapshot") or financial_data
        if not input_data:
            return None
        previous_class = lead.get("classification")
        try:
            snapshot = resolve_market_snapshot_from_environment()
            recalculated = calculate_score(input_data, include_ai=False, market_snapshot=snapshot)
        except (MarketDataUnavailable, MarketSnapshotUnavailable, MarketRepositoryError):
            return None
        current_class = recalculated.get("classification")
        if not _classification_improved(previous_class, current_class):
            return None
        project = _project_reference(lead.get("financial_data") or {})
        project_name = project.get("nombre") or "tu proyecto objetivo"
        return {
            "user_id": lead["user_id"],
            "event_type": "score_band_improved",
            "materiality_key": f"score-band-reference:{lead.get('latest_evaluation_id')}:{previous_class}->{current_class}:{snapshot.get('fetched_at')}",
            "occurred_at": self.clock().isoformat(),
            "project_id": project.get("id"),
            "project_name": project_name,
            "tone": "positive",
            "title": f"Tu tramo referencial podria mejorar a {current_class}",
            "summary": "Con la referencia vigente, una nueva evaluacion podria mostrar una mejora de tramo si tus datos siguen igual.",
            "previous_value": {"label": previous_class},
            "current_value": {"label": current_class},
            "payload": {
                "previous_score": lead.get("score"),
                "reference_score": recalculated.get("score"),
                "market_snapshot": snapshot,
                "latest_evaluation_id": lead.get("latest_evaluation_id"),
            },
            "source": "job",
        }

    def _project_compatible_event(self, lead, projects):
        financial_data = lead.get("financial_data") or {}
        result = financial_data.get("result") or financial_data.get("result_snapshot") or {}
        indicators = result.get("financial_indicators") or {}
        capacity = _number(indicators.get("capacidad_compra_estimada_uf"))
        if capacity is None:
            return None
        compatible = []
        for project in projects:
            price_min = _number(project.get("precio_min_uf"))
            if price_min is not None and capacity >= price_min:
                compatible.append(project)
        if not compatible:
            return None
        compatible.sort(key=lambda item: (_number(item.get("precio_min_uf")) or 0, item.get("nombre") or ""))
        best = compatible[0]
        project_name = best.get("nombre") or "un proyecto compatible"
        return {
            "user_id": lead["user_id"],
            "event_type": "project_compatible_unlocked",
            "materiality_key": f"project-compatible:{best.get('id')}",
            "occurred_at": self.clock().isoformat(),
            "project_id": best.get("id"),
            "project_name": project_name,
            "tone": "positive",
            "title": f"{project_name} aparece dentro de tu alcance referencial",
            "summary": f"Tu capacidad estimada es de {round(capacity):,} UF y el proyecto parte desde {best.get('precio_min_uf')} UF.",
            "previous_value": {"label": "Sin proyecto comunicado"},
            "current_value": {"label": f"{project_name} desde {best.get('precio_min_uf')} UF"},
            "payload": {"capacity_uf": capacity, "project": best},
            "source": "job",
        }

    def _uf_reachability_event(self, lead):
        financial_data = lead.get("financial_data") or {}
        input_data = financial_data.get("input") or financial_data.get("input_snapshot") or financial_data
        project = _project_reference(financial_data)
        price_min = _number(project.get("precio_min_uf"))
        if not input_data or price_min is None:
            return None
        result = financial_data.get("result") or financial_data.get("result_snapshot") or {}
        previous_capacity = _number((result.get("financial_indicators") or {}).get("capacidad_compra_estimada_uf"))
        if previous_capacity is None:
            return None
        try:
            snapshot = resolve_market_snapshot_from_environment()
            recalculated = calculate_score(input_data, include_ai=False, market_snapshot=snapshot)
        except (MarketDataUnavailable, MarketSnapshotUnavailable, MarketRepositoryError):
            return None
        current_capacity = _number((recalculated.get("financial_indicators") or {}).get("capacidad_compra_estimada_uf"))
        if current_capacity is None:
            return None
        previously_reached = previous_capacity >= price_min
        currently_reaches = current_capacity >= price_min
        if previously_reached == currently_reaches:
            return None
        project_name = project.get("nombre") or "tu proyecto objetivo"
        tone = "positive" if currently_reaches else "warning"
        title = f"{project_name} podria estar a tu alcance" if currently_reaches else f"Tu alcance referencial cambio para {project_name}"
        return {
            "user_id": lead["user_id"],
            "event_type": "uf_reachability_crossed",
            "materiality_key": f"uf-cross:{lead.get('latest_evaluation_id')}:{project.get('id')}:{previously_reached}->{currently_reaches}:{snapshot.get('fetched_at')}",
            "occurred_at": self.clock().isoformat(),
            "project_id": project.get("id"),
            "project_name": project_name,
            "tone": tone,
            "title": title,
            "summary": f"Con la referencia UF vigente, tu capacidad paso de {round(previous_capacity):,} UF a {round(current_capacity):,} UF frente a {project_name}.",
            "previous_value": {"value": round(previous_capacity), "unit": "UF"},
            "current_value": {"value": round(current_capacity), "unit": "UF"},
            "payload": {"previously_reached": previously_reached, "currently_reaches": currently_reaches, "market_snapshot": snapshot},
            "source": "job",
        }

    def _maybe_send_email(self, lead, event):
        event_type = event["event_type"]
        if event.get("tone") == "warning":
            return self._record_notification(event, lead, "skipped", error_code="negative_event_no_email")
        if os.environ.get("LEAD_CHANGES_EMAIL_ENABLED", "false").strip().lower() not in {"1", "true", "yes"}:
            return self._record_notification(event, lead, "skipped", error_code="email_disabled")
        if self.repository.event_email_sent(event["id"]):
            return self._record_notification(event, lead, "skipped", error_code="already_sent")
        if not self.repository.preference_enabled(lead["user_id"], event_type):
            return self._record_notification(event, lead, "skipped", error_code="opt_out")
        last_email_at = parse_time(lead.get("last_lead_change_email_at"))
        if last_email_at and self.clock() - last_email_at < timedelta(days=EMAIL_COOLDOWN_DAYS):
            return self._record_notification(event, lead, "skipped", error_code="frequency_cap")
        try:
            sent = self.email_client.send_change_email(lead, event)
        except LeadChangeError as error:
            return self._record_notification(event, lead, "failed", error_code=error.code)
        return self._record_notification(
            event, lead, "sent",
            provider="resend",
            provider_message_id=sent.get("provider_message_id"),
            recipient=sent.get("recipient"),
            subject=sent.get("subject"),
            payload={"provider_payload": sent.get("payload")},
        )

    def _record_notification(self, event, lead, status, **extra):
        return self.repository.record_notification({
            "event_id": event["id"],
            "user_id": lead["user_id"],
            "channel": "email",
            "status": status,
            **extra,
        })


def _project_reference(financial_data):
    if not isinstance(financial_data, dict):
        return {}
    for container in (financial_data.get("input"), financial_data.get("onboarding"), financial_data.get("result")):
        if isinstance(container, dict) and isinstance(container.get("project_goal"), dict):
            return container["project_goal"]
    project_goal = financial_data.get("project_goal")
    return project_goal if isinstance(project_goal, dict) else {}


def _number(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _classification_improved(previous, current):
    order = {"Bajo": 0, "Medio": 1, "Alto": 2}
    return previous in order and current in order and order[current] > order[previous]
