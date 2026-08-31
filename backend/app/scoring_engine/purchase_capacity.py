# ALG-9 — capacidad de compra preference-independent.
# Especificación normativa: docs/algorithms/ALG-9-purchase-capacity.md.
# No lee comuna_objetivo, property_value* ni dividendo_estimado: esa independencia
# es lo que permite responder "¿qué puede comprar?" y no solo "¿le alcanza para lo que pidió?".

from .constants import (
    EDAD_MAX_FIN_CREDITO,
    FOGAES_MAX_PROPERTY_UF,
    FOGAES_MAX_UF_CON_SUBSIDIO,
    FOGAES_MIN_PIE_RATIO,
    MATCHING_VERSION,
    PIE_RATIO_BASE,
    PLAZO_MINIMO_VIABLE_ANIOS,
    PLAZO_REFERENCIA_ANIOS,
    RATIO_CARGA_TOTAL_MAX,
    RATIO_DIVIDENDO_MAX,
    RATIO_DIVIDENDO_SALUDABLE,
    TASA_REFERENCIA_UF_ANUAL,
    VALOR_UF_CLP,
    VALOR_UF_FECHA,
)

MESES_POR_ANIO = 12


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


def _uf(value: float, uf_value_clp: float) -> float:
    return round(value / uf_value_clp, 1) if uf_value_clp > 0 else 0.0


def _deuda_total(data: dict) -> float:
    # A3: incluye la deuda del complemento, a diferencia de indicators.py.
    deuda_complementaria = _get_first(data, "deuda_mensual_complementario", "complemento_deuda_mensual")
    return _positive_float(data.get("deuda_mensual")) + _positive_float(deuda_complementaria)


def _dividendo_maximo_sostenible(ingreso_total: float, deuda_total: float) -> float:
    por_dividendo = RATIO_DIVIDENDO_MAX * ingreso_total
    por_carga_total = RATIO_CARGA_TOTAL_MAX * ingreso_total - deuda_total
    return max(0.0, min(por_dividendo, por_carga_total))


def _plazo_efectivo(data: dict):
    plazo_declarado = _positive_float(data.get("plazo_credito_hipotecario"))
    if plazo_declarado > 0:
        plazo, origen = plazo_declarado, "declarado"
    else:
        plazo, origen = float(PLAZO_REFERENCIA_ANIOS), "default"

    edad = _positive_float(data.get("edad"))
    age_term_verified = edad > 0
    if age_term_verified:
        plazo_por_edad = max(0.0, EDAD_MAX_FIN_CREDITO - edad)
        if plazo_por_edad < plazo:
            plazo, origen = plazo_por_edad, "capado_por_edad"

    return plazo, origen, age_term_verified


def _factor_anualidad(plazo_anios: float) -> float:
    n = plazo_anios * MESES_POR_ANIO
    tasa_mensual = TASA_REFERENCIA_UF_ANUAL / MESES_POR_ANIO
    if tasa_mensual == 0:
        return n
    return (1 - (1 + tasa_mensual) ** (-n)) / tasa_mensual


def _supuestos(plazo_anios: float, plazo_origen: str, age_term_verified: bool, uf_value_clp: float) -> dict:
    return {
        "tasa_anual_uf": TASA_REFERENCIA_UF_ANUAL,
        "plazo_anios": int(plazo_anios),
        "plazo_origen": plazo_origen,
        "pie_ratio": PIE_RATIO_BASE,
        "ratio_dividendo_max": RATIO_DIVIDENDO_MAX,
        "ratio_dividendo_saludable": RATIO_DIVIDENDO_SALUDABLE,
        "fogaes_tope_uf": FOGAES_MAX_PROPERTY_UF,
        "fogaes_tope_con_subsidio_uf": FOGAES_MAX_UF_CON_SUBSIDIO,
        "fogaes_pie_ratio": FOGAES_MIN_PIE_RATIO,
        "uf_value_clp": uf_value_clp,
        "uf_fecha": VALOR_UF_FECHA,
        "age_term_verified": age_term_verified,
        "plazo_bajo_minimo": plazo_anios < PLAZO_MINIMO_VIABLE_ANIOS,
        "version": MATCHING_VERSION,
    }


def _sin_datos(supuestos: dict) -> dict:
    return {
        "capacidad_compra_estimada_uf": None,
        "capacidad_compra_estimada_clp": None,
        "capacidad_por_renta_uf": None,
        "capacidad_por_pie_uf": None,
        "capacidad_asistida_uf": None,
        "restriccion_vinculante": None,
        "dividendo_maximo_sostenible_clp": None,
        "capacidad_status": "requires_info",
        "capacidad_supuestos": supuestos,
    }


def calculate_purchase_capacity(data: dict, indicators: dict) -> dict:
    safe_data = data or {}
    safe_indicators = indicators or {}

    uf_value_clp = _positive_float(safe_indicators.get("uf_value_clp")) or VALOR_UF_CLP
    plazo_anios, plazo_origen, age_term_verified = _plazo_efectivo(safe_data)
    supuestos = _supuestos(plazo_anios, plazo_origen, age_term_verified, uf_value_clp)

    ingreso_total = _positive_float(safe_indicators.get("ingreso_total"))
    if ingreso_total <= 0:
        return _sin_datos(supuestos)

    dividendo_maximo = _dividendo_maximo_sostenible(ingreso_total, _deuda_total(safe_data))
    principal_maximo_uf = (dividendo_maximo / uf_value_clp) * _factor_anualidad(plazo_anios)

    por_renta = principal_maximo_uf / (1 - PIE_RATIO_BASE)
    por_pie = _positive_float(safe_data.get("ahorro_disponible")) / PIE_RATIO_BASE / uf_value_clp
    capacidad = min(por_renta, por_pie)

    asistida = min(
        principal_maximo_uf / (1 - FOGAES_MIN_PIE_RATIO),
        _positive_float(safe_data.get("ahorro_disponible")) / FOGAES_MIN_PIE_RATIO / uf_value_clp,
    )

    return {
        "capacidad_compra_estimada_uf": round(capacidad, 1),
        "capacidad_compra_estimada_clp": int(round(capacidad * uf_value_clp)),
        "capacidad_por_renta_uf": round(por_renta, 1),
        "capacidad_por_pie_uf": round(por_pie, 1),
        "capacidad_asistida_uf": round(asistida, 1),
        "restriccion_vinculante": "renta" if por_renta <= por_pie else "pie",
        "dividendo_maximo_sostenible_clp": int(round(dividendo_maximo)),
        "capacidad_status": "ok" if capacidad > 0 else "sin_capacidad",
        "capacidad_supuestos": supuestos,
    }
