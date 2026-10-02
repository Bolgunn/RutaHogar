"""Pure ALG-9 purchase capacity calculation over an explicit BCCh snapshot."""

from __future__ import annotations

import math

from ..market_data.snapshot import SnapshotValidationError, validate_snapshot
from .constants import (
    ALGORITHM_VERSION, EDAD_MAX_FIN_CREDITO, FOGAES_MAX_PROPERTY_UF,
    FOGAES_MAX_UF_CON_SUBSIDIO, FOGAES_MIN_PIE_RATIO,
    PLAZO_MINIMO_VIABLE_ANIOS, RATIO_CARGA_TOTAL_MAX,
    RATIO_DIVIDENDO_MAX, RATIO_DIVIDENDO_SALUDABLE,
)
from .indicators import calculate_financial_scope

MESES_POR_ANIO = 12


def _positive_float(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) and number > 0 else 0.0


def _term(data: dict, snapshot: dict) -> tuple[float, str, bool]:
    declared = _positive_float(data.get("plazo_credito_hipotecario"))
    term, origin = (declared, "declarado") if declared else (snapshot["plazo_referencial_anios"], "default")
    age = _positive_float(data.get("edad"))
    verified = age > 0
    if verified and max(0.0, EDAD_MAX_FIN_CREDITO - age) < term:
        term, origin = max(0.0, EDAD_MAX_FIN_CREDITO - age), "capado_por_edad"
    return term, origin, verified


def dividend_limits(ingreso_total: float, deuda_total: float) -> tuple[float, float]:
    """Unrounded ALG-9 dividend limits, shared with the HU13 boundary adapter."""
    return RATIO_DIVIDENDO_MAX * ingreso_total, RATIO_CARGA_TOTAL_MAX * ingreso_total - deuda_total


def _annuity_factor(term_years: float, annual_rate: float) -> float:
    months, monthly_rate = term_years * MESES_POR_ANIO, annual_rate / MESES_POR_ANIO
    return months if monthly_rate == 0 else (1 - (1 + monthly_rate) ** (-months)) / monthly_rate


def _assumptions(snapshot, term=None, origin=None, verified=None, valid=False) -> dict:
    source = snapshot.get("source", {}) if isinstance(snapshot, dict) else {}
    return {
        "tasa_anual_uf": snapshot.get("tasa_anual_uf") if valid else None,
        "plazo_anios": term if valid else None,
        "plazo_origen": origin if valid else None,
        "pie_ratio": (1 - snapshot["ltv_referencial"]) if valid else None,
        "ratio_dividendo_max": RATIO_DIVIDENDO_MAX,
        "ratio_dividendo_saludable": RATIO_DIVIDENDO_SALUDABLE,
        "fogaes_tope_uf": FOGAES_MAX_PROPERTY_UF,
        "fogaes_tope_con_subsidio_uf": FOGAES_MAX_UF_CON_SUBSIDIO,
        "fogaes_pie_ratio": FOGAES_MIN_PIE_RATIO,
        "uf_value_clp": snapshot.get("uf_value_clp") if valid else None,
        "uf_fecha": source.get("uf_value_clp", {}).get("effective_date") if valid else None,
        "age_term_verified": verified if valid else None,
        "plazo_bajo_minimo": term < PLAZO_MINIMO_VIABLE_ANIOS if valid else None,
        "version": ALGORITHM_VERSION,
        "market_snapshot": snapshot if isinstance(snapshot, dict) else None,
        "snapshot_valid": valid,
    }


def _requires_info(assumptions: dict) -> dict:
    return {
        "principal_maximo_uf": None, "principal_maximo_clp": None,
        "capacidad_por_renta_uf": None, "valor_vivienda_soportable_por_renta_clp": None,
        "pie_ratio": None, "capacidad_por_pie_uf": None,
        "capacidad_compra_estimada_uf": None, "capacidad_compra_estimada_clp": None,
        "capacidad_asistida_uf": None, "restriccion_vinculante": None,
        "dividendo_maximo_sostenible_clp": None, "capacidad_status": "requires_info",
        "capacidad_supuestos": assumptions,
    }


def capacity_limits(data: dict, indicators: dict | None = None, market_snapshot: dict | None = None) -> dict:
    """Return the one unrounded BCCh/ALG-9 model used by score and HU13 roots."""
    data, indicators = data or {}, indicators or {}
    supplied = market_snapshot if market_snapshot is not None else data.get("market_snapshot")
    try:
        snapshot = validate_snapshot(supplied)
    except SnapshotValidationError:
        return {"missing": True, "supuestos": _assumptions(supplied, valid=False)}

    term, origin, verified = _term(data, snapshot)
    assumptions = _assumptions(snapshot, term, origin, verified, valid=True)
    scope = calculate_financial_scope(data)
    income = _positive_float(indicators.get("ingreso_total")) or scope["ingreso_total"]
    debt = scope["deuda_total"]
    if income <= 0:
        return {"missing": True, "supuestos": assumptions}

    by_dividend, by_burden = dividend_limits(income, debt)
    sustainable = max(0.0, min(by_dividend, by_burden))
    principal_clp = sustainable * _annuity_factor(term, snapshot["tasa_anual_uf"])
    principal_uf = principal_clp / snapshot["uf_value_clp"]
    value_by_income = principal_clp / snapshot["ltv_referencial"]
    by_income = value_by_income / snapshot["uf_value_clp"]
    savings = _positive_float(data.get("ahorro_disponible"))
    by_savings = savings / (1 - snapshot["ltv_referencial"]) / snapshot["uf_value_clp"]
    assisted_by_income = principal_uf / (1 - FOGAES_MIN_PIE_RATIO)
    assisted_by_savings = savings / FOGAES_MIN_PIE_RATIO / snapshot["uf_value_clp"]
    return {
        "missing": False, "supuestos": assumptions, "income": income, "debt": debt,
        "by_dividend": by_dividend, "by_burden": by_burden, "sustainable": sustainable,
        "principal_clp": principal_clp, "principal_uf": principal_uf,
        "value_by_income": value_by_income, "by_income": by_income, "by_savings": by_savings,
        "capacity": min(by_income, by_savings),
        "assisted_by_income": assisted_by_income, "assisted_by_savings": assisted_by_savings,
        "assisted": min(assisted_by_income, assisted_by_savings),
        "savings": savings, "snapshot": snapshot,
    }


def capacity_rule_margins(data: dict, indicators: dict | None = None, market_snapshot: dict | None = None) -> tuple:
    """Branch margins from the same unrounded model as ``calculate_purchase_capacity``."""
    limits = capacity_limits(data, indicators, market_snapshot)
    if limits["missing"]:
        return ()
    return (
        limits["by_dividend"], limits["by_burden"],
        limits["by_dividend"] - limits["by_burden"],
        limits["by_income"] - limits["by_savings"],
        limits["assisted_by_income"] - limits["assisted_by_savings"],
    )


def calculate_purchase_capacity(data: dict, indicators: dict | None = None, market_snapshot: dict | None = None) -> dict:
    limits = capacity_limits(data, indicators, market_snapshot)
    if limits["missing"]:
        return _requires_info(limits["supuestos"])
    snapshot = limits["snapshot"]
    capacity, by_income, by_savings = limits["capacity"], limits["by_income"], limits["by_savings"]
    return {
        "principal_maximo_uf": round(limits["principal_uf"], 1),
        "principal_maximo_clp": int(round(limits["principal_clp"])),
        "capacidad_por_renta_uf": round(by_income, 1),
        "valor_vivienda_soportable_por_renta_clp": limits["value_by_income"],
        "pie_ratio": limits["savings"] / limits["value_by_income"] if limits["value_by_income"] > 0 else 0.0,
        "capacidad_por_pie_uf": round(by_savings, 1),
        "capacidad_compra_estimada_uf": round(capacity, 1),
        "capacidad_compra_estimada_clp": int(round(capacity * snapshot["uf_value_clp"])),
        "capacidad_asistida_uf": round(limits["assisted"], 1),
        "restriccion_vinculante": "renta" if by_income <= by_savings else "pie",
        "dividendo_maximo_sostenible_clp": int(round(limits["sustainable"])),
        "capacidad_status": "ok" if capacity > 0 else "sin_capacidad",
        "capacidad_supuestos": limits["supuestos"],
    }
