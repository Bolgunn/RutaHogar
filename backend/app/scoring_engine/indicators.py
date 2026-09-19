"""Pure shared financial scope and indicators for ALG-1/ALG-9."""

from __future__ import annotations

import math


def _positive_float(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) and number > 0 else 0.0


def _get_first(data: dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _is_truthy(value) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _valid_complement_income(data: dict) -> float:
    if not _is_truthy(data.get("complemento_renta")):
        return 0.0
    income = _positive_float(_get_first(data, "ingreso_mensual_complementario", "complemento_ingreso_mensual"))
    debt = _get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual")
    if (
        income > 0
        and debt not in (None, "")
        and _get_first(data, "morosidad_complementario", "complemento_morosidad") == "no"
        and _get_first(data, "tipo_contrato_complementario", "complemento_tipo_contrato")
        and _get_first(data, "continuidad_laboral_complementario", "complemento_continuidad_laboral")
        and _get_first(data, "relacion_complementario", "complemento_relacion") not in {"amigo", "otro", None, ""}
    ):
        return income
    return 0.0


def calculate_financial_scope(data: dict) -> dict:
    """Use exactly one acceptance decision for complementary income and debt."""
    data = data or {}
    principal_income = _positive_float(data.get("ingreso_mensual"))
    principal_debt = _positive_float(data.get("deuda_mensual"))
    complementary_income = _valid_complement_income(data)
    complementary_debt = 0.0
    if complementary_income > 0:
        complementary_debt = _positive_float(_get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual"))
    return {
        "ingreso_principal": principal_income,
        "ingreso_complementario_considerado": complementary_income,
        "ingreso_total": principal_income + complementary_income,
        "deuda_principal": principal_debt,
        "deuda_complementaria_considerada": complementary_debt,
        "deuda_total": principal_debt + complementary_debt,
    }


def _ratio(numerator: float, denominator: float):
    return numerator / denominator if denominator > 0 else None


def calculate_financial_indicators(data: dict, property_value_clp: float = 0.0, uf_value_clp: float = 0.0) -> dict:
    """Build pure indicators using the supplied V, not a commune or target price."""
    data = data or {}
    scope = calculate_financial_scope(data)
    value, uf = _positive_float(property_value_clp), _positive_float(uf_value_clp)
    savings, dividend = _positive_float(data.get("ahorro_disponible")), _positive_float(data.get("dividendo_estimado"))
    age, declared_term = _positive_float(data.get("edad")), _positive_float(data.get("plazo_credito_hipotecario"))
    minimum, intermediate, recommended = value * .10, value * .15, value * .20
    income = scope["ingreso_total"]
    result = {
        **scope, "property_value_clp": value, "property_value_uf": value / uf if value and uf else 0.0, "uf_value_clp": uf,
        "ratio_dividendo_ingreso": _ratio(dividend, income), "ratio_deuda_ingreso": _ratio(scope["deuda_total"], income),
        "ratio_carga_total": _ratio(scope["deuda_total"] + dividend, income), "total_burden_ratio": _ratio(scope["deuda_total"] + dividend, income),
        "pie_ratio": savings / value if value else 0.0, "pie_minimo_clp": minimum, "pie_intermedio_clp": intermediate, "pie_recomendado_clp": recommended,
        "cobertura_pie_minimo": savings / minimum if minimum else 0.0, "cobertura_pie_intermedio": savings / intermediate if intermediate else 0.0,
        "cobertura_pie_recomendado": savings / recommended if recommended else 0.0,
        "brecha_pie_minimo": max(minimum - savings, 0.0), "brecha_pie_intermedio": max(intermediate - savings, 0.0), "brecha_pie_recomendado": max(recommended - savings, 0.0),
        "dividendo_estimado": dividend, "dividendo_viable": max(0.0, income * .25 - scope["deuda_total"]), "dividendo_viable_bruto": income * .25,
        "ahorro_mensual_acelerado": max(0.0, income * .20), "ahorro_mensual_conservador": max(0.0, income * .10),
        "edad_fin_credito": age + declared_term if age and declared_term else None,
    }
    gap = result["brecha_pie_minimo"]
    result["meses_acelerado"] = math.ceil(gap / result["ahorro_mensual_acelerado"]) if gap and result["ahorro_mensual_acelerado"] else 0
    result["meses_conservador"] = math.ceil(gap / result["ahorro_mensual_conservador"]) if gap and result["ahorro_mensual_conservador"] else 0
    return result
