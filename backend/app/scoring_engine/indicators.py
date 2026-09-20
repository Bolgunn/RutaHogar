# Financial indicators layer for professional scoring versions.

from .constants import VALOR_UF_CLP


def _positive_float(value) -> float:
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return numeric_value if numeric_value > 0 else 0.0


def _ratio(numerator: float, denominator: float):
    if denominator <= 0:
        return None
    return numerator / denominator


def _is_truthy(value) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _get_first(data: dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _valid_complement_income(data: dict) -> float:
    if not _is_truthy(data.get("complemento_renta")):
        return 0.0

    comp_income = _positive_float(_get_first(data, "ingreso_mensual_complementario", "complemento_ingreso_mensual"))
    comp_debt_raw = _get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual")
    comp_delinquency = _get_first(data, "morosidad_complementario", "complemento_morosidad")
    comp_contract = _get_first(data, "tipo_contrato_complementario", "complemento_tipo_contrato")
    comp_continuity = _get_first(data, "continuidad_laboral_complementario", "complemento_continuidad_laboral")
    comp_relation = _get_first(data, "relacion_complementario", "complemento_relacion")

    if (
        comp_income > 0
        and comp_debt_raw not in (None, "")
        and comp_delinquency == "no"
        and comp_contract
        and comp_continuity
        and comp_relation not in {"amigo", "otro", None, ""}
    ):
        return comp_income

    return 0.0


def calculate_financial_indicators(data: dict, property_value_clp: float) -> dict:
    safe_data = data or {}
    property_value = _positive_float(property_value_clp)
    uf_value = _positive_float(safe_data.get("uf_value_clp")) or VALOR_UF_CLP
    ingreso_principal = _positive_float(safe_data.get("ingreso_mensual"))
    ingreso_complementario = _valid_complement_income(safe_data)
    ingreso = ingreso_principal + ingreso_complementario
    deuda = _positive_float(safe_data.get("deuda_mensual"))
    ahorro = _positive_float(safe_data.get("ahorro_disponible"))
    dividendo = _positive_float(safe_data.get("dividendo_estimado"))
    edad = _positive_float(safe_data.get("edad"))
    plazo_credito = _positive_float(safe_data.get("plazo_credito_hipotecario"))

    pie_minimo = property_value * 0.10 if property_value > 0 else 0.0
    pie_intermedio = property_value * 0.15 if property_value > 0 else 0.0
    pie_recomendado = property_value * 0.20 if property_value > 0 else 0.0
    total_burden_ratio = _ratio(deuda + dividendo, ingreso)

    result = {
        "property_value_clp": property_value,
        "property_value_uf": property_value / uf_value if property_value > 0 and uf_value > 0 else 0.0,
        "uf_value_clp": uf_value,
        "ingreso_total": ingreso,
        "ingreso_principal": ingreso_principal,
        "ingreso_complementario_considerado": ingreso_complementario,
        "ratio_dividendo_ingreso": _ratio(dividendo, ingreso),
        "ratio_deuda_ingreso": _ratio(deuda, ingreso),
        "ratio_carga_total": total_burden_ratio,
        "total_burden_ratio": total_burden_ratio,
        "pie_ratio": _ratio(ahorro, property_value) if property_value > 0 else 0.0,
        "pie_minimo_clp": pie_minimo,
        "pie_intermedio_clp": pie_intermedio,
        "pie_recomendado_clp": pie_recomendado,
        "cobertura_pie_minimo": ahorro / pie_minimo if pie_minimo > 0 else 0.0,
        "cobertura_pie_intermedio": ahorro / pie_intermedio if pie_intermedio > 0 else 0.0,
        "cobertura_pie_recomendado": ahorro / pie_recomendado if pie_recomendado > 0 else 0.0,
        "brecha_pie_minimo": max(pie_minimo - ahorro, 0.0) if pie_minimo > 0 else 0.0,
        "brecha_pie_intermedio": max(pie_intermedio - ahorro, 0.0) if pie_intermedio > 0 else 0.0,
        "brecha_pie_recomendado": max(pie_recomendado - ahorro, 0.0) if pie_recomendado > 0 else 0.0,
        "dividendo_estimado": dividendo,
        "dividendo_viable": max(0.0, (ingreso * 0.25) - deuda),
        "dividendo_viable_bruto": ingreso * 0.25,
        "ahorro_mensual_acelerado": max(0.0, ingreso * 0.20),
        "ahorro_mensual_conservador": max(0.0, ingreso * 0.10),
        "edad_fin_credito": edad + plazo_credito if edad > 0 and plazo_credito > 0 else None,
    }

    import math
    # Proyecciones de meses para la brecha de pie mínimo
    brecha = result["brecha_pie_minimo"]
    if brecha > 0:
        result["meses_acelerado"] = math.ceil(brecha / result["ahorro_mensual_acelerado"]) if result["ahorro_mensual_acelerado"] > 0 else 999
        result["meses_conservador"] = math.ceil(brecha / result["ahorro_mensual_conservador"]) if result["ahorro_mensual_conservador"] > 0 else 999
    else:
        result["meses_acelerado"] = 0
        result["meses_conservador"] = 0

    return result
