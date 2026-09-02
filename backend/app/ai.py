import os
import re
import json
from pathlib import Path

try:
    from groq import Groq
except ImportError:
    Groq = None
 

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())
 
# Groq retiró los modelos Llama 3.x el 16/08/2026. El reemplazo oficial
# recomendado para llama-3.1-8b-instant es openai/gpt-oss-20b.
# Se puede cambiar sin tocar código con la variable GROQ_MODEL en backend/.env.
DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"

def _ask_groq(prompt: str, max_tokens: int = 300) -> str | None:
    """Wrapper interno que consulta el modelo configurado vía Groq.

    Devuelve el texto generado o None si la IA no está disponible o falló;
    los textos de estado/error jamás se exponen como contenido.
    """
    if Groq is None:
        print("[ai] Librería de Groq no instalada; IA deshabilitada.", flush=True)
        return None

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("[ai] GROQ_API_KEY no configurada; IA deshabilitada.", flush=True)
        return None

    model = os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL)

    client = Groq(api_key=api_key)

    kwargs = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.4,
    }

    # Los modelos GPT-OSS aceptan controlar el esfuerzo de razonamiento;
    # "low" basta para textos cortos y evita consumir presupuesto de salida.
    if model.startswith("openai/gpt-oss"):
        kwargs["reasoning_effort"] = "low"

    try:
        try:
            completion = client.chat.completions.create(**kwargs)
        except TypeError:
            # SDK antiguo sin soporte para reasoning_effort.
            kwargs.pop("reasoning_effort", None)
            completion = client.chat.completions.create(**kwargs)
        content = (completion.choices[0].message.content or "").strip()
        # Ante cualquier fallo se devuelve None: los textos de IA fallidos
        # nunca deben mostrarse al usuario como contenido.
        return content or None
    except Exception as e:
        # No se filtra el detalle del error del proveedor hacia el producto;
        # queda registrado en los logs del servidor.
        print(f"[ai] Falló la generación con {model}: {e}", flush=True)
        return None


def _clean_generated_text(text: str) -> str:
    replacements = {
        "preevaluacion": "precalificación",
        "situacion": "situación",
        "informacion": "información",
        "antiguedad": "antigüedad",
        "podria": "podría",
        "proximos": "próximos",
        "credito": "crédito",
        "mas": "más",
        "solida": "sólida",
        "seria": "sería",
    }
    cleaned = re.sub(r"[^\S\n]+", " ", text or "").strip()
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([.!?])\s*[,;:]+\s*", r"\1 ", cleaned)
    cleaned = re.sub(r"[,;:]+\s*([.!?])", r"\1", cleaned)
    cleaned = re.sub(r",\s*\.", ".", cleaned)
    cleaned = re.sub(r"\.\s*,", ".", cleaned)
    cleaned = re.sub(r"([,;:])\s*([,.;:!?])", r"\2", cleaned)
    cleaned = re.sub(r"([.!?])\s*\1+", r"\1", cleaned)
    cleaned = re.sub(r"([,;:])\s*\1+", r"\1", cleaned)
    cleaned = re.sub(r"([.!?])(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])", r"\1 ", cleaned)
    for source, target in replacements.items():
        cleaned = re.sub(
            rf"\b{source}\b",
            lambda match: target.capitalize() if match.group(0)[:1].isupper() else target,
            cleaned,
            flags=re.IGNORECASE,
        )
    cleaned = re.sub(
        r"\bevaluacion(es)?\b(?!\s+(?:bancaria|formal|hipotecaria|crediticia|oficial)\b)(?!\s+(?:del?|para\s+el)\s+(?:MINVU|SERVIU)\b)",
        lambda match: (
            "Calificaciones" if match.group(0) == "Evaluaciones" else
            "Calificación" if match.group(0) == "Evaluacion" else
            "calificaciones" if match.group(1) else "calificación"
        ),
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned


def _format_json_context(value) -> str:
    if value in (None, [], {}):
        return "No disponible"
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, default=str)
    except TypeError:
        return str(value)


def _main_blocker_label(main_blocker) -> str:
    if not isinstance(main_blocker, dict) or not main_blocker:
        return "No hay bloqueador principal informado."
    title = main_blocker.get("title") or main_blocker.get("code") or "Bloqueador principal"
    description = main_blocker.get("description") or "Sin descripción adicional."
    severity = main_blocker.get("severity") or "sin severidad"
    return f"{title} ({severity}): {description}"


def _professional_context(
    financial_indicators=None,
    blockers=None,
    main_blocker=None,
    project_fit=None,
    commercial_priority_detail=None,
    structured_improvement_plan=None,
) -> str:
    return f"""Contexto profesional calculado por reglas del sistema:
- Indicadores financieros:
{_format_json_context(financial_indicators)}
- Bloqueador principal:
{_main_blocker_label(main_blocker)}
- Bloqueadores:
{_format_json_context(blockers)}
- Compatibilidad con objetivo inmobiliario (project_fit):
{_format_json_context(project_fit)}
- Prioridad comercial calculada:
{_format_json_context(commercial_priority_detail)}
- Plan estructurado de mejora:
{_format_json_context(structured_improvement_plan)}
"""


def generate_executive_summary(
    classification: str,
    score: float,
    positive_indicators: list,
    risks: list,
    financial_indicators=None,
    blockers=None,
    main_blocker=None,
    project_fit=None,
    commercial_priority_detail=None,
    structured_improvement_plan=None,
) -> str:
    """
    Resumen ejecutivo para el ejecutivo comercial.
    Explica por qué el lead obtuvo esa clasificación y qué tan preparado está.
    """
    positivos_txt = "\n".join(f"- {p}" for p in positive_indicators) or "- Sin indicadores positivos"
    riesgos_txt   = "\n".join(f"- {r}" for r in risks) or "- Sin riesgos detectados"
    professional_context = _professional_context(
        financial_indicators=financial_indicators,
        blockers=blockers,
        main_blocker=main_blocker,
        project_fit=project_fit,
        commercial_priority_detail=commercial_priority_detail,
        structured_improvement_plan=structured_improvement_plan,
    )

    prompt = f"""Eres un analista/ejecutivo comercial inmobiliario experto.
Redacta un resumen ejecutivo breve (máximo 100 palabras) dirigido a un ejecutivo comercial, NO al cliente.
El score, la clasificación, los bloqueadores y la prioridad ya fueron calculados por reglas del sistema.
La IA solo redacta explicaciones; no puede calcular ni modificar el resultado.

Datos del lead:
- Score: {score}/100
- Clasificación: {classification}

Indicadores positivos:
{positivos_txt}

Riesgos detectados:
{riesgos_txt}

{professional_context}

El resumen debe:
1. Explicar en una frase por qué obtuvo la clasificación "{classification}".
2. Resumir bloqueadores, project fit y prioridad comercial si están disponibles.
3. Indicar si el lead parece contactable, requiere revisión o conviene trabajarlo con plan de mejora.
4. Ser directo y útil para que el ejecutivo decida cómo priorizar este lead.

NO debes:
1. Hablar en primera persona por ningún motivo.
2. Calcular, modificar o cuestionar el score o la clasificación.
3. Decir que RutaHogar aprueba créditos.
4. Prometer aprobación bancaria, subsidios ni condiciones comerciales.
5. Reemplazar la evaluación bancaria formal.
Responde solo el resumen, sin títulos ni encabezados."""

    return _clean_generated_text(_ask_groq(prompt, max_tokens=200)) or None


def generate_commercial_guidance(
    classification: str,
    score: float,
    positive_indicators: list,
    risks: list,
    recommendations: list,
    financial_indicators=None,
    blockers=None,
    main_blocker=None,
    project_fit=None,
    commercial_priority_detail=None,
    structured_improvement_plan=None,
) -> str:
    """
    Sugiere una acción comercial concreta al ejecutivo según el perfil del lead.
    """
    riesgos_txt        = "\n".join(f"- {r}" for r in risks) or "- Sin riesgos relevantes"
    recomendaciones_txt = "\n".join(f"- {r['text'] if isinstance(r, dict) else r}" for r in recommendations) or "- Sin recomendaciones"
    positive_indicators_txt = "\n".join(f"- {p}" for p in positive_indicators) or"- Sin indicadores positivos"
    professional_context = _professional_context(
        financial_indicators=financial_indicators,
        blockers=blockers,
        main_blocker=main_blocker,
        project_fit=project_fit,
        commercial_priority_detail=commercial_priority_detail,
        structured_improvement_plan=structured_improvement_plan,
    )
    

    prompt = f"""Eres un ejecutivo comercial inmobiliario experimentado.
Tu tarea es redactar una guía comercial. El score y la clasificación ya fueron calculados por reglas del sistema.
La IA solo redacta explicaciones; no puede calcular ni modificar el score, la clasificación, bloqueadores o prioridad.

Lead a evaluar:
- Clasificación: {classification}

Score: {score}/100

Riesgos del lead:
{riesgos_txt}

Indicadores positivos del lead:
{positive_indicators_txt}

Recomendaciones del sistema:
{recomendaciones_txt}

{professional_context}

Indica UNA sola acción comercial concreta para este lead, usando especialmente commercial_priority_detail si está disponible.
No ejecutes derivaciones reales ni digas que se enviará a CRM; solo orienta.
Luego explica la razón considerando toda la calificación.

Formato de respuesta (respeta exactamente este formato):
Acción: [nombre de la acción]\n
Motivo: [explicación en máximo 30 palabras]

NO debes:
1. Hablar en primera persona por ningún motivo.
2. Calcular, modificar o cuestionar el score o la clasificación.
3. Decir que RutaHogar aprueba créditos.
4. Prometer aprobación bancaria, subsidios ni condiciones comerciales.
"""

    return _clean_generated_text(_ask_groq(prompt, max_tokens=120)) or None


def generate_user_explanation(
    classification: str,
    score: float,
    positive_indicators: list,
    risks: list,
    financial_indicators=None,
    blockers=None,
    main_blocker=None,
    project_fit=None,
    commercial_priority_detail=None,
    structured_improvement_plan=None,
) -> str:
    positivos_txt = "\n".join(f"- {p}" for p in positive_indicators) or "- Sin indicadores positivos"
    riesgos_txt   = "\n".join(f"- {r}" for r in risks) or "- Sin riesgos detectados"
    professional_context = _professional_context(
        financial_indicators=financial_indicators,
        blockers=blockers,
        main_blocker=main_blocker,
        project_fit=project_fit,
        commercial_priority_detail=commercial_priority_detail,
        structured_improvement_plan=structured_improvement_plan,
    )

    prompt = f"""Eres un asesor financiero hipotecario que habla directamente con una persona interesada en comprar vivienda.
Redacta UN párrafo de entre 80 y 120 palabras explicando los principales factores que influyeron en su calificación.
El score y la clasificación ya fueron calculados por reglas del sistema. La IA solo redacta la explicación.

Datos de la calificación:
- Score: {score}/100
- Clasificación: {classification}

Factores positivos:
{positivos_txt}

Factores de riesgo:
{riesgos_txt}

{professional_context}

El párrafo debe:
1. Mencionar brevemente lo que jugó a su favor.
2. Explicar de manera constructiva los factores de riesgo.
3. Usar bloqueador principal, project_fit y plan estructurado de mejora si existen.
4. Considerar, cuando aparezcan en los datos, ingreso y deuda, dividendo esperado, ahorro o pie, contrato y continuidad, morosidad, edad y plazo, complemento de renta, patrimonio y objetivo de vivienda.
5. Usar un tono empático, claro, profesional y prudente, sin tecnicismos ni fórmulas.
6. Hablar directamente al usuario en segunda persona (tú).
7. No mencionar el puntaje exacto ni los umbrales del sistema.

NO debes:
1. Calcular, modificar o cuestionar el score o la clasificación.
2. Decir que la persona está aprobada.
3. Decir que RutaHogar aprueba créditos.
4. Prometer aprobación bancaria, subsidios ni condiciones comerciales.
5. Reemplazar una evaluación bancaria formal.

Responde solo el párrafo, sin títulos ni encabezados."""

    explanation = _clean_generated_text(_ask_groq(prompt, max_tokens=250))
    if not explanation:
        return None

    disclaimer = "Esta precalificación es orientativa y no reemplaza una evaluación bancaria formal."
    if disclaimer not in explanation:
        explanation = f"{explanation}\n\n{disclaimer}"
    return explanation
