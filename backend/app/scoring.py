"""ALG-1 orchestration: resolve inputs outside this module, then calculate purely."""

from __future__ import annotations

from typing import Dict, List

from .ai import generate_commercial_guidance, generate_executive_summary, generate_user_explanation
from .market_data.snapshot import SnapshotValidationError, validate_snapshot
from .scoring_engine.blockers import detect_blockers
from .scoring_engine.commercial_priority import calculate_commercial_priority
from .scoring_engine.components import calculate_component_scores
from .scoring_engine.constants import SCORING_WEIGHTS
from .scoring_engine.explanations import build_deterministic_explanations
from .scoring_engine.housing_benefits import detect_housing_benefits
from .scoring_engine.improvement_plan import build_structured_improvement_plan
from .scoring_engine.indicators import calculate_financial_indicators
from .scoring_engine.project_fit import calculate_project_fit
from .scoring_engine.property_value import resolve_property_value_clp
from .scoring_engine.purchase_capacity import calculate_purchase_capacity

SCORING_VERSION = "1.2.0"


class MarketDataUnavailable(RuntimeError):
    """A score cannot be completed without a validated persisted snapshot."""


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _weighted(components: dict) -> float:
    return round(clamp(sum(float(components.get(name, 0) or 0) * weight for name, weight in SCORING_WEIGHTS.items())), 1)


def _classify(score: float) -> str:
    return "Alto" if score >= 75 else "Medio" if score >= 50 else "Bajo"


def _blocker_codes(blockers: list) -> set:
    return {item.get("code") for item in blockers if isinstance(item, dict)}


def _apply_caps(base: float, blockers: list) -> tuple[float, str]:
    caps = {
        "pie_insuficiente": (74.0, "El score final fue limitado porque el ahorro disponible no alcanza el pie mínimo estimado."),
        "dividendo_exigente": (69.0, "El score final fue limitado porque el dividendo estimado es exigente frente al ingreso declarado."),
        "carga_total_alta": (59.0, "El score final fue limitado porque la carga financiera total estimada es alta."),
        "morosidad_vigente": (59.0, "El score final fue limitado porque existe morosidad vigente declarada."),
    }
    active = [value for code, value in caps.items() if code in _blocker_codes(blockers)]
    if not active:
        return base, ""
    cap, reason = min(active, key=lambda item: item[0])
    return round(min(base, cap), 1), reason


def _final_classification(score: float, blockers: list) -> tuple[str, str]:
    if "complemento_incompleto" in _blocker_codes(blockers):
        return "Requiere antecedentes", "La clasificación requiere antecedentes adicionales por complemento de renta incompleto."
    return _classify(score), "La clasificación final se calculó desde el score ajustado por antecedentes detectados."


def _main_blocker(blockers: list):
    ranks = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
    return max(blockers, key=lambda item: ranks.get(item.get("severity"), 0)) if blockers else None


def _legacy_findings(data: dict, blockers: list) -> tuple[list, list, list]:
    """Narrative findings remain additive metadata; no finding can alter the numeric score."""
    codes = _blocker_codes(blockers)
    positives, risks, recommendations = [], [], []
    if "pie_insuficiente" not in codes:
        positives.append("Ahorro evaluado respecto de la capacidad financiera estimada.")
    if data.get("declara_patrimonio"):
        positives.append("Patrimonio declarado como respaldo patrimonial adicional")
    for blocker in blockers:
        risks.append(blocker.get("description") or blocker.get("title"))
    if data.get("tipo_contrato") == "plazo_fijo":
        risks.append("El contrato a plazo fijo puede requerir mayor revisión financiera.")
    if data.get("morosidad_complementario") == "si" or data.get("complemento_morosidad") == "si":
        risks.append("La persona complementaria declara morosidad y no mejora la evaluación.")
    if data.get("relacion_complementario") in {"amigo", "otro"} or data.get("complemento_relacion") in {"amigo", "otro"}:
        risks.append("La relación declarada para complementar renta puede requerir mayor respaldo.")
    if "pie_insuficiente" in codes:
        recommendations.append({"text": "Aumentar ahorro para el pie estimado.", "benefit": "Reducir la brecha de ahorro frente a la capacidad financiera."})
    if codes.intersection({"deuda_actual_alta", "carga_total_alta"}):
        recommendations.append({"text": "Reducir deuda mensual antes de avanzar.", "benefit": "Aumentar la holgura para un dividendo sostenible."})
    if "morosidad_vigente" in codes:
        recommendations.append({"text": "Regularizar o aclarar morosidad antes de avanzar.", "benefit": "Evitar que antecedentes vigentes limiten la evaluación."})
    return positives, risks, recommendations


def _legacy_risk_codes(data: dict, blockers: list) -> set:
    """Compatibility aliases are explanatory metadata, never aggregation inputs."""
    codes = _blocker_codes(blockers)
    aliases = set()
    if data.get("morosidad_actual") == "si": aliases.add("morosidad_alta")
    if "deuda_actual_alta" in codes: aliases.add("deuda_alta")
    if "pie_insuficiente" in codes:
        aliases.add("ahorro_bajo")
        if any(data.get(key) not in (None, "") for key in ("property_value", "property_value_uf", "property_value_clp")):
            aliases.add("precio_objetivo")
    if data.get("tipo_contrato") == "independiente": aliases.add("contrato_independiente")
    if data.get("continuidad_laboral") == "menos_6_meses": aliases.add("continuidad_baja")
    return aliases


def calculate_score(data: Dict, include_ai: bool = True, market_snapshot: dict | None = None) -> Dict:
    """Calculate a completed score from an explicit, already resolved market snapshot."""
    data = dict(data or {})
    supplied_snapshot = market_snapshot if market_snapshot is not None else data.get("market_snapshot")
    try:
        snapshot = validate_snapshot(supplied_snapshot)
    except SnapshotValidationError as exc:
        raise MarketDataUnavailable("No fue posible obtener una referencia de mercado válida para completar la evaluación. Intenta nuevamente más tarde.") from exc

    # ALG-1 order: shared scope -> ALG-9 -> V-based savings indicators -> blockers/components.
    preliminary = calculate_financial_indicators(data, 0.0, snapshot["uf_value_clp"])
    capacity = calculate_purchase_capacity(data, preliminary, snapshot)
    value_reference = capacity["valor_vivienda_soportable_por_renta_clp"]
    financial = calculate_financial_indicators(data, value_reference or 0.0, snapshot["uf_value_clp"])
    financial.update(capacity)
    blockers = detect_blockers(data, financial)
    components = calculate_component_scores(data, financial, blockers)
    base_score = _weighted(components)
    adjusted_score, adjustment_reason = _apply_caps(base_score, blockers)
    classification, classification_reason = _final_classification(adjusted_score, blockers)

    # Objectives are intentionally a separate view for project fit and benefits.
    objective = resolve_property_value_clp(data, snapshot["uf_value_clp"])
    objective_indicators = calculate_financial_indicators(data, objective["property_value_clp"], snapshot["uf_value_clp"])
    project_fit = calculate_project_fit(data, objective_indicators, blockers)
    structured_plan = build_structured_improvement_plan(data, financial, blockers)
    positives, risks, recommendations = _legacy_findings(data, blockers)
    priority = calculate_commercial_priority(classification, project_fit, blockers, adjusted_score, data)
    result = {
        "score": adjusted_score, "base_score": base_score, "adjusted_score": adjusted_score,
        "score_adjustment_reason": adjustment_reason, "classification": classification,
        "original_classification": _classify(base_score), "classification_reason": classification_reason,
        "positive_indicators": positives, "risks": risks, "recommendations": recommendations,
        "risk_codes": sorted(_blocker_codes(blockers) | _legacy_risk_codes(data, blockers)), "component_scores": components,
        "algorithm_version": SCORING_VERSION, "financial_indicators": financial, "blockers": blockers,
        "main_blocker": _main_blocker(blockers), "property_value_resolution": objective,
        "project_fit": project_fit, "commercial_priority_detail": priority, "structured_improvement_plan": structured_plan,
        "housing_benefits": detect_housing_benefits(data, objective_indicators),
    }
    result.update(build_deterministic_explanations(result))
    if include_ai:
        shared = dict(classification=classification, score=adjusted_score, positive_indicators=positives, risks=risks)
        if explanation := generate_user_explanation(**shared, financial_indicators=financial, blockers=blockers, main_blocker=result["main_blocker"], project_fit=project_fit, commercial_priority_detail=priority, structured_improvement_plan=structured_plan):
            result["ai_explanation"] = explanation
        if summary := generate_executive_summary(**shared, financial_indicators=financial, blockers=blockers, main_blocker=result["main_blocker"], project_fit=project_fit, commercial_priority_detail=priority, structured_improvement_plan=structured_plan):
            result["executive_summary"] = summary
        if guidance := generate_commercial_guidance(**shared, recommendations=recommendations, financial_indicators=financial, blockers=blockers, main_blocker=result["main_blocker"], project_fit=project_fit, commercial_priority_detail=priority, structured_improvement_plan=structured_plan):
            result["commercial_guidance"] = guidance
    result["improvement_plan"] = structured_plan
    return result
