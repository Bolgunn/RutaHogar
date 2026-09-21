# Project compatibility layer for matching user profile and real-estate target.

from .constants import PROJECT_FIT_CLASSIFICATIONS

REQUIRED_INCOME_MULTIPLIER = 4
PROJECT_BLOCKER_CODES = frozenset({"pie_insuficiente", "dividendo_exigente", "edad_plazo_riesgoso"})

def _clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def _positive_float(value) -> float:
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return numeric_value if numeric_value > 0 else 0.0


def _blocker_codes(blockers: list) -> set:
    return {blocker.get("code") for blocker in blockers or [] if isinstance(blocker, dict)}


def _base_result(
    score: float,
    status: str,
    main_gap,
    required_income: float,
    income_gap: float,
    down_payment_gap: float,
    estimated_property_value_clp: float,
) -> dict:
    return {
        "score": _clamp_score(score),
        "classification": PROJECT_FIT_CLASSIFICATIONS[status],
        "status": status,
        "compatible": status == "compatible",
        "main_gap": main_gap,
        "required_income": round(required_income, 1),
        "income_gap": round(income_gap, 1),
        "down_payment_gap": round(down_payment_gap, 1),
        "estimated_property_value_clp": round(estimated_property_value_clp, 1),
    }


def _gap_ratio(gap: float, reference: float) -> float:
    if gap <= 0 or reference <= 0:
        return 0.0
    return min(gap / reference, 1.0)


def _main_gap(income_gap: float, required_income: float, down_payment_gap: float, estimated_property_value_clp: float):
    income_ratio = _gap_ratio(income_gap, required_income)
    down_payment_ratio = _gap_ratio(down_payment_gap, estimated_property_value_clp * 0.10)
    if income_ratio == 0 and down_payment_ratio == 0:
        return None
    return "income" if income_ratio >= down_payment_ratio else "down_payment"


def calculate_project_fit(data: dict, indicators: dict, blockers: list) -> dict:
    safe_data = data or {}
    safe_indicators = indicators or {}
    codes = _blocker_codes(blockers)

    estimated_property_value_clp = _positive_float(safe_indicators.get("property_value_clp"))
    ingreso_total = _positive_float(safe_indicators.get("ingreso_total"))
    if ingreso_total <= 0:
        ingreso_total = _positive_float(safe_data.get("ingreso_mensual"))
    dividendo_estimado = _positive_float(safe_data.get("dividendo_estimado"))

    if estimated_property_value_clp <= 0 or ingreso_total <= 0 or dividendo_estimado <= 0:
        return _base_result(
            score=0,
            status="requires_info",
            main_gap="data",
            required_income=dividendo_estimado * REQUIRED_INCOME_MULTIPLIER if dividendo_estimado > 0 else 0,
            income_gap=0,
            down_payment_gap=_positive_float(safe_indicators.get("brecha_pie_minimo")),
            estimated_property_value_clp=estimated_property_value_clp,
        )

    required_income = dividendo_estimado * REQUIRED_INCOME_MULTIPLIER
    income_gap = max(required_income - ingreso_total, 0.0)
    down_payment_gap = _positive_float(safe_indicators.get("brecha_pie_minimo"))

    score = 100.0
    score -= _gap_ratio(income_gap, required_income) * 45.0
    score -= _gap_ratio(down_payment_gap, estimated_property_value_clp * 0.10) * 35.0

    if "pie_insuficiente" in codes:
        score -= 15
    if "dividendo_exigente" in codes:
        score -= 15
    if "edad_plazo_riesgoso" in codes:
        score -= 10

    score = _clamp_score(score)
    main_gap = _main_gap(income_gap, required_income, down_payment_gap, estimated_property_value_clp)

    project_blockers = codes.intersection(PROJECT_BLOCKER_CODES)
    if income_gap == 0 and down_payment_gap == 0 and not project_blockers:
        status = "compatible"
    elif score >= 50:
        status = "near"
    else:
        status = "out_of_reach"

    return _base_result(
        score=score,
        status=status,
        main_gap=main_gap,
        required_income=required_income,
        income_gap=income_gap,
        down_payment_gap=down_payment_gap,
        estimated_property_value_clp=estimated_property_value_clp,
    )
