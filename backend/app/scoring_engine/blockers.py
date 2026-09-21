# Blocker detection layer for critical financial or data-quality conditions.

from .constants import BLOCKER_SEVERITIES

DIVIDEND_RATIO_LIMIT = 0.30
TOTAL_BURDEN_LIMIT = 0.45
DEBT_RATIO_LIMIT = 0.40
CREDIT_END_AGE_LIMIT = 70

def _positive_float(value) -> float:
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return numeric_value if numeric_value > 0 else 0.0


def _get_first(data: dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _is_truthy(value) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _add_blocker(blockers: list[dict], seen_codes: set, code: str, severity: str, title: str, description: str, affects: list[str]) -> None:
    if code in seen_codes:
        return
    blockers.append(
        {
            "code": code,
            "severity": severity,
            "title": title,
            "description": description,
            "affects": affects,
        }
    )
    seen_codes.add(code)


def _has_incomplete_complement(data: dict) -> bool:
    if not _is_truthy(data.get("complemento_renta")):
        return False

    required_values = [
        _get_first(data, "ingreso_mensual_complementario", "complemento_ingreso_mensual"),
        _get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual"),
        _get_first(data, "tipo_contrato_complementario", "complemento_tipo_contrato"),
        _get_first(data, "continuidad_laboral_complementario", "complemento_continuidad_laboral"),
        _get_first(data, "morosidad_complementario", "complemento_morosidad"),
        _get_first(data, "relacion_complementario", "complemento_relacion"),
    ]
    return any(value in (None, "") for value in required_values)


def blocker_rule_margins(data: dict, indicators: dict) -> dict:
    """Signed numeric margins used by both blocker decisions and ALG-13."""
    safe_data, safe_indicators = data or {}, indicators or {}
    income = _positive_float(safe_indicators.get("ingreso_total"))
    dividend = _positive_float(safe_data.get("dividendo_estimado"))
    debt = _positive_float(safe_data.get("deuda_mensual"))
    savings = _positive_float(safe_data.get("ahorro_disponible"))
    return {
        "pie_insuficiente": _positive_float(safe_indicators.get("pie_minimo_clp")) - savings,
        "dividendo_exigente": dividend - DIVIDEND_RATIO_LIMIT * income,
        "carga_total_alta": debt + dividend - TOTAL_BURDEN_LIMIT * income,
        "deuda_actual_alta": debt - DEBT_RATIO_LIMIT * income,
    }


def detect_blockers(data: dict, indicators: dict) -> list[dict]:
    safe_data = data or {}
    safe_indicators = indicators or {}
    blockers: list[dict] = []
    seen_codes = set()
    margins = blocker_rule_margins(safe_data, safe_indicators)

    morosidad_actual = str(safe_data.get("morosidad_actual") or "").strip().lower()
    if morosidad_actual == "si":
        _add_blocker(
            blockers,
            seen_codes,
            "morosidad_vigente",
            BLOCKER_SEVERITIES["critical"],
            "Morosidad vigente",
            "El perfil declara morosidad actual, lo que requiere revision antes de avanzar.",
            ["financial_score", "commercial_priority"],
        )
    elif morosidad_actual == "no_lo_se":
        _add_blocker(
            blockers,
            seen_codes,
            "morosidad_desconocida",
            BLOCKER_SEVERITIES["medium"],
            "Morosidad desconocida",
            "El perfil no confirma si mantiene morosidad actual.",
            ["financial_score", "commercial_priority"],
        )

    if margins["pie_insuficiente"] > 0:
        _add_blocker(
            blockers,
            seen_codes,
            "pie_insuficiente",
            BLOCKER_SEVERITIES["high"],
            "Pie insuficiente",
            "El ahorro disponible no alcanza el pie minimo estimado para el objetivo inmobiliario.",
            ["project_fit", "commercial_priority"],
        )

    if _positive_float(safe_indicators.get("ingreso_total")) > 0 and margins["dividendo_exigente"] > 0:
        _add_blocker(
            blockers,
            seen_codes,
            "dividendo_exigente",
            BLOCKER_SEVERITIES["high"],
            "Dividendo exigente",
            "El dividendo estimado representa una proporcion alta del ingreso declarado.",
            ["financial_score", "project_fit"],
        )

    if _positive_float(safe_indicators.get("ingreso_total")) > 0 and margins["carga_total_alta"] > 0:
        _add_blocker(
            blockers,
            seen_codes,
            "carga_total_alta",
            BLOCKER_SEVERITIES["critical"],
            "Carga total alta",
            "La carga financiera total estimada supera un umbral prudente para avanzar.",
            ["financial_score", "commercial_priority"],
        )

    if _positive_float(safe_indicators.get("ingreso_total")) > 0 and margins["deuda_actual_alta"] > 0:
        _add_blocker(
            blockers,
            seen_codes,
            "deuda_actual_alta",
            BLOCKER_SEVERITIES["high"],
            "Deuda actual alta",
            "La deuda mensual declarada representa una proporcion alta del ingreso.",
            ["financial_score"],
        )

    if safe_data.get("continuidad_laboral") == "menos_6_meses":
        _add_blocker(
            blockers,
            seen_codes,
            "continuidad_laboral_baja",
            BLOCKER_SEVERITIES["medium"],
            "Continuidad laboral baja",
            "La continuidad laboral declarada es menor a seis meses.",
            ["financial_score"],
        )

    if safe_data.get("tipo_contrato") in {"plazo_fijo", "honorarios_variable"}:
        _add_blocker(
            blockers,
            seen_codes,
            "contrato_inestable",
            BLOCKER_SEVERITIES["medium"],
            "Contrato inestable",
            "El tipo de contrato declarado puede requerir mayor revision financiera.",
            ["financial_score"],
        )

    if _has_incomplete_complement(safe_data):
        _add_blocker(
            blockers,
            seen_codes,
            "complemento_incompleto",
            BLOCKER_SEVERITIES["high"],
            "Complemento incompleto",
            "El complemento de renta fue declarado, pero faltan antecedentes relevantes.",
            ["financial_score", "commercial_priority"],
        )

    relacion_complementario = _get_first(safe_data, "relacion_complementario", "complemento_relacion")
    if relacion_complementario in {"amigo", "otro"}:
        _add_blocker(
            blockers,
            seen_codes,
            "complemento_debil",
            BLOCKER_SEVERITIES["medium"],
            "Complemento debil",
            "La relacion del complementario puede ser debil para sustentar capacidad financiera.",
            ["financial_score"],
        )

    if _positive_float(safe_indicators.get("edad_fin_credito")) > CREDIT_END_AGE_LIMIT:
        _add_blocker(
            blockers,
            seen_codes,
            "edad_plazo_riesgoso",
            BLOCKER_SEVERITIES["medium"],
            "Edad y plazo riesgoso",
            "La edad estimada al termino del credito supera un umbral prudente.",
            ["project_fit"],
        )

    return blockers
