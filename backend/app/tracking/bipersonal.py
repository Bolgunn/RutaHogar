"""HU30 immutable contribution summary; no I/O, scoring rules or side effects."""

from copy import deepcopy
from math import isfinite

from ..scoring_engine.purchase_capacity import capacity_limits

VERSION = "hu30-bipersonal-v1"


def evaluation_type(snapshot, *, verified_revision=False):
    """Classify evidence, never infer historical consent from an amount or UUID."""
    data = snapshot or {}
    result = data.get("result") or data.get("result_snapshot") or {}
    indicators = result.get("financial_indicators") or {}
    state = data.get("input") or data.get("input_snapshot") or {}
    provenance = data.get("provenance") or {}
    source = (provenance.get("co_debtor_consent") or {}).get("complement_source")
    considered = indicators.get("ingreso_complementario_considerado")
    if verified_revision and source == "co_debtor_confirmed" and provenance.get("co_debtor_confirmation_id"):
        if isinstance(considered, (int, float)) and isfinite(considered):
            return "bipersonal_confirmed" if considered > 0 else "individual"
        return "unverifiable_origin"
    if provenance.get("co_debtor_confirmation_id") or source == "co_debtor_confirmed":
        return "unverifiable_origin"
    if state.get("complemento_renta"):
        return "declared_complement" if source == "lead_declared" else "unverifiable_origin"
    if considered not in (None, 0) or not state:
        return "unverifiable_origin"
    return "individual"


def contribution_summary(scoring_input, result, provenance, *, verified_revision, market_snapshot):
    """Two calls to the same unrounded ALG-9 model; only complementary money differs.

    Published indicators stay unchanged. Deltas use the engine's unrounded limits
    to avoid subtracting rounded UF displays, then convert with this exact UF.
    """
    summary = {
        "version": VERSION,
        "evaluation_type": evaluation_type({"input": scoring_input, "result": result, "provenance": provenance},
                                           verified_revision=verified_revision),
        "availability": "insufficient_data",
        "without_complement": {"purchase_capacity_uf": None, "income_capacity_uf": None},
        "delta": {"purchase_capacity_uf": None, "purchase_capacity_clp": None,
                  "income_capacity_uf": None, "income_capacity_clp": None},
    }
    if (not verified_revision or not provenance.get("co_debtor_confirmation_id")
            or (provenance.get("co_debtor_consent") or {}).get("complement_source") != "co_debtor_confirmed"):
        return summary
    without = deepcopy(scoring_input)
    without.update(ingreso_mensual_complementario=0, deuda_mensual_complementario=0)
    actual = capacity_limits(deepcopy(scoring_input), market_snapshot=deepcopy(market_snapshot))
    alone = capacity_limits(without, market_snapshot=deepcopy(market_snapshot))
    if actual["missing"] or alone["missing"]:
        return summary
    uf = actual["snapshot"]["uf_value_clp"]
    purchase_delta = actual["capacity"] - alone["capacity"]
    income_delta = actual["by_income"] - alone["by_income"]
    summary.update(availability="complete", without_complement={
        "purchase_capacity_uf": alone["capacity"], "income_capacity_uf": alone["by_income"]},
        delta={"purchase_capacity_uf": purchase_delta, "purchase_capacity_clp": purchase_delta * uf,
               "income_capacity_uf": income_delta, "income_capacity_clp": income_delta * uf})
    return summary
