"""Pure ALG-9 calculation. No I/O, cache, clock or market fallback enters here."""

from __future__ import annotations

import math

from ..market_data.snapshot import SnapshotValidationError, validate_snapshot
from .constants import ALGORITHM_VERSION, EDAD_MAX_FIN_CREDITO, FOGAES_MAX_PROPERTY_UF, FOGAES_MAX_UF_CON_SUBSIDIO, FOGAES_MIN_PIE_RATIO, PLAZO_MINIMO_VIABLE_ANIOS, RATIO_CARGA_TOTAL_MAX, RATIO_DIVIDENDO_MAX, RATIO_DIVIDENDO_SALUDABLE
from .indicators import calculate_financial_scope

MESES_POR_ANIO = 12


def _positive_float(value) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0
    return value if math.isfinite(value) and value > 0 else 0.0


def _term(data: dict, snapshot: dict):
    declared = _positive_float(data.get("plazo_credito_hipotecario"))
    term, origin = (declared, "declarado") if declared else (snapshot["plazo_referencial_anios"], "default")
    age = _positive_float(data.get("edad"))
    verified = age > 0
    if verified and max(0.0, EDAD_MAX_FIN_CREDITO - age) < term:
        term, origin = max(0.0, EDAD_MAX_FIN_CREDITO - age), "capado_por_edad"
    return term, origin, verified


def _assumptions(snapshot, term=None, origin=None, verified=None, valid=False):
    source = snapshot.get("source", {}) if isinstance(snapshot, dict) else {}
    return {
        "tasa_anual_uf": snapshot.get("tasa_anual_uf") if valid else None,
        "plazo_anios": term if valid else None, "plazo_origen": origin if valid else None,
        "pie_ratio": (1 - snapshot["ltv_referencial"]) if valid else None,
        "ratio_dividendo_max": RATIO_DIVIDENDO_MAX, "ratio_dividendo_saludable": RATIO_DIVIDENDO_SALUDABLE,
        "fogaes_tope_uf": FOGAES_MAX_PROPERTY_UF, "fogaes_tope_con_subsidio_uf": FOGAES_MAX_UF_CON_SUBSIDIO,
        "fogaes_pie_ratio": FOGAES_MIN_PIE_RATIO, "uf_value_clp": snapshot.get("uf_value_clp") if valid else None,
        "uf_fecha": source.get("uf_value_clp", {}).get("effective_date") if valid else None,
        "age_term_verified": verified if valid else None, "plazo_bajo_minimo": term < PLAZO_MINIMO_VIABLE_ANIOS if valid else None,
        "version": ALGORITHM_VERSION, "market_snapshot": snapshot if isinstance(snapshot, dict) else None, "snapshot_valid": valid,
    }


def _requires_info(assumptions):
    return {
        "principal_maximo_uf": None, "principal_maximo_clp": None, "capacidad_por_renta_uf": None,
        "valor_vivienda_soportable_por_renta_clp": None, "pie_ratio": None, "capacidad_por_pie_uf": None,
        "capacidad_compra_estimada_uf": None, "capacidad_compra_estimada_clp": None, "capacidad_asistida_uf": None,
        "restriccion_vinculante": None, "dividendo_maximo_sostenible_clp": None,
        "capacidad_status": "requires_info", "capacidad_supuestos": assumptions,
    }


def calculate_purchase_capacity(data: dict, indicators: dict | None = None, market_snapshot: dict | None = None) -> dict:
    data = data or {}
    supplied = market_snapshot if market_snapshot is not None else data.get("market_snapshot")
    try:
        snapshot = validate_snapshot(supplied)
    except SnapshotValidationError:
        return _requires_info(_assumptions(supplied, valid=False))
    term, origin, verified = _term(data, snapshot)
    assumptions = _assumptions(snapshot, term, origin, verified, valid=True)
    scope = calculate_financial_scope(data)
    income = _positive_float((indicators or {}).get("ingreso_total")) or scope["ingreso_total"]
    if income <= 0:
        return _requires_info(assumptions)
    sustainable = max(0.0, min(RATIO_DIVIDENDO_MAX * income, RATIO_CARGA_TOTAL_MAX * income - scope["deuda_total"]))
    monthly_rate, months = snapshot["tasa_anual_uf"] / MESES_POR_ANIO, term * MESES_POR_ANIO
    factor = months if monthly_rate == 0 else (1 - (1 + monthly_rate) ** (-months)) / monthly_rate
    principal_clp_raw = sustainable * factor
    principal_uf_raw = principal_clp_raw / snapshot["uf_value_clp"]
    value_by_income = principal_clp_raw / snapshot["ltv_referencial"]
    by_income_uf = value_by_income / snapshot["uf_value_clp"]
    savings = _positive_float(data.get("ahorro_disponible"))
    by_savings_uf = savings / (1 - snapshot["ltv_referencial"]) / snapshot["uf_value_clp"]
    capacity_raw = min(by_income_uf, by_savings_uf)
    assisted_raw = min(principal_uf_raw / (1 - FOGAES_MIN_PIE_RATIO), savings / FOGAES_MIN_PIE_RATIO / snapshot["uf_value_clp"])
    return {
        "principal_maximo_uf": round(principal_uf_raw, 1), "principal_maximo_clp": int(round(principal_clp_raw)),
        "capacidad_por_renta_uf": round(by_income_uf, 1), "valor_vivienda_soportable_por_renta_clp": value_by_income,
        "pie_ratio": savings / value_by_income if value_by_income > 0 else 0.0, "capacidad_por_pie_uf": round(by_savings_uf, 1),
        "capacidad_compra_estimada_uf": round(capacity_raw, 1), "capacidad_compra_estimada_clp": int(round(capacity_raw * snapshot["uf_value_clp"])),
        "capacidad_asistida_uf": round(assisted_raw, 1), "restriccion_vinculante": "renta" if by_income_uf <= by_savings_uf else "pie",
        "dividendo_maximo_sostenible_clp": int(round(sustainable)), "capacidad_status": "ok" if capacity_raw > 0 else "sin_capacidad",
        "capacidad_supuestos": assumptions,
    }
