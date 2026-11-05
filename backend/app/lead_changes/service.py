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
                saved_events = []
                for event in self._detect_events(lead, projects):
                    result["events"] += 1
                    if dry_run:
                        continue
                    saved = self.repository.record_event(event)
                    saved_events.append(saved)
                    if (
                        event.get("event_type") == "favorite_project_opportunity"
                        and hasattr(self.repository, "update_favorite_thresholds")
                    ):
                        payload = event.get("payload") or {}
                        self.repository.update_favorite_thresholds(
                            lead["user_id"],
                            event.get("project_id"),
                            payload.get("precio_min_actual_uf"),
                            payload.get("precio_max_actual_uf"),
                            payload.get("bono_pie_actual_pct", 0),
                        )
                if dry_run:
                    continue
                unseen_events = self.repository.unseen_events(lead["user_id"])
                if not unseen_events:
                    continue
                email_result = self._maybe_send_weekly_digest(lead, unseen_events)
                result["emails_sent"] += email_result["sent"]
                result["emails_skipped"] += email_result["skipped"]
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
        events.extend(self._favorite_opportunity_events(lead, projects))
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

    def _favorite_opportunity_events(self, lead, projects):
        watched_favorites = lead.get("watched_favorites") or []
        if not isinstance(watched_favorites, list) or not watched_favorites:
            return []

        projects_by_id = {
            str(item.get("id")): item
            for item in (projects or [])
            if isinstance(item, dict) and item.get("id") is not None
        }
        financial_data = lead.get("financial_data") or {}
        now_iso = self.clock().isoformat()
        events = []

        for favorite in watched_favorites:
            if not isinstance(favorite, dict):
                continue
            if favorite.get("notificar_cambios") is False:
                continue

            project_id = favorite.get("proyecto_id") or favorite.get("project_id")
            project = projects_by_id.get(str(project_id)) if project_id is not None else None
            if not project:
                project = {
                    "id": project_id,
                    "nombre": favorite.get("project_name"),
                    "comuna": favorite.get("comuna"),
                    "tipo": favorite.get("tipo"),
                    "precio_min_uf": favorite.get("precio_min_uf"),
                    "precio_max_uf": favorite.get("precio_max_uf"),
                    "bono_pie_pct": favorite.get("bono_pie_pct", 0),
                    "estado": favorite.get("estado", "disponible"),
                }
            if project.get("estado") == "agotado":
                continue

            curr_min = _number(project.get("precio_min_uf"))
            curr_max = _number(project.get("precio_max_uf"))
            curr_bono = _number(project.get("bono_pie_pct")) or 0.0

            prev_min = _number(favorite.get("umbral_precio_min_uf"))
            if prev_min is None:
                prev_min = curr_min
            prev_max = _number(favorite.get("umbral_precio_max_uf"))
            if prev_max is None:
                prev_max = curr_max
            prev_bono = _number(favorite.get("umbral_bono_pie_pct")) or 0.0

            price_dropped = (
                (curr_min is not None and prev_min is not None and curr_min < prev_min)
                or (curr_max is not None and prev_max is not None and curr_max < prev_max)
            )
            bono_increased = curr_bono > prev_bono

            if not price_dropped and not bono_increased:
                continue

            comp_before = recalculate_favorite_compatibility(financial_data, prev_min, prev_bono)
            comp_after = recalculate_favorite_compatibility(financial_data, curr_min, curr_bono)
            project_name = project.get("nombre") or favorite.get("project_name") or "tu proyecto favorito"

            if price_dropped and bono_increased:
                title = f"Bajó el precio y se activó bono pie de {curr_bono:g}% en {project_name}"
                summary = (
                    f"{project_name} bajó desde {round(prev_min):,} UF a {round(curr_min):,} UF "
                    f"y sumó un bono pie de {curr_bono:g}%. Tu compatibilidad referencial ahora es: {comp_after['label']}."
                )
            elif price_dropped:
                title = f"Bajó el precio en tu favorito {project_name}"
                summary = (
                    f"{project_name} redujo su precio desde {round(prev_min):,} UF a {round(curr_min):,} UF. "
                    f"Tu compatibilidad referencial ahora es: {comp_after['label']}."
                )
            else:
                title = f"{project_name} activó un bono pie de {curr_bono:g}%"
                summary = (
                    f"Tu favorito {project_name} aplicó un bono pie de {curr_bono:g}% "
                    f"(desde {round(curr_min or 0):,} UF). Tu compatibilidad referencial ahora es: {comp_after['label']}."
                )

            prev_label = f"Desde {round(prev_min or 0):,} UF" + (
                f" · Bono pie {prev_bono:g}%" if prev_bono > 0 else " · Sin bono pie"
            )
            curr_label = (
                f"Desde {round(curr_min or 0):,} UF"
                + (f" · Bono pie {curr_bono:g}%" if curr_bono > 0 else " · Sin bono pie")
                + f" ({comp_after['label']})"
            )

            events.append({
                "user_id": lead["user_id"],
                "event_type": "favorite_project_opportunity",
                "materiality_key": f"fav-opp:{project_id}:{curr_min}:{curr_bono}",
                "occurred_at": now_iso,
                "project_id": project_id,
                "project_name": project_name,
                "tone": "positive",
                "title": title,
                "summary": summary,
                "previous_value": {
                    "label": prev_label,
                    "precio_min_uf": prev_min,
                    "precio_max_uf": prev_max,
                    "bono_pie_pct": prev_bono,
                    "compatibility_status": comp_before["status"],
                    "compatibility_label": comp_before["label"],
                },
                "current_value": {
                    "label": curr_label,
                    "precio_min_uf": curr_min,
                    "precio_max_uf": curr_max,
                    "bono_pie_pct": curr_bono,
                    "compatibility_status": comp_after["status"],
                    "compatibility_label": comp_after["label"],
                },
                "payload": {
                    "project_id": project_id,
                    "project_name": project_name,
                    "comuna": project.get("comuna"),
                    "tipo": project.get("tipo"),
                    "price_dropped": price_dropped,
                    "bono_pie_increased": bono_increased,
                    "precio_min_anterior_uf": prev_min,
                    "precio_min_actual_uf": curr_min,
                    "precio_max_anterior_uf": prev_max,
                    "precio_max_actual_uf": curr_max,
                    "descuento_uf": max(0.0, (prev_min or 0.0) - (curr_min or 0.0)),
                    "bono_pie_anterior_pct": prev_bono,
                    "bono_pie_actual_pct": curr_bono,
                    "compatibility_before": comp_before,
                    "compatibility_after": comp_after,
                    "latest_evaluation_id": lead.get("latest_evaluation_id"),
                },
                "source": "catalog_update",
            })

        return events

    def _maybe_send_weekly_digest(self, lead, events):
        result = {"sent": 0, "skipped": 0}
        if os.environ.get("LEAD_CHANGES_EMAIL_ENABLED", "false").strip().lower() not in {"1", "true", "yes"}:
            for event in events:
                self._record_notification(event, lead, "skipped", error_code="email_disabled")
                result["skipped"] += 1
            return result
        last_email_at = parse_time(lead.get("last_lead_change_email_at"))
        if last_email_at and self.clock() - last_email_at < timedelta(days=EMAIL_COOLDOWN_DAYS):
            for event in events:
                self._record_notification(event, lead, "skipped", error_code="frequency_cap")
                result["skipped"] += 1
            return result

        eligible_events = []
        for event in events:
            event_type = event["event_type"]
            if event_type == "quick_update_submitted":
                self._record_notification(event, lead, "skipped", error_code="manual_update_no_email")
                result["skipped"] += 1
                continue
            if self.repository.event_email_sent(event["id"]):
                self._record_notification(event, lead, "skipped", error_code="already_sent")
                result["skipped"] += 1
                continue
            if not self.repository.preference_enabled(lead["user_id"], event_type):
                self._record_notification(event, lead, "skipped", error_code="opt_out")
                result["skipped"] += 1
                continue
            eligible_events.append(event)

        if not eligible_events:
            return result
        try:
            sent = self.email_client.send_digest_email(lead, eligible_events)
        except LeadChangeError as error:
            for event in eligible_events:
                self._record_notification(event, lead, "failed", error_code=error.code)
                result["skipped"] += 1
            return result
        for event in eligible_events:
            self._record_notification(
                event, lead, "sent",
                provider="resend",
                provider_message_id=sent.get("provider_message_id"),
                recipient=sent.get("recipient"),
                subject=sent.get("subject"),
                payload={"provider_payload": sent.get("payload"), "digest_event_count": len(eligible_events)},
            )
        result["sent"] += 1
        return result

    def _record_notification(self, event, lead, status, **extra):
        return self.repository.record_notification({
            "event_id": event["id"],
            "user_id": lead["user_id"],
            "channel": "email",
            "status": status,
            **extra,
        })


def recalculate_favorite_compatibility(financial_data, precio_min_uf, bono_pie_pct=0):
    if not isinstance(financial_data, dict):
        financial_data = {}
    result = financial_data.get("result") or financial_data.get("result_snapshot") or {}
    if not isinstance(result, dict):
        result = {}
    indicators = result.get("financial_indicators") or {}
    if not isinstance(indicators, dict):
        indicators = {}
    input_data = financial_data.get("input") or financial_data.get("input_snapshot") or financial_data
    if not isinstance(input_data, dict):
        input_data = {}
    market_ctx = result.get("market_context") or {}
    if not isinstance(market_ctx, dict):
        market_ctx = {}

    capacidad_uf = _number(indicators.get("capacidad_compra_estimada_uf"))
    if capacidad_uf is None:
        capacidad_uf = _number(financial_data.get("capacidad_compra_estimada_uf"))

    ahorro_clp = _number(input_data.get("ahorro_disponible"))
    if ahorro_clp is None:
        ahorro_clp = _number(input_data.get("ahorro"))

    valor_uf = _number(market_ctx.get("uf_value")) or _number(financial_data.get("uf_value")) or 39000.0
    if valor_uf <= 0:
        valor_uf = 39000.0

    precio = _number(precio_min_uf)
    bono = max(0.0, min(30.0, _number(bono_pie_pct) or 0.0))

    pie_min_rate = max(0.05, 0.10 - (bono / 100.0))
    pie_rec_rate = max(0.05, 0.20 - (bono / 100.0))

    ahorro_uf = round(ahorro_clp / valor_uf, 1) if ahorro_clp is not None else None
    aporte_bono_uf = round((precio or 0.0) * (bono / 100.0), 1) if precio is not None else 0.0
    capacidad_efectiva_uf = round(capacidad_uf + aporte_bono_uf, 1) if capacidad_uf is not None else None
    pie_min_requerido_uf = round((precio or 0.0) * pie_min_rate, 1) if precio is not None else 0.0

    if capacidad_efectiva_uf is None or precio is None or precio <= 0:
        return {
            "status": "unknown",
            "label": "Compatibilidad por confirmar",
            "capacidad_base_uf": round(capacidad_uf, 1) if capacidad_uf is not None else None,
            "capacidad_efectiva_uf": capacidad_efectiva_uf,
            "aporte_bono_pie_uf": aporte_bono_uf,
            "bono_pie_pct": bono,
            "pie_minimo_requerido_uf": pie_min_requerido_uf,
            "ahorro_estimado_uf": ahorro_uf,
            "brecha_uf": None,
            "brecha_pie_uf": None,
        }

    brecha_uf = max(0.0, round(precio - capacidad_efectiva_uf, 1))
    brecha_pie_uf = max(0.0, round(pie_min_requerido_uf - ahorro_uf, 1)) if ahorro_uf is not None else 0.0

    meets_capacity_strict = capacidad_efectiva_uf >= precio
    meets_capacity_near = capacidad_efectiva_uf >= round(precio * 0.90, 1)
    meets_pie_rec = True if ahorro_uf is None else (ahorro_uf >= round(precio * pie_rec_rate, 1))
    meets_pie_min = True if ahorro_uf is None else (ahorro_uf >= pie_min_requerido_uf)

    if meets_capacity_strict and meets_pie_rec:
        status = "compatible"
        label = "Compatible hoy"
    elif meets_capacity_near and meets_pie_min:
        status = "compatible_con_ajustes"
        label = "Compatible con ajustes"
    else:
        status = "no_compatible"
        label = "Aún fuera de alcance"

    return {
        "status": status,
        "label": label,
        "capacidad_base_uf": round(capacidad_uf, 1),
        "capacidad_efectiva_uf": capacidad_efectiva_uf,
        "aporte_bono_pie_uf": aporte_bono_uf,
        "bono_pie_pct": bono,
        "pie_minimo_requerido_uf": pie_min_requerido_uf,
        "ahorro_estimado_uf": ahorro_uf,
        "brecha_uf": brecha_uf,
        "brecha_pie_uf": brecha_pie_uf,
    }


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
