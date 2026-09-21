# Weighted component scoring layer for future auditable scoring versions.

PAYMENT_RATIO_LIMITS = (0.25, 0.30, 0.40)
DEBT_RATIO_LIMITS = (0.20, 0.30, 0.40)
TOTAL_BURDEN_LIMITS = (0.25, 0.35, 0.45)
SAVINGS_RATIO_LIMITS = (0.10, 0.15, 0.20)

def _clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def _positive_float(value) -> float:
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return numeric_value if numeric_value > 0 else 0.0


def _ratio_or_none(value):
    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return None
    return numeric_value if numeric_value >= 0 else None


def _is_truthy(value) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _get_first(data: dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _blocker_codes(blockers: list) -> set:
    return {blocker.get("code") for blocker in blockers or [] if isinstance(blocker, dict)}


def _score_payment_capacity(indicators: dict) -> float:
    ratio = _ratio_or_none(indicators.get("ratio_dividendo_ingreso"))
    if ratio is None:
        return 0.0
    if ratio <= PAYMENT_RATIO_LIMITS[0]:
        return 100.0
    if ratio <= PAYMENT_RATIO_LIMITS[1]:
        return 80.0
    if ratio <= PAYMENT_RATIO_LIMITS[2]:
        return 55.0
    return 25.0


def _score_debt(indicators: dict) -> float:
    debt_ratio = _ratio_or_none(indicators.get("ratio_deuda_ingreso"))
    total_ratio = _ratio_or_none(indicators.get("ratio_carga_total"))
    if debt_ratio is None and total_ratio is None:
        return 0.0

    score = 100.0
    if debt_ratio is not None:
        if debt_ratio > DEBT_RATIO_LIMITS[2]:
            score -= 45
        elif debt_ratio > DEBT_RATIO_LIMITS[1]:
            score -= 25
        elif debt_ratio > DEBT_RATIO_LIMITS[0]:
            score -= 10
    if total_ratio is not None:
        if total_ratio > TOTAL_BURDEN_LIMITS[2]:
            score -= 50
        elif total_ratio > TOTAL_BURDEN_LIMITS[1]:
            score -= 25
        elif total_ratio > TOTAL_BURDEN_LIMITS[0]:
            score -= 10
    return score


def _score_savings(indicators: dict) -> float:
    pie_ratio = _ratio_or_none(indicators.get("pie_ratio"))
    if pie_ratio is not None:
        if pie_ratio >= SAVINGS_RATIO_LIMITS[2]:
            return 100.0
        if pie_ratio >= SAVINGS_RATIO_LIMITS[1]:
            return 82.0 + min((pie_ratio - 0.15) / 0.05, 1.0) * 13.0
        if pie_ratio >= SAVINGS_RATIO_LIMITS[0]:
            return 58.0 + min((pie_ratio - 0.10) / 0.05, 1.0) * 18.0
        if pie_ratio > 0:
            return 20.0 + min(pie_ratio / 0.10, 1.0) * 35.0
        return 0.0

    recommended_coverage = _positive_float(indicators.get("cobertura_pie_recomendado"))
    minimum_coverage = _positive_float(indicators.get("cobertura_pie_minimo"))

    if recommended_coverage >= 1:
        return 100.0
    if minimum_coverage >= 1:
        return 65.0 + min(recommended_coverage, 1.0) * 25.0
    if minimum_coverage > 0:
        return 20.0 + min(minimum_coverage, 1.0) * 35.0
    return 0.0


def _score_work_stability(data: dict) -> float:
    contract_type = data.get("tipo_contrato")
    continuity = data.get("continuidad_laboral")
    score = 60.0

    if contract_type == "indefinido":
        score += 25
    elif contract_type == "independiente":
        score -= 5
    elif contract_type == "plazo_fijo":
        score -= 25
    elif contract_type == "honorarios_variable":
        score -= 20
    else:
        score -= 20

    if continuity == "mas_3_anios":
        score += 15
    elif continuity == "entre_1_y_3_anios":
        score += 5
    elif continuity == "entre_6_y_12_meses":
        score -= 15
    elif continuity == "menos_6_meses":
        score -= 30
    else:
        score -= 15

    return score


def _score_payment_history(data: dict) -> float:
    delinquency = data.get("morosidad_actual")
    if delinquency == "no":
        return 100.0
    if delinquency == "no_lo_se":
        return 45.0
    if delinquency == "si":
        return 15.0
    return 0.0


def _score_income_complement(data: dict, blocker_codes: set) -> float:
    if not _is_truthy(data.get("complemento_renta")):
        return 50.0

    if "complemento_incompleto" in blocker_codes:
        return 20.0

    score = 75.0
    comp_income = _positive_float(_get_first(data, "ingreso_mensual_complementario", "complemento_ingreso_mensual"))
    comp_debt = _positive_float(_get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual"))
    comp_delinquency = _get_first(data, "morosidad_complementario", "complemento_morosidad")
    comp_contract = _get_first(data, "tipo_contrato_complementario", "complemento_tipo_contrato")
    comp_continuity = _get_first(data, "continuidad_laboral_complementario", "complemento_continuidad_laboral")
    comp_relation = _get_first(data, "relacion_complementario", "complemento_relacion")

    if comp_income <= 0:
        score -= 25
    if comp_income > 0 and comp_debt > 0.4 * comp_income:
        score -= 25
    if comp_delinquency == "si":
        score -= 45
    elif comp_delinquency == "no_lo_se":
        score -= 20
    if comp_contract in {"plazo_fijo", "honorarios_variable"}:
        score -= 15
    elif comp_contract == "indefinido":
        score += 10
    if comp_continuity == "menos_6_meses":
        score -= 20
    elif comp_continuity in {"entre_1_y_3_anios", "mas_3_anios"}:
        score += 10
    if comp_relation in {"amigo", "otro"} or "complemento_debil" in blocker_codes:
        score -= 20

    return score


def _score_data_quality(data: dict, blockers: set) -> float:
    key_fields = [
        "ingreso_mensual",
        "deuda_mensual",
        "ahorro_disponible",
        "dividendo_estimado",
        "edad",
        "plazo_credito_hipotecario",
        "tipo_contrato",
        "continuidad_laboral",
        "morosidad_actual",
    ]
    optional_fields = [
        "property_value_clp",
        "property_value_uf",
        "property_value",
        "comuna_objetivo",
    ]

    completed_key_fields = sum(1 for field in key_fields if data.get(field) not in (None, ""))
    completed_optional_fields = sum(1 for field in optional_fields if data.get(field) not in (None, ""))
    score = (completed_key_fields / len(key_fields)) * 80.0
    score += min(completed_optional_fields, 2) * 10.0

    if "complemento_incompleto" in blockers:
        score -= 35

    return score


def calculate_component_scores(data: dict, indicators: dict, blockers: list) -> dict:
    safe_data = data or {}
    safe_indicators = indicators or {}
    codes = _blocker_codes(blockers)

    return {
        "capacidad_pago": _clamp_score(_score_payment_capacity(safe_indicators)),
        "endeudamiento": _clamp_score(_score_debt(safe_indicators)),
        "pie_ahorro": _clamp_score(_score_savings(safe_indicators)),
        "estabilidad_laboral": _clamp_score(_score_work_stability(safe_data)),
        "historial_pago": _clamp_score(_score_payment_history(safe_data)),
        "complemento_renta": _clamp_score(_score_income_complement(safe_data, codes)),
        "calidad_datos": _clamp_score(_score_data_quality(safe_data, codes)),
    }
