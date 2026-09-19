"""Explicit property objective resolution for fit/benefits, never initial scoring."""

import math


def _positive_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) and number > 0 else 0.0


def resolve_property_value_clp(data: dict, uf_value_clp: float) -> dict:
    data, uf = data or {}, _positive_float(uf_value_clp)
    clp = _positive_float(data.get("property_value_clp"))
    if clp:
        return {"property_value_clp": clp, "property_value_uf": clp / uf if uf else 0.0, "property_value_source": "declared_clp", "uf_value_clp": uf}
    value = _positive_float(data.get("property_value_uf"))
    if value and uf:
        return {"property_value_clp": value * uf, "property_value_uf": value, "property_value_source": "declared_uf", "uf_value_clp": uf}
    value, unit = _positive_float(data.get("property_value")), str(data.get("property_value_unit") or "").lower()
    if value and unit == "clp":
        return {"property_value_clp": value, "property_value_uf": value / uf if uf else 0.0, "property_value_source": "property_value_clp_unit", "uf_value_clp": uf}
    if value and unit == "uf" and uf:
        return {"property_value_clp": value * uf, "property_value_uf": value, "property_value_source": "property_value_uf_unit", "uf_value_clp": uf}
    return {"property_value_clp": 0.0, "property_value_uf": 0.0, "property_value_source": "unknown", "uf_value_clp": uf}
