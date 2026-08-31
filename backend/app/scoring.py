from typing import Dict, List, Union, Any
from .ai import (
    generate_executive_summary,
    generate_commercial_guidance,
    generate_user_explanation,
)
from .scoring_engine.blockers import detect_blockers
from .scoring_engine.commercial_priority import calculate_commercial_priority
from .scoring_engine.components import calculate_component_scores
from .scoring_engine.constants import SCORING_WEIGHTS
from .scoring_engine.explanations import build_deterministic_explanations
from .scoring_engine.indicators import calculate_financial_indicators
from .scoring_engine.improvement_plan import build_structured_improvement_plan
from .scoring_engine.project_fit import calculate_project_fit
from .scoring_engine.property_value import resolve_property_value_clp
from .scoring_engine.housing_benefits import detect_housing_benefits


SCORING_VERSION = "1.1.0"

# Valor configurable usado para convertir los precios referenciales desde UF a CLP.
VALOR_UF_CLP = 40695

# Tabla referencial heredada para estimacion inicial. Representa precios promedio
# referenciales de propiedades objetivo por comuna, no tasaciones reales ni
# valores comerciales garantizados.
PRECIOS_REFERENCIA_UF = {
    "Buin": 2800,
    "Calera de Tango": 4300,
    "Cerrillos": 3000,
    "Cerro Navia": 2400,
    "Conchalí": 2800,
    "El Bosque": 2300,
    "Estación Central": 3100,
    "Huechuraba": 4700,
    "Independencia": 3300,
    "La Cisterna": 3200,
    "La Florida": 3900,
    "La Granja": 2500,
    "La Pintana": 2200,
    "La Reina": 7200,
    "Las Condes": 9200,
    "Lo Barnechea": 10500,
    "Lo Espejo": 2200,
    "Lo Prado": 2700,
    "Macul": 4100,
    "Maipú": 3600,
    "Melipilla": 2400,
    "Ñuñoa": 6200,
    "Padre Hurtado": 3000,
    "Paine": 2700,
    "Pedro Aguirre Cerda": 2600,
    "Peñaflor": 2900,
    "Peñalolén": 4700,
    "Pirque": 4300,
    "Providencia": 7600,
    "Pudahuel": 2900,
    "Puente Alto": 3100,
    "Quilicura": 3200,
    "Quinta Normal": 3300,
    "Recoleta": 3400,
    "Renca": 2600,
    "San Bernardo": 2800,
    "San Joaquín": 3500,
    "San José de Maipo": 3300,
    "San Miguel": 4500,
    "San Ramón": 2400,
    "Santiago": 3800,
    "Talagante": 3100,
    "Vitacura": 12000,
}


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


RecType = Union[str, Dict[str, str]]

def _money_to_clp(value: float, unit: str, uf_value: float = VALOR_UF_CLP) -> float:
    if unit == "uf":
        return value * uf_value
    return value


def _positive_float(value) -> float:
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return numeric_value if numeric_value > 0 else 0.0


def _bounded_support(value: float, reference: float, max_support: float) -> float:
    if value <= 0 or reference <= 0:
        return 0.0
    return min(max_support, max_support * min(value / reference, 1.0))

def _unique(items: List[RecType]) -> List[RecType]:
    seen = set()
    result = []
    for item in items:
        key = item["text"] if isinstance(item, dict) else item
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _is_truthy(value) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _contextual_recommendations(data: Dict, indicators: Dict) -> List[str]:
    recommendations = []
    if _is_truthy(data.get("pie_en_cuotas_interes")):
        recommendations.append(
            "Consulta si el proyecto permite pago del pie en cuotas; depende de condiciones comerciales de la inmobiliaria y no debe contarse como ahorro disponible ya acumulado."
        )
    return recommendations


def _get_first(data: Dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _valid_complement_income(data: Dict) -> float:
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


def _fallback_financial_indicators(data: Dict, property_value_clp: float) -> Dict:
    ingreso_principal = _positive_float(data.get("ingreso_mensual"))
    ingreso_complementario = _valid_complement_income(data)
    ingreso = ingreso_principal + ingreso_complementario
    deuda = _positive_float(data.get("deuda_mensual"))
    ahorro = _positive_float(data.get("ahorro_disponible"))
    dividendo = _positive_float(data.get("dividendo_estimado"))
    edad = _positive_float(data.get("edad"))
    plazo_credito = _positive_float(data.get("plazo_credito_hipotecario"))

    pie_minimo = property_value_clp * 0.10 if property_value_clp > 0 else 0.0
    pie_recomendado = property_value_clp * 0.20 if property_value_clp > 0 else 0.0

    ratio_carga_total = (deuda + dividendo) / ingreso if ingreso > 0 else None

    return {
        "property_value_clp": property_value_clp,
        "property_value_uf": property_value_clp / VALOR_UF_CLP if property_value_clp > 0 else 0.0,
        "ingreso_total": ingreso,
        "ingreso_principal": ingreso_principal,
        "ingreso_complementario_considerado": ingreso_complementario,
        "ratio_dividendo_ingreso": dividendo / ingreso if ingreso > 0 else None,
        "ratio_deuda_ingreso": deuda / ingreso if ingreso > 0 else None,
        "ratio_carga_total": ratio_carga_total,
        "total_burden_ratio": ratio_carga_total,
        "pie_ratio": ahorro / property_value_clp if property_value_clp > 0 else 0.0,
        "pie_minimo_clp": pie_minimo,
        "pie_intermedio_clp": property_value_clp * 0.15 if property_value_clp > 0 else 0.0,
        "pie_recomendado_clp": pie_recomendado,
        "cobertura_pie_minimo": ahorro / pie_minimo if pie_minimo > 0 else 0.0,
        "cobertura_pie_intermedio": ahorro / (property_value_clp * 0.15) if property_value_clp > 0 else 0.0,
        "cobertura_pie_recomendado": ahorro / pie_recomendado if pie_recomendado > 0 else 0.0,
        "brecha_pie_minimo": max(pie_minimo - ahorro, 0.0) if pie_minimo > 0 else 0.0,
        "brecha_pie_intermedio": max(property_value_clp * 0.15 - ahorro, 0.0) if property_value_clp > 0 else 0.0,
        "brecha_pie_recomendado": max(pie_recomendado - ahorro, 0.0) if pie_recomendado > 0 else 0.0,
        "edad_fin_credito": edad + plazo_credito if edad > 0 and plazo_credito > 0 else None,
    }


def _resolve_financial_indicators(data: Dict, property_value_clp: float) -> Dict:
    financial_indicators = calculate_financial_indicators(data, property_value_clp)
    if financial_indicators:
        return financial_indicators
    return _fallback_financial_indicators(data, property_value_clp)


def _calculate_weighted_score(component_scores: Dict) -> float:
    weighted_score = sum(
        float(component_scores.get(component, 0) or 0) * weight
        for component, weight in SCORING_WEIGHTS.items()
    )
    return round(clamp(weighted_score), 1)


def _classify_weighted_score(score: float) -> str:
    if score >= 75:
        return "Alto"
    if score >= 50:
        return "Medio"
    return "Bajo"


def _select_main_blocker(blockers: List[Dict]) -> Dict | None:
    severity_rank = {
        "critical": 5,
        "high": 4,
        "medium": 3,
        "low": 2,
        "info": 1,
    }
    if not blockers:
        return None
    return max(blockers, key=lambda blocker: severity_rank.get(blocker.get("severity"), 0))


def _apply_blocker_classification(original_classification: str, blockers: List[Dict]) -> tuple[str, str]:
    blocker_codes = {blocker.get("code") for blocker in blockers}

    if "complemento_incompleto" in blocker_codes:
        return (
            "Requiere antecedentes",
            "La clasificación requiere antecedentes adicionales por complemento de renta incompleto.",
        )

    downgrade_codes = {
        "morosidad_vigente",
        "carga_total_alta",
        "pie_insuficiente",
        "dividendo_exigente",
    }
    if original_classification == "Alto" and blocker_codes.intersection(downgrade_codes):
        return (
            "Medio",
            "La clasificación original era Alto, pero fue ajustada por antecedentes detectados.",
        )

    return (
        original_classification,
        "Se mantiene la clasificación original porque no hay bloqueadores relevantes para ajustarla.",
    )


def _apply_blocker_score_caps(base_score: float, blockers: List[Dict]) -> tuple[float, str]:
    blocker_codes = {blocker.get("code") for blocker in blockers}
    score_caps = {
        "pie_insuficiente": (
            74.0,
            "El score final fue limitado porque el ahorro disponible no alcanza el pie minimo estimado.",
        ),
        "dividendo_exigente": (
            69.0,
            "El score final fue limitado porque el dividendo estimado es exigente frente al ingreso declarado.",
        ),
        "carga_total_alta": (
            59.0,
            "El score final fue limitado porque la carga financiera total estimada es alta.",
        ),
        "morosidad_vigente": (
            59.0,
            "El score final fue limitado porque existe morosidad vigente declarada.",
        ),
    }
    active_caps = [
        (cap, reason)
        for code, (cap, reason) in score_caps.items()
        if code in blocker_codes
    ]

    if not active_caps:
        return round(base_score, 1), ""

    cap, reason = min(active_caps, key=lambda item: item[0])
    return round(min(base_score, cap), 1), reason


def _apply_final_classification(score: float, blockers: List[Dict]) -> tuple[str, str]:
    blocker_codes = {blocker.get("code") for blocker in blockers}

    if "complemento_incompleto" in blocker_codes:
        return (
            "Requiere antecedentes",
            "La clasificación requiere antecedentes adicionales por complemento de renta incompleto.",
        )

    return (
        _classify_weighted_score(score),
        "La clasificación final se calculó desde el score ajustado por antecedentes detectados.",
    )



def generate_improvement_plan(score_result: Dict, user_data: Dict) -> List[Dict[str, Any]]:
    risks = set(score_result.get("risk_codes", []))
    plan = []

    if "morosidad_alta" in risks:
        plan.append({
            "category": "Deuda",
            "description": "Regulariza o aclara compromisos pendientes antes de iniciar una evaluación formal.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Mejora inmediata del score y viabilidad bancaria."
        })
    elif "morosidad_media" in risks:
        plan.append({
            "category": "Deuda",
            "description": "Revisa tu situación financiera actual y confirma si existen pagos pendientes o atrasos.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Evita rechazos automáticos por deudas desconocidas."
        })

    if "ahorro_bajo" in risks:
        plan.append({
            "category": "Ahorro",
            "description": "Define una meta mensual de ahorro y separa esos fondos apenas recibas tus ingresos.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Aumenta el pie disponible y reduce el monto de crédito a solicitar."
        })
    else:
        plan.append({
            "category": "Ahorro",
            "description": "Mantén un fondo de ahorro separado para pie, gastos iniciales y margen de seguridad.",
            "impact_level": "Bajo",
            "impact_score": 1,
            "expected_benefit": "Evita descapitalización ante gastos imprevistos."
        })

    if "deuda_alta" in risks:
        plan.append({
            "category": "Deuda",
            "description": "Prioriza reducir cuotas mensuales o cerrar deudas pequeñas antes de aumentar tu compromiso hipotecario.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Aumenta tu capacidad de pago (holgura financiera) para el dividendo."
        })
    else:
        plan.append({
            "category": "Deuda",
            "description": "Evita tomar nuevas deudas de consumo mientras preparas tu compra.",
            "impact_level": "Bajo",
            "impact_score": 1,
            "expected_benefit": "Mantiene tu capacidad de crédito libre."
        })

    if "contrato_plazo_fijo" in risks:
        plan.append({
            "category": "Continuidad Laboral",
            "description": "Evalúa fortalecer tu estabilidad contractual antes de iniciar una evaluación hipotecaria formal.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Los bancos prefieren contratos indefinidos para minimizar riesgo."
        })
    elif "contrato_honorarios_variable" in risks:
        plan.append({
            "category": "Continuidad Laboral",
            "description": "Ordena respaldos de ingresos variables, boletas, contratos o movimientos consistentes.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Permite promediar ingresos y demostrar estabilidad real."
        })
    elif "continuidad_baja" in risks or "continuidad_media" in risks or "contrato_independiente" in risks:
        plan.append({
            "category": "Continuidad Laboral",
            "description": "Mantén continuidad laboral y ordena respaldos simples de ingresos, especialmente si trabajas independiente.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Aumenta el porcentaje de tus ingresos que el banco considerará."
        })
    else:
        plan.append({
            "category": "Continuidad Laboral",
            "description": "Conserva estabilidad laboral y evita cambios bruscos de fuente de ingreso durante la preparación.",
            "impact_level": "Bajo",
            "impact_score": 1,
            "expected_benefit": "No afecta negativamente el tiempo de antigüedad acumulado."
        })

    if "ingreso_dividendo" in risks or "precio_objetivo" in risks or score_result.get("classification") != "Alto":
        plan.append({
            "category": "Objetivo Inmobiliario",
            "description": "Revisa comuna, precio esperado o dividendo objetivo para que la compra sea más sostenible.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Mayor probabilidad de que el dividendo cubra menos del 25% de tu ingreso."
        })

    if "complemento_morosidad_alta" in risks:
        plan.append({
            "category": "Deuda Co-deudor",
            "description": "Evalúa si el co-deudor puede regularizar su situación de morosidad antes de comprometerse.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Evita que la morosidad del co-deudor contamine tu solicitud."
        })
    elif "complemento_morosidad_media" in risks:
        plan.append({
            "category": "Deuda Co-deudor",
            "description": "Confirma la situación financiera actual del co-deudor y si existen pagos pendientes.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Permite identificar riesgos a tiempo antes de la firma."
        })

    if "complemento_deuda_alta" in risks:
        plan.append({
            "category": "Deuda Co-deudor",
            "description": "El co-deudor debería priorizar reducir sus deudas mensuales antes de asumir un nuevo compromiso.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Mejora la capacidad combinada para absorber el dividendo."
        })

    if "complemento_tarjetas_excesivas" in risks:
        plan.append({
            "category": "Deuda Co-deudor",
            "description": "El co-deudor debería reducir la cantidad de tarjetas de crédito activas para mejorar su perfil.",
            "impact_level": "Bajo",
            "impact_score": 1,
            "expected_benefit": "Reduce el nivel de línea de crédito que los bancos asumen como deuda potencial."
        })

    if "complemento_continuidad_baja" in risks or "complemento_continuidad_media" in risks:
        plan.append({
            "category": "Continuidad Laboral Co-deudor",
            "description": "El co-deudor debería consolidar su estabilidad laboral antes de ser considerado como apoyo.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Mayor porcentaje de los ingresos del co-deudor serán tomados en cuenta."
        })

    if "complemento_contrato_independiente" in risks:
        plan.append({
            "category": "Continuidad Laboral Co-deudor",
            "description": "Ordena antecedentes de ingresos del co-deudor si trabaja independiente.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Facilita la verificación formal de ingresos variables."
        })

    if "complemento_relacion_debil" in risks:
        plan.append({
            "category": "Requisitos Co-deudor",
            "description": "Valida con anticipación si la relación declarada para complementar renta sera aceptada en una evaluación formal.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Evita rechazos normativos por políticas internas del banco."
        })

    if "complemento_sin_datos" in risks:
        plan.append({
            "category": "Requisitos Co-deudor",
            "description": "Completa toda la información del co-deudor para una evaluación precisa.",
            "impact_level": "Medio",
            "impact_score": 2,
            "expected_benefit": "Permite una simulación más realista del potencial de aprobación."
        })

    if user_data.get("complemento_renta"):
        plan.append({
            "category": "Requisitos Co-deudor",
            "description": "Ordena la información de la persona que complementará renta y valida que pueda sostener ese apoyo.",
            "impact_level": "Bajo",
            "impact_score": 1,
            "expected_benefit": "Prepara de forma anticipada la carpeta del crédito."
        })
    elif score_result.get("classification") in {"Medio", "Bajo"}:
        plan.append({
            "category": "Objetivo Inmobiliario",
            "description": "Evalúa complementar renta con una persona de confianza si tu situación actual no alcanza para el objetivo.",
            "impact_level": "Alto",
            "impact_score": 3,
            "expected_benefit": "Podría permitirte acceder a la propiedad deseada al sumar ingresos."
        })

    # Filtrar duplicados por 'description' y ordenar por 'impact_score'
    seen = set()
    unique_plan = []
    for item in plan:
        if item["description"] not in seen:
            seen.add(item["description"])
            unique_plan.append(item)
            
    unique_plan.sort(key=lambda x: x["impact_score"], reverse=True)
    return unique_plan


def calculate_score(data: Dict, include_ai: bool = True) -> Dict:
    # include_ai=False permite recalcular el scoring sin consumir llamadas al
    # proveedor de IA (lo usa el endpoint de regeneración de explicaciones).
    ingreso = float(data.get("ingreso_mensual", 0) or 0)
    deuda = float(data.get("deuda_mensual", 0) or 0)
    ahorro = float(data.get("ahorro_disponible", 0) or 0)
    contrato = data.get("tipo_contrato", "")
    continuidad = data.get("continuidad_laboral", "")
    morosidad = data.get("morosidad_actual", "")
    antiguedad_morosidad = data.get("antiguedad_morosidad", "")
    comuna = data.get("comuna_objetivo")
    dividendo = float(data.get("dividendo_estimado", 0) or 0)
    complemento = bool(data.get("complemento_renta", False))
    comp_ingreso = float(data.get("ingreso_mensual_complementario", data.get("complemento_ingreso_mensual", 0)) or 0)
    comp_deuda = float(data.get("deuda_mensual_complementario", data.get("complemento_deuda_mensual", 0)) or 0)
    comp_morosidad = data.get("morosidad_complementario", data.get("complemento_morosidad", ""))
    comp_contrato = data.get("tipo_contrato_complementario", data.get("complemento_tipo_contrato", ""))
    comp_continuidad = data.get("continuidad_laboral_complementario", data.get("complemento_continuidad_laboral", ""))
    comp_relacion = data.get("relacion_complementario", data.get("complemento_relacion", ""))
    edad = int(data.get("edad", 0) or 0)
    plazo_credito = int(data.get("plazo_credito_hipotecario", 0) or 0)
    uf_value_clp = float(data.get("uf_value_clp") or VALOR_UF_CLP)
    declara_patrimonio = bool(data.get("declara_patrimonio", False))
    patrimonio_unit = data.get("patrimonio_unit") or "clp"
    valor_vehiculos = _money_to_clp(float(data.get("valor_vehiculos", 0) or 0), patrimonio_unit, uf_value_clp)
    valor_inmuebles = _money_to_clp(float(data.get("valor_inmuebles", 0) or 0), patrimonio_unit, uf_value_clp)

    # Base score
    score = 50.0
    components = {
        "carga_financiera": 0.0,
        "estabilidad_laboral": 0.0,
        "historial_crediticio": 0.0,
        "pie_disponible": 0.0,
        "perfil_compra": 0.0,
    }
    positivos: List[str] = []
    riesgos: List[str] = []
    recomendaciones: List[Dict[str, str]] = []
    risk_codes: List[str] = []
    relaciones_debiles = {"amigo", "otro"}
    complemento_completo = (
        comp_ingreso > 0
        and comp_deuda >= 0
        and bool(comp_morosidad)
        and bool(comp_contrato)
        and bool(comp_continuidad)
        and bool(comp_relacion)
    )
    complemento_valido_para_capacidad = (
        complemento
        and complemento_completo
        and comp_morosidad == "no"
        and comp_relacion not in relaciones_debiles
    )
    ingreso_para_capacidad = ingreso + (comp_ingreso if complemento_valido_para_capacidad else 0)

    # Evitar división por cero
    if dividendo <= 0:
        dividendo = 1.0

    ingreso_cubre_dividendo = ingreso_para_capacidad >= 4 * dividendo
    if ingreso_cubre_dividendo:
        components["carga_financiera"] += 25
        score += 25
        positivos.append("Ingreso consistente con el dividendo estimado")
    else:
        components["carga_financiera"] -= 15
        score -= 15
        risk_codes.append("ingreso_dividendo")
        riesgos.append("El dividendo objetivo podría exigir más holgura financiera.")
        recomendaciones.append({"text": "Revisar el dividendo estimado o ajustar el objetivo de compra.", "benefit": "Alinear tu capacidad de pago con el mercado para mejorar tu clasificación."})

    # Regla: deuda > 40% ingreso penaliza
    if ingreso > 0 and deuda > 0.4 * ingreso:
        components["carga_financiera"] -= 20
        score -= 20
        risk_codes.append("deuda_alta")
        riesgos.append("La carga mensual de deudas podría afectar la evaluación.")
        recomendaciones.append({"text": "Reducir compromisos mensuales antes de avanzar.", "benefit": "Mejorar tu relación deuda/ingreso y aumentar tu puntaje."})
    else:
        positivos.append("Carga de deuda aceptable")

    # Evaluacion de precio objetivo y pie segun valor declarado o comuna.
    property_value_clp = float(data.get("property_value_clp", 0) or 0)
    precio_referencia_uf = PRECIOS_REFERENCIA_UF.get(comuna)
    precio_objetivo_clp = 0.0
    pie_minimo_clp = 0.0
    pie_recomendado_clp = 0.0

    if property_value_clp > 0 or precio_referencia_uf:
        precio_objetivo_clp = property_value_clp if property_value_clp > 0 else precio_referencia_uf * uf_value_clp
        pie_minimo_clp = precio_objetivo_clp * 0.10
        pie_recomendado_clp = precio_objetivo_clp * 0.20

        if ahorro >= pie_recomendado_clp:
            components["pie_disponible"] += 15
            score += 15
            positivos.append("Ahorro consistente con el objetivo declarado")
        elif ahorro >= pie_minimo_clp:
            components["pie_disponible"] += 5
            score += 5
            positivos.append("Ahorro inicial disponible")
            recomendaciones.append({"text": "Aumentar ahorro para acercarse a una posición más sólida.", "benefit": "Alcanzar el 20% de pie recomendado y acceder a mejor evaluación."})
        else:
            components["pie_disponible"] -= 20
            score -= 20
            risk_codes.append("ahorro_bajo")
            risk_codes.append("precio_objetivo")
            riesgos.append("El ahorro disponible podría ser bajo para el objetivo de compra declarado.")
            recomendaciones.append({"text": "Aumentar ahorro o evaluar una alternativa de compra más gradual.", "benefit": "Ajustar tu objetivo a un rango alcanzable y no sobreendeudarte."})
    else:
        # Si no existe referencia de comuna, se conserva una regla simple de respaldo.
        if ahorro < dividendo:
            components["pie_disponible"] -= 10
            score -= 10
            risk_codes.append("ahorro_bajo")
            riesgos.append("El ahorro disponible podría ser bajo para iniciar el proceso.")
            recomendaciones.append({"text": "Aumentar ahorro para cubrir pie y gastos iniciales.", "benefit": "Contar con el capital mínimo necesario para iniciar el proceso."})
        else:
            positivos.append("Ahorro disponible adecuado")

    # Tipo de contrato
    if contrato == "indefinido":
        components["estabilidad_laboral"] += 10
        score += 10
        positivos.append("Contrato indefinido favorable para una evaluación formal")
    elif contrato == "independiente":
        if continuidad in ("entre_1_y_3_anios", "mas_3_anios"):
            positivos.append("Ingreso independiente con continuidad declarada")
            recomendaciones.append({"text": "Mantener respaldos consistentes de ingresos independientes.", "benefit": "Facilitar la verificación de ingresos en una evaluación formal."})
        else:
            score -= 5
            risk_codes.append("contrato_independiente")
            riesgos.append("Los ingresos independientes pueden requerir mayor respaldo de continuidad.")
            recomendaciones.append({"text": "Ordenar antecedentes que demuestren estabilidad de ingresos.", "benefit": "Aumentar la confianza del evaluador en tu capacidad de pago."})
    elif contrato == "plazo_fijo":
        score -= 18
        risk_codes.append("contrato_plazo_fijo")
        riesgos.append("El contrato a plazo fijo puede dificultar una evaluación hipotecaria formal.")
        recomendaciones.append({"text": "Fortalecer estabilidad contractual antes de avanzar.", "benefit": "Cumplir con requisitos mínimos de una evaluación hipotecaria formal."})
    elif contrato == "honorarios_variable":
        score -= 10
        risk_codes.append("contrato_honorarios_variable")
        riesgos.append("Los ingresos por honorarios o variables pueden requerir mayor respaldo.")
        recomendaciones.append({"text": "Ordenar antecedentes que demuestren continuidad y consistencia de ingresos.", "benefit": "Respaldar tu capacidad de pago ante una evaluación formal."})

    if continuidad == "menos_6_meses":
        components["estabilidad_laboral"] -= 15
        score -= 15
        risk_codes.append("continuidad_baja")
        riesgos.append("La continuidad laboral declarada podría requerir mayor consolidación.")
        recomendaciones.append({"text": "Mantener estabilidad laboral antes de solicitar una evaluación formal.", "benefit": "Demostrar solvencia y continuidad a largo plazo."})
    elif continuidad == "entre_6_y_12_meses":
        components["estabilidad_laboral"] -= 8
        score -= 8
        risk_codes.append("continuidad_media")
        riesgos.append("La continuidad laboral aún podría ser un punto a fortalecer.")
        recomendaciones.append({"text": "Seguir consolidando antigüedad y estabilidad de ingresos.", "benefit": "Fortalecer tu perfil para obtener mejor clasificación."})
    elif continuidad == "mas_3_anios":
        components["estabilidad_laboral"] += 5
        score += 5
        positivos.append("Continuidad laboral estable")

    if morosidad == "si":
        components["historial_crediticio"] -= 30
        if antiguedad_morosidad in {"menos_3_meses", "3_a_12_meses"}:
            score -= 35
        else:
            score -= 25
        risk_codes.append("morosidad_alta")
        riesgos.append("La morosidad declarada es un riesgo relevante para avanzar.")
        recomendaciones.append({"text": "Regularizar o aclarar pagos pendientes antes de continuar.", "benefit": "Limpiar tu historial crediticio para no afectar la evaluación formal."})
    elif morosidad == "no_lo_se":
        components["historial_crediticio"] -= 12
        score -= 12
        risk_codes.append("morosidad_media")
        riesgos.append("Existe incertidumbre sobre la situación de pagos actual.")
        recomendaciones.append({"text": "Revisar tu situación financiera antes de avanzar.", "benefit": "Despejar dudas que podrían bloquear una evaluación formal."})

    if edad > 0 and plazo_credito > 0 and edad + plazo_credito > 70:
        components["perfil_compra"] -= 3
        score -= 3
        risk_codes.append("edad_plazo")
        riesgos.append("La edad declarada y el plazo hipotecario podrían requerir una revisión adicional.")
        recomendaciones.append("Validar el plazo hipotecario posible según edad y condiciones asociadas al crédito.")

    if declara_patrimonio and (valor_vehiculos > 0 or valor_inmuebles > 0):
        referencia_respaldo = max(
            precio_objetivo_clp * 0.10 if precio_objetivo_clp > 0 else 0,
            ingreso * 6,
            dividendo * 12,
            1,
        )
        respaldo = (
            _bounded_support(valor_vehiculos, referencia_respaldo, 3.0)
            + _bounded_support(valor_inmuebles, referencia_respaldo * 2, 8.0)
        )
        factores_riesgo_fuertes = {
            "morosidad_alta",
            "deuda_alta",
            "contrato_plazo_fijo",
            "contrato_honorarios_variable",
            "ingreso_dividendo",
        }
        if factores_riesgo_fuertes.intersection(risk_codes):
            respaldo = min(respaldo, 4.0)
            recomendaciones.append(
                "El patrimonio declarado puede apoyar el perfil, pero no reemplaza ingreso, deuda, morosidad ni estabilidad laboral."
            )

        if respaldo > 0:
            components["perfil_compra"] += respaldo
            score += respaldo
            if valor_inmuebles > 0:
                positivos.append("Patrimonio declarado como respaldo financiero adicional")
            else:
                positivos.append("Vehículo declarado como respaldo patrimonial complementario")

    # Complemento de renta con evaluacion completa del co-deudor
    if complemento:
        comp_tarjetas = int(data.get("complemento_tarjetas_activas", 0) or 0)
        if not complemento_completo:
            score -= 5
            risk_codes.append("complemento_sin_datos")
            riesgos.append("Falta información detallada del co-deudor para evaluar el riesgo.")
            recomendaciones.append({"text": "Completar los datos del co-deudor antes de considerarlo como apoyo de renta.", "benefit": "Evaluar correctamente si el complemento mejora tu perfil."})
        else:
            if comp_morosidad == "si":
                components["perfil_compra"] -= 20
                score -= 20
                risk_codes.append("complemento_morosidad_alta")
                riesgos.append("La persona complementaria declara morosidad, por lo que no mejora esta preevaluación.")
                recomendaciones.append({"text": "Considerar complementar renta con una persona sin morosidad declarada.", "benefit": "Que el co-deudor aporte realmente a tu capacidad de compra."})

            if comp_relacion in relaciones_debiles:
                score -= 5
                risk_codes.append("complemento_relacion_debil")
                riesgos.append("La relacion declarada para complementar renta podría requerir mayor respaldo.")
                recomendaciones.append({"text": "Validar si esa relación sería aceptada en una evaluación hipotecaria formal.", "benefit": "Evitar sorpresas al momento de presentar documentación."})

            if comp_ingreso > 0 and comp_deuda > 0.4 * comp_ingreso:
                components["perfil_compra"] -= 15
                score -= 15
                risk_codes.append("complemento_deuda_alta")
                riesgos.append("El co-deudor tiene una carga de deuda elevada en relación a sus ingresos.")
                recomendaciones.append({"text": "El co-deudor debería reducir sus deudas antes de comprometerse.", "benefit": "Mejorar la renta combinada y no perjudicar tu evaluación."})

            if comp_contrato == "independiente":
                if comp_continuidad in ("entre_1_y_3_anios", "mas_3_anios"):
                    recomendaciones.append({"text": "Respaldar ingresos independientes del co-deudor con antecedentes formales.", "benefit": "Asegurar que su aporte sea considerado válido."})
                else:
                    score -= 5
                    risk_codes.append("complemento_contrato_independiente")
                    riesgos.append("El co-deudor trabaja independiente con continuidad aún limitada.")
                    recomendaciones.append({"text": "Respaldar ingresos del co-deudor con antecedentes formales.", "benefit": "Evitar descuentos en la evaluación por falta de respaldo."})
            elif comp_contrato == "plazo_fijo":
                score -= 10
                risk_codes.append("complemento_contrato_plazo_fijo")
                riesgos.append("El contrato a plazo fijo del co-deudor puede limitar su aporte a la evaluación.")
            elif comp_contrato == "honorarios_variable":
                score -= 6
                risk_codes.append("complemento_contrato_variable")
                riesgos.append("Los ingresos variables del co-deudor pueden requerir mayor respaldo.")

            if comp_continuidad == "menos_6_meses":
                components["perfil_compra"] -= 10
                score -= 10
                risk_codes.append("complemento_continuidad_baja")
                riesgos.append("El co-deudor tiene baja continuidad laboral.")
                recomendaciones.append({"text": "El co-deudor debería consolidar su estabilidad laboral.", "benefit": "Que su respaldo sea considerado confiable."})
            elif comp_continuidad == "entre_6_y_12_meses":
                components["perfil_compra"] -= 5
                score -= 5
                risk_codes.append("complemento_continuidad_media")
                riesgos.append("El co-deudor tiene continuidad laboral limitada.")

            if comp_tarjetas >= 5:
                components["perfil_compra"] -= 15
                score -= 15
                risk_codes.append("complemento_tarjetas_excesivas")
                riesgos.append("El co-deudor tiene muchas tarjetas de credito activas, lo que puede indicar sobreendeudamiento.")
                recomendaciones.append({"text": "El co-deudor debería reducir su cantidad de tarjetas activas.", "benefit": "Disminuir señales de sobreendeudamiento en el perfil combinado."})
            elif comp_tarjetas >= 3:
                components["perfil_compra"] -= 8
                score -= 8
                risk_codes.append("complemento_tarjetas_excesivas")
                riesgos.append("El co-deudor tiene varias tarjetas de credito activas.")
            perfil_limpio = (
                comp_morosidad == "no"
                and (comp_ingreso <= 0 or comp_deuda <= 0.4 * comp_ingreso)
                and comp_contrato == "indefinido"
                and comp_continuidad in ("entre_1_y_3_anios", "mas_3_anios")
                and comp_relacion not in relaciones_debiles
            )

            if perfil_limpio:
                components["perfil_compra"] += 10
                score += 10
                positivos.append("El co-deudor presenta un perfil financiero solido")
            else:
                components["perfil_compra"] += 3
            if complemento_valido_para_capacidad and "complemento_deuda_alta" not in risk_codes:
                score += 3
                positivos.append("Complemento de renta con antecedentes básicos utilizables")

    property_value_resolution = resolve_property_value_clp(data)
    financial_indicators = _resolve_financial_indicators(
        data,
        property_value_resolution.get("property_value_clp", 0),
    )
    financial_indicators.setdefault("property_value_clp", property_value_resolution.get("property_value_clp", 0))
    financial_indicators.setdefault("property_value_uf", property_value_resolution.get("property_value_uf", 0))
    blockers = detect_blockers(data, financial_indicators)
    component_scores = calculate_component_scores(data, financial_indicators, blockers)
    project_fit = calculate_project_fit(data, financial_indicators, blockers)
    structured_improvement_plan = build_structured_improvement_plan(data, financial_indicators, blockers)
    base_score = _calculate_weighted_score(component_scores)
    original_classification = _classify_weighted_score(base_score)
    main_blocker = _select_main_blocker(blockers)
    adjusted_score, score_adjustment_reason = _apply_blocker_score_caps(base_score, blockers)
    score = adjusted_score
    clasificacion, classification_reason = _apply_final_classification(score, blockers)
    if not score_adjustment_reason and clasificacion == original_classification:
        classification_reason = "Se mantiene la clasificación base porque no hay bloqueadores relevantes para ajustar el score."
    commercial_priority_detail = calculate_commercial_priority(
        classification=clasificacion,
        project_fit=project_fit,
        blockers=blockers,
        score=score,
        data=data,
    )

    # Recomendaciones según clasificación
    if clasificacion == "Bajo":
        recomendaciones.append({"text": "Revisar expectativas y plan de ahorro; considerar propiedades con menor dividendo.", "benefit": "Alinear tu objetivo con tu capacidad real para hacer la compra viable."})
    elif clasificacion == "Medio":
        recomendaciones.append({"text": "Mejorar ahorro o reducir deuda para pasar a clasificación Alto.", "benefit": "Acceder a mejores condiciones en una evaluación formal."})

    if not ingreso_cubre_dividendo:
        recomendaciones.append({"text": "Ajustar el dividendo objetivo para mantener una carga mensual más sostenible.", "benefit": "Evitar un sobreesfuerzo financiero que ponga en riesgo tu compra."})

    recomendaciones.extend(_contextual_recommendations(data, financial_indicators))

    uniq_positivos = _unique(positivos)
    uniq_riesgos = _unique(riesgos)
    uniq_recomendaciones = _unique(recomendaciones)
    uniq_risk_codes = _unique(risk_codes)

    result = {
        "score": round(score, 1),
        "base_score": round(base_score, 1),
        "adjusted_score": round(adjusted_score, 1),
        "score_adjustment_reason": score_adjustment_reason,
        "classification": clasificacion,
        "positive_indicators": uniq_positivos,
        "risks": uniq_riesgos,
        "recommendations": uniq_recomendaciones,
        "risk_codes": uniq_risk_codes,
        "component_scores": component_scores,
        "algorithm_version": SCORING_VERSION,
        "financial_indicators": financial_indicators,
        "blockers": blockers,
        "main_blocker": main_blocker,
        "original_classification": original_classification,
        "classification_reason": classification_reason,
        "property_value_resolution": property_value_resolution,
        "project_fit": project_fit,
        "commercial_priority_detail": commercial_priority_detail,
        "structured_improvement_plan": structured_improvement_plan,
    }
    result.update(build_deterministic_explanations(result))

    if include_ai:
        explanation = generate_user_explanation(
            classification=clasificacion,
            score=round(score, 1),
            positive_indicators=uniq_positivos,
            risks=uniq_riesgos,
            financial_indicators=financial_indicators,
            blockers=blockers,
            main_blocker=main_blocker,
            project_fit=project_fit,
            commercial_priority_detail=commercial_priority_detail,
            structured_improvement_plan=structured_improvement_plan,
        )
        # Si la generación falla, el campo simplemente no se incluye: nunca
        # se guarda ni se muestra un texto de error como explicación.
        if explanation:
            result["ai_explanation"] = explanation

        executive_summary = generate_executive_summary(
            classification=clasificacion,
            score=round(score, 1),
            positive_indicators=uniq_positivos,
            risks=uniq_riesgos,
            financial_indicators=financial_indicators,
            blockers=blockers,
            main_blocker=main_blocker,
            project_fit=project_fit,
            commercial_priority_detail=commercial_priority_detail,
            structured_improvement_plan=structured_improvement_plan,
        )
        if executive_summary:
            result["executive_summary"] = executive_summary

        commercial_guidance = generate_commercial_guidance(
            classification=clasificacion,
            score=round(score, 1),
            positive_indicators=uniq_positivos,
            risks=uniq_riesgos,
            recommendations=uniq_recomendaciones,
            financial_indicators=financial_indicators,
            blockers=blockers,
            main_blocker=main_blocker,
            project_fit=project_fit,
            commercial_priority_detail=commercial_priority_detail,
            structured_improvement_plan=structured_improvement_plan,
        )
        if commercial_guidance:
            result["commercial_guidance"] = commercial_guidance

    result["improvement_plan"] = generate_improvement_plan(
        result,
        data
    )


    result["housing_benefits"] = detect_housing_benefits(data, financial_indicators)

    return result

