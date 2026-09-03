# Deterministic explainability layer for future rule-based scoring outputs.


def _safe_get(mapping: dict, key: str, default=None):
    if not isinstance(mapping, dict):
        return default
    value = mapping.get(key)
    return default if value is None else value


def _main_blocker_text(main_blocker: dict) -> str:
    if not main_blocker:
        return "No se detecta un bloqueador principal en esta precalificación."
    title = _safe_get(main_blocker, "title", "Bloqueador principal")
    description = _safe_get(main_blocker, "description", "Existe una condicion que requiere revision.")
    return f"El bloqueador principal es: {title}. {description}"


def _commercial_status(priority: dict) -> str:
    action = _safe_get(priority, "action", "Solicitar antecedentes")
    if action == "Contactar ahora":
        return "parece contactable de forma prioritaria"
    if action == "Contactar con revisión":
        return "parece contactable con revision previa"
    if action == "Nutrir con plan de mejora":
        return "conviene trabajarlo con plan de mejora"
    if action == "Reorientar a otro proyecto":
        return "conviene reorientarlo a otro proyecto"
    if action == "No derivar todavía":
        return "no se recomienda derivarlo todavia"
    return "requiere antecedentes antes de decidir"


def build_deterministic_explanations(result: dict) -> dict:
    safe_result = result or {}
    score = _safe_get(safe_result, "score", "sin score")
    classification = _safe_get(safe_result, "classification", "Sin clasificacion")
    main_blocker = _safe_get(safe_result, "main_blocker")
    project_fit = _safe_get(safe_result, "project_fit", {})
    priority = _safe_get(safe_result, "commercial_priority_detail", {})

    blocker_text = _main_blocker_text(main_blocker)
    project_fit_classification = _safe_get(project_fit, "classification", "sin compatibilidad calculada")
    action = _safe_get(priority, "action", "Solicitar antecedentes")
    reason = _safe_get(priority, "reason", "Se requieren mas antecedentes para orientar la gestion.")

    user_explanation = (
        f"Tu score orientativo es {score} y tu clasificacion es {classification}. "
        f"{blocker_text} Este resultado no aprueba creditos ni reemplaza una evaluacion bancaria formal; "
        "sirve para entender tu preparacion financiera y los pasos recomendados antes de avanzar."
    )

    executive_summary = (
        f"Lead con score {score}, clasificacion financiera {classification} y project fit {project_fit_classification}. "
        f"{blocker_text} Comercialmente, el lead {_commercial_status(priority)}."
    )

    commercial_guidance = (
        f"Accion sugerida: {action}. {reason} Esta orientacion no envia datos a CRM ni ejecuta derivaciones automaticas."
    )

    return {
        "user_explanation_deterministic": user_explanation,
        "executive_summary_deterministic": executive_summary,
        "commercial_guidance_deterministic": commercial_guidance,
    }
