"""Read-boundary redaction. Stored evidence is never modified."""

from copy import deepcopy

from .co_debtor import FINANCIAL_FIELDS, historical_visibility, select_confirmation

RAW_FIELDS = frozenset((*FINANCIAL_FIELDS, "relacion_complementario",
    "recipient_email", "recipient_rut", "participant_user_id", "actor_user_id",
    "token_digest", "management_token_digest", "request_id", "relation_value",
    "co_debtor_confirmation_id", "relation_declaration_event_id", "accepted_relation_event_id", "confirmation_id"))
NARRATIVES = frozenset({"ai_explanation", "explanation", "executive_summary", "commercial_guidance",
                       "risks", "recommendations", "positive_indicators", "structured_improvement_plan",
                       "improvement_plan", "user_explanation_deterministic", "project_fit", "main_blocker",
                       "blockers", "bipersonal_summary", "events", "title", "description",
                       "original_plan_snapshot", "progress_data", "housing_plan", "component_scores",
                       "base_score", "adjusted_score", "classification_reason", "original_classification",
                       "score_adjustment_reason", "commercial_priority_detail", "commercial_priority",
                       "scoring_overrides", "market_assumptions", "onboarding_snapshot", "payload", "details", "notes",
                       "executive_summary_deterministic", "commercial_guidance_deterministic", "fraud_score_probability",
                       "shap_top_factors", "housing_benefits", "risk_codes", "co_debtor", "co_debtor_projection"})


def redact_snapshot(value):
    if isinstance(value, list):
        return [redact_snapshot(item) for item in value]
    if not isinstance(value, dict):
        return deepcopy(value)
    result = {}
    for key, item in value.items():
        if (key in RAW_FIELDS or key in NARRATIVES
                or key.startswith(("complemento_", "capacidad_", "principal_maximo_", "ingreso_total", "deuda_total",
                                   "deuda_complementaria", "ingreso_complementario", "ratio_", "total_burden", "dividendo_viable",
                                   "dividendo_maximo", "valor_vivienda_soportable", "pie_minimo", "pie_intermedio", "pie_recomendado",
                                   "cobertura_pie", "brecha_pie", "ahorro_mensual_", "meses_"))):
            continue
        if (key in {"result", "result_snapshot", "current_evaluation"}
                or (key == "evaluation" and isinstance(item, dict) and "score" in item)) and isinstance(item, dict):
            safe = {name: deepcopy(item[name]) for name in ("score", "classification", "algorithm_version") if name in item}
            if isinstance(item.get("financial_indicators"), dict):
                safe["financial_indicators"] = {name: item["financial_indicators"][name] for name in ("ingreso_principal", "deuda_principal")
                                                if name in item["financial_indicators"]}
            result[key] = safe
        elif key == "financial_indicators":
            result[key] = {name: item[name] for name in ("ingreso_principal", "deuda_principal")
                           if name in (item or {})}
        else:
            result[key] = redact_snapshot(item)
    return result


def snapshot_reference(snapshot):
    return ((snapshot or {}).get("provenance") or {}).get("co_debtor_confirmation_id")


def snapshot_has_complement(value):
    """Mirror the narrow RLS detector, including aliases/partial legacy shapes."""
    if isinstance(value, list):
        return any(snapshot_has_complement(child) for child in value)
    if not isinstance(value, dict):
        return False
    for key, child in value.items():
        if child is None:
            continue
        if key == "complemento_renta" and (child is True or str(child).lower() in {"true", "1", "si", "sí", "yes"}):
            return True
        if key != "complemento_renta" and (key.startswith("complemento_") or key in RAW_FIELDS - {
                "token_digest", "management_token_digest", "request_id", "actor_user_id", "confirmation_id", "accepted_relation_event_id", "relation_declaration_event_id"}):
            return True
        if key == "ingreso_complementario_considerado" and child not in (0, "0"):
            return True
        if key == "complement_source" and isinstance(child, str) and child in {"co_debtor_confirmed", "lead_declared", "excluded_after_revocation", "excluded_after_decline"}:
            return True
        if key == "evaluation_type" and isinstance(child, str) and child in {"bipersonal_confirmed", "declared_complement", "unverifiable_origin"}:
            return True
        if isinstance(child, (dict, list)) and snapshot_has_complement(child):
            return True
    return False


def can_show_snapshot(snapshot, invitations, now, *, owner=False):
    if not snapshot_has_complement(snapshot):
        return True
    ref = snapshot_reference(snapshot)
    matches = [invitation for invitation in invitations
               if ref and select_confirmation(invitation.get("co_debtor_confirmations"), ref)]
    if len(matches) == 1:
        return historical_visibility(matches[0], now)["visible"]
    # Unknown provenance is not reconstructed by matching values or dates.
    return False


def project_row(row, invitations, now, *, owner=False):
    result = deepcopy(row)
    key = "financial_data" if "financial_data" in row else "snapshot"
    snapshot = row.get(key) or {}
    scoped = [item for item in invitations if not row.get("user_id") or item.get("lead_id", row["user_id"]) == row["user_id"]]
    if not can_show_snapshot(snapshot, scoped, now, owner=owner):
        result = redact_snapshot(result)
        result["co_debtor_visibility"] = "hidden"
    return result
