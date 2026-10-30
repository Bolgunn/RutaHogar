# Commercial priority layer, separate from the financial score itself.
# ALG-19: the same fixed chain, parametrized by an inmobiliaria's criteria. POST /score always
# runs it with the defaults, which reproduce the pre-HU21 engine exactly (invariant 1).

from .commercial_criteria import normalize_criterios
from .constants import COMMERCIAL_ACTIONS, COMMERCIAL_PRIORITY_ALG_VERSION, PURCHASE_TERM_ALIASES

ENGINE_KEYS = ("level", "action", "reason", "send_to_crm")
NO_PRIORITY = "sin_prioridad"
_KEY_BY_LABEL = {label: key for key, label in COMMERCIAL_ACTIONS.items()}


def _blocker_codes(blockers: list) -> set:
    return {blocker.get("code") for blocker in blockers or [] if isinstance(blocker, dict)}


def _priority(action_key: str, reason: str, send_to_crm: bool, *, promoted=False, fixed_rule=False) -> dict:
    action = COMMERCIAL_ACTIONS[action_key]
    return {
        "level": action,
        "action": action,
        "reason": reason,
        "send_to_crm": send_to_crm,
        "action_key": action_key,
        "promoted": promoted,
        "fixed_rule": fixed_rule,
        "alg_version": COMMERCIAL_PRIORITY_ALG_VERSION,
    }


def _signal_count(data: dict, senales: dict) -> int:
    plazo = data.get("plazo_compra")
    senal_plazo = PURCHASE_TERM_ALIASES.get(plazo, plazo) in senales["plazos"]
    senal_propiedad = senales["propiedad_vista"] and data.get("tiene_propiedad_vista") is True
    return int(senal_plazo) + int(senal_propiedad)


def explain_commercial_priority(
    classification: str,
    project_fit: dict,
    blockers: list,
    score: float,
    data: dict | None = None,
    criterios: dict | None = None,
) -> dict:
    """ALG-19 R1–R8. criterios=None means the defaults."""
    rules = normalize_criterios(criterios)
    safe_project_fit = project_fit or {}
    safe_data = data or {}
    codes = _blocker_codes(blockers)
    project_fit_classification = safe_project_fit.get("classification")
    project_fit_status = safe_project_fit.get("status")
    n_senales = _signal_count(safe_data, rules["senales"])

    if "complemento_incompleto" in codes:
        return _priority(
            "request_info",
            "Faltan antecedentes del complemento de renta antes de priorizar comercialmente.",
            False,
            fixed_rule=True,
        )

    if codes.intersection({"morosidad_vigente", "carga_total_alta"}):
        return _priority(
            "do_not_route",
            "El lead presenta bloqueadores financieros críticos y no debe derivarse todavía.",
            False,
            fixed_rule=True,
        )

    if project_fit_status == "requires_info" or project_fit_classification == "Requiere antecedentes":
        return _priority(
            "request_info",
            "Faltan antecedentes para evaluar la compatibilidad con el objetivo inmobiliario.",
            False,
            fixed_rule=True,
        )

    contactar_ahora = rules["contactar_ahora"]
    if (
        classification in contactar_ahora["clasificaciones"]
        and project_fit_classification in contactar_ahora["compatibilidades"]
    ):
        if n_senales == 2:
            return _priority(
                "contact_now",
                "Lead con alta preparación financiera, objetivo compatible, compra pronta y propiedad o proyecto visto.",
                True,
            )
        return _priority(
            "contact_now",
            "Lead con alta preparación financiera y compatible con el objetivo inmobiliario.",
            True,
        )

    contactar_con_revision = rules["contactar_con_revision"]
    if (
        classification in contactar_con_revision["clasificaciones"]
        and project_fit_classification in contactar_con_revision["compatibilidades"]
    ):
        # R5b promotes one level, only from contact_with_review (A3).
        if rules["subir_con_senales"] > 0 and n_senales >= rules["subir_con_senales"]:
            return _priority(
                "contact_now",
                "Lead con potencial comercial y señales de intención de compra; tu inmobiliaria prioriza contactarlo ahora.",
                True,
                promoted=True,
            )
        if n_senales >= 1:
            return _priority(
                "contact_with_review",
                "Lead con potencial comercial y señales de intención de compra; requiere revisión antes de avanzar.",
                True,
            )
        return _priority(
            "contact_with_review",
            "Lead con potencial comercial, pero requiere revisión antes de avanzar.",
            True,
        )

    if score is not None and score >= rules["umbral_reorientar"] and project_fit_classification == "Fuera de alcance":
        return _priority(
            "reorient",
            "Lead financieramente interesante, pero el objetivo inmobiliario declarado está fuera de alcance.",
            False,
        )

    if classification == "Bajo":
        return _priority(
            "nurture",
            "Lead con baja preparación financiera actual; conviene nutrirlo con un plan de mejora.",
            False,
        )

    return _priority(
        "request_info",
        "Se requieren más antecedentes antes de definir una prioridad comercial.",
        False,
    )


def calculate_commercial_priority(
    classification: str,
    project_fit: dict,
    blockers: list,
    score: float,
    data: dict | None = None,
) -> dict:
    # POST /score contract (S2): exactly the four engine keys, always with the defaults.
    priority = explain_commercial_priority(classification, project_fit, blockers, score, data)
    return {key: priority[key] for key in ENGINE_KEYS}


def engine_action_key(detail) -> str:
    """Key of a stored commercial_priority_detail, resolved as priorityKeyFromDetail does."""
    if not isinstance(detail, dict):
        return NO_PRIORITY
    if detail.get("action_key") in COMMERCIAL_ACTIONS:
        return detail["action_key"]
    if detail.get("action") is None:
        return NO_PRIORITY
    return _KEY_BY_LABEL.get(detail["action"], NO_PRIORITY)


def evaluation_parts(row: dict) -> tuple[dict, dict]:
    """(result, input) of a stored evaluation row, tolerating the legacy snapshot shapes."""
    financial_data = (row or {}).get("financial_data") or {}
    result = financial_data.get("result") or financial_data.get("result_snapshot") or {}
    data = financial_data.get("input") or financial_data.get("input_snapshot") or {}
    return result, data


def configured_priority_for_evaluation(row: dict, criterios: dict | None, config_version: int | None) -> dict:
    """ALG-19 for one stored evaluation. Reads only; never touches the row."""
    result, data = evaluation_parts(row)
    score = result.get("adjusted_score")
    if score is None:
        score = result.get("score")
    priority = explain_commercial_priority(
        result.get("classification"),
        result.get("project_fit"),
        result.get("blockers"),
        score,
        data,
        criterios,
    )
    priority["config_version"] = config_version
    return {
        "commercial_priority_configured": priority,
        "differs_from_engine": priority["action_key"] != engine_action_key(result.get("commercial_priority_detail")),
    }
