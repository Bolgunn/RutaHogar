"""ALG-19 R0–R8 — cases from docs/algorithms/ALG-19-cases.json plus the algorithm's invariants."""

import itertools
import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring_engine.commercial_criteria import (
    CRITERIA_KEYS,
    diff_criterios,
    merge_criterios,
    normalize_criterios,
    validate_criterios,
)
from app.scoring_engine.commercial_priority import (
    calculate_commercial_priority,
    configured_priority_for_evaluation,
    explain_commercial_priority,
)
from app.scoring_engine.constants import (
    COMMERCIAL_ACTIONS,
    COMMERCIAL_CRITERIA_OPTIONS,
    DEFAULT_COMMERCIAL_CRITERIOS,
)
from test_score_professional import base_payload, post_score

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "docs" / "algorithms" / "ALG-19-cases.json").read_text(encoding="utf-8")
)


def _pre_hu21_priority(classification, project_fit, blockers, score, data=None):
    """The engine as it was before HU 21, frozen verbatim as invariant 1's reference."""
    safe_project_fit = project_fit or {}
    safe_data = data or {}
    codes = {b.get("code") for b in blockers or [] if isinstance(b, dict)}
    fit_classification = safe_project_fit.get("classification")
    fit_status = safe_project_fit.get("status")
    near_term = safe_data.get("plazo_compra") in {"inmediato", "0_3_meses", "3_a_6_meses", "3_6_meses"}
    seen = safe_data.get("tiene_propiedad_vista") is True

    def p(key, reason, crm):
        return {"level": COMMERCIAL_ACTIONS[key], "action": COMMERCIAL_ACTIONS[key], "reason": reason, "send_to_crm": crm}

    if "complemento_incompleto" in codes:
        return p("request_info", "Faltan antecedentes del complemento de renta antes de priorizar comercialmente.", False)
    if codes.intersection({"morosidad_vigente", "carga_total_alta"}):
        return p("do_not_route", "El lead presenta bloqueadores financieros críticos y no debe derivarse todavía.", False)
    if fit_status == "requires_info" or fit_classification == "Requiere antecedentes":
        return p("request_info", "Faltan antecedentes para evaluar la compatibilidad con el objetivo inmobiliario.", False)
    if classification == "Alto" and safe_project_fit.get("compatible") is True:
        if near_term and seen:
            return p("contact_now", "Lead con alta preparación financiera, objetivo compatible, compra pronta y propiedad o proyecto visto.", True)
        return p("contact_now", "Lead con alta preparación financiera y compatible con el objetivo inmobiliario.", True)
    if classification == "Medio" and fit_classification in {"Compatible", "Cercano"}:
        if near_term or seen:
            return p("contact_with_review", "Lead con potencial comercial y señales de intención de compra; requiere revisión antes de avanzar.", True)
        return p("contact_with_review", "Lead con potencial comercial, pero requiere revisión antes de avanzar.", True)
    if score >= 70 and fit_classification == "Fuera de alcance":
        return p("reorient", "Lead financieramente interesante, pero el objetivo inmobiliario declarado está fuera de alcance.", False)
    if classification == "Bajo":
        return p("nurture", "Lead con baja preparación financiera actual; conviene nutrirlo con un plan de mejora.", False)
    return p("request_info", "Se requieren más antecedentes antes de definir una prioridad comercial.", False)


def _args(case):
    data = case["input"]
    return data["classification"], data["project_fit"], data["blockers"], data["score"], data["data"]


def _subset(priority):
    return {key: priority[key] for key in ("action", "reason", "send_to_crm")}


def all_valid_configurations():
    sets = [COMMERCIAL_CRITERIA_OPTIONS[key] for key in CRITERIA_KEYS[:4]]
    plazos = COMMERCIAL_CRITERIA_OPTIONS["senales.plazos"]
    plazo_subsets = [list(c) for n in range(1, len(plazos) + 1) for c in itertools.combinations(plazos, n)]
    for ahora_cls, ahora_fit, rev_cls, rev_fit in itertools.product(*sets):
        for subset, vista, subir, umbral in itertools.product(
            plazo_subsets,
            COMMERCIAL_CRITERIA_OPTIONS["senales.propiedad_vista"],
            COMMERCIAL_CRITERIA_OPTIONS["subir_con_senales"],
            COMMERCIAL_CRITERIA_OPTIONS["umbral_reorientar"],
        ):
            if subir == 2 and not vista:
                continue
            yield {
                "contactar_ahora": {"clasificaciones": ahora_cls, "compatibilidades": ahora_fit},
                "contactar_con_revision": {"clasificaciones": rev_cls, "compatibilidades": rev_fit},
                "senales": {"plazos": subset, "propiedad_vista": vista},
                "subir_con_senales": subir,
                "umbral_reorientar": umbral,
                "proyectos_prioritarios": [],
                "orden_desempate": "afinidad",
            }


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_case(case):
    criterios = case["input"]["criterios"]
    if criterios is not None:
        assert validate_criterios(merge_criterios(criterios)) == []

    priority = explain_commercial_priority(*_args(case), criterios=criterios)

    for key, expected in case["expect"].items():
        assert priority[key] == expected, key
    assert priority["action"] == COMMERCIAL_ACTIONS[priority["action_key"]]


@pytest.mark.parametrize(
    "case", CASES["invalid_criterios"], ids=[case["name"] for case in CASES["invalid_criterios"]]
)
def test_invalid_criterios_rejected_per_key(case):
    errors = validate_criterios(merge_criterios(case["criterios"]), tenant_project_states={})
    assert {error["key"] for error in errors} == {case["error_key"]}


@pytest.mark.parametrize(
    "case",
    [case for case in CASES["cases"] if "default" in case.get("tags", [])],
    ids=lambda case: case["name"],
)
def test_invariant_1_defaults_reproduce_the_pre_hu21_engine_on_cases(case):
    legacy = _pre_hu21_priority(*_args(case))
    assert calculate_commercial_priority(*_args(case)) == legacy
    assert _subset(explain_commercial_priority(*_args(case), criterios=None)) == _subset(legacy)
    assert _subset(explain_commercial_priority(*_args(case), criterios=DEFAULT_COMMERCIAL_CRITERIOS)) == _subset(legacy)


SCORE_PAYLOADS = [
    base_payload(),
    base_payload(morosidad_actual="si", monto_morosidad=1_200_000, antiguedad_morosidad="3_a_12_meses"),
    base_payload(ahorro_disponible=1_000_000),
    base_payload(deuda_mensual=3_000_000),
    base_payload(edad=60, plazo_credito_hipotecario=15),
    base_payload(ingreso_mensual=1_500_000, dividendo_estimado=600_000),
    base_payload(property_value_clp=400_000_000),
    base_payload(tipo_contrato="independiente", continuidad_laboral="menos_6_meses"),
    base_payload(plazo_compra="0_3_meses", tiene_propiedad_vista=True),
    base_payload(ingreso_mensual=2_000_000, plazo_compra="3_a_6_meses", property_value_clp=150_000_000),
]


@pytest.mark.parametrize("payload", SCORE_PAYLOADS)
def test_invariant_1_post_score_priority_is_unchanged(payload):
    result = post_score(payload)
    detail = result["commercial_priority_detail"]
    args = (
        result["classification"], result["project_fit"], result["blockers"], result["adjusted_score"], payload,
    )

    assert set(detail) == {"level", "action", "reason", "send_to_crm"}
    assert detail == _pre_hu21_priority(*args)
    assert _subset(explain_commercial_priority(*args, criterios=DEFAULT_COMMERCIAL_CRITERIOS)) == _subset(detail)


def test_invariant_2_and_3_every_valid_configuration():
    configurations = list(all_valid_configurations())
    # The space is the product of the R0 options minus subir_con_senales = 2 without
    # propiedad_vista. ALG-19 states 7 392; the option table gives 2·2·2·2·7·2·3·6 = 4 032
    # minus 672 = 3 360 (the 7 392 also counts orden_desempate). Reported for an ALG amendment.
    sets = 2 ** 4
    plazo_subsets = 2 ** len(COMMERCIAL_CRITERIA_OPTIONS["senales.plazos"]) - 1
    umbrales = len(COMMERCIAL_CRITERIA_OPTIONS["umbral_reorientar"])
    assert len(configurations) == sets * plazo_subsets * umbrales * (2 * 3 - 1)

    locked = [case for case in CASES["cases"] if "locked" in case.get("tags", [])]
    defaults = {case["name"]: explain_commercial_priority(*_args(case))["action_key"] for case in locked}
    for criterios in configurations:
        assert validate_criterios(criterios) == []
        for case in locked:
            priority = explain_commercial_priority(*_args(case), criterios=criterios)
            assert priority["action_key"] == defaults[case["name"]]
            assert priority["fixed_rule"] is True
        for case in CASES["cases"]:
            assert explain_commercial_priority(*_args(case), criterios=criterios)["action_key"] in COMMERCIAL_ACTIONS


def _row(case):
    classification, project_fit, blockers, score, data = _args(case)
    return {
        "id": "evaluation-1",
        "user_id": "lead-1",
        "financial_data": {
            "input": data,
            "result": {
                "classification": classification,
                "adjusted_score": score,
                "project_fit": project_fit,
                "blockers": blockers,
                "commercial_priority_detail": _pre_hu21_priority(classification, project_fit, blockers, score, data),
            },
        },
    }


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_invariant_4_and_5_read_only_and_deterministic(case):
    row = _row(case)
    before = deepcopy(row)

    first = configured_priority_for_evaluation(row, case["input"]["criterios"], 3)
    second = configured_priority_for_evaluation(row, case["input"]["criterios"], 3)

    assert row == before
    assert first == second
    assert first["commercial_priority_configured"]["config_version"] == 3
    engine_key = explain_commercial_priority(*_args(case))["action_key"]
    assert first["differs_from_engine"] is (first["commercial_priority_configured"]["action_key"] != engine_key)


def test_defaults_never_differ_from_the_stored_engine_priority():
    for case in CASES["cases"]:
        assert configured_priority_for_evaluation(_row(case), None, None)["differs_from_engine"] is False


def test_saved_configuration_carries_every_key_and_sorted_sets():
    partial = {"senales": {"plazos": ["inmediato", "3_a_6_meses", "inmediato"], "propiedad_vista": True}}
    normalized = normalize_criterios(partial)
    assert validate_criterios(normalized) == []
    assert normalized["senales"]["plazos"] == ["3_a_6_meses", "inmediato"]
    assert validate_criterios({"umbral_reorientar": 70})[0]["code"] in {"missing_key"}


def test_priority_projects_must_belong_to_the_tenant_and_not_be_agotado():
    criterios = normalize_criterios({"proyectos_prioritarios": ["a", "b"]})
    assert validate_criterios(criterios, {"a": "disponible", "b": "en_construccion"}) == []
    assert validate_criterios(criterios, {"a": "disponible"}) == [
        {"key": "proyectos_prioritarios", "code": "project_not_found"}
    ]
    assert validate_criterios(criterios, {"a": "disponible", "b": "agotado"}) == [
        {"key": "proyectos_prioritarios", "code": "project_agotado"}
    ]


def test_booleans_are_not_accepted_as_numbers():
    criterios = normalize_criterios(None)
    criterios["subir_con_senales"] = True
    assert validate_criterios(criterios) == [{"key": "subir_con_senales", "code": "invalid_type"}]


def test_diff_lists_only_changed_keys():
    before = normalize_criterios(None)
    after = normalize_criterios({"umbral_reorientar": 75, "subir_con_senales": 1})
    assert diff_criterios(before, after) == [
        {"key": "subir_con_senales", "before": 0, "after": 1},
        {"key": "umbral_reorientar", "before": 70, "after": 75},
    ]
