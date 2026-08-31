import os
from typing import Any, Optional
from fastapi import FastAPI
from pydantic import BaseModel, field_validator, model_validator
from fastapi.middleware.cors import CORSMiddleware
from .scoring import calculate_score
from .ai import (
    generate_commercial_guidance,
    generate_executive_summary,
    generate_user_explanation,
)

VALID_CONTRACT_TYPES = {"indefinido", "plazo_fijo", "independiente", "honorarios_variable"}
VALID_CONTINUITY_VALUES = {"menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios"}
VALID_DELINQUENCY_VALUES = {"si", "no"}
VALID_DELINQUENCY_AGE_VALUES = {"menos_3_meses", "3_a_12_meses", "1_a_3_anios", "mas_3_anios"}
VALID_PROPERTY_UNITS = {"uf", "clp"}
VALID_MORTGAGE_TERMS = {10, 15, 20, 25, 30}
VALID_PURCHASE_TERMS = {
    "inmediato",
    "3_a_6_meses",
    "6_a_12_meses",
    "mas_12_meses",
    "solo_explorando",
    "0_3_meses",
    "3_6_meses",
    "6_12_meses",
}
VALID_RELATION_TYPES = {
    "conyuge", "pareja_conviviente", "pareja_hijos_comun", "padre_madre",
    "hijo_hija", "hermano_hermana", "otro_familiar", "amigo", "otro",
}

app = FastAPI(title="RutaHogar")

LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5176",
]
EXTRA_FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("RUTAHOGAR_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# En entornos de despliegue real (Vercel production/preview) no exponer el regex
# de IP LAN usado para desarrollo; solo en ejecución local o Vercel development.
_is_deployed = os.environ.get("VERCEL_ENV") in {"production", "preview"}
_ALLOW_ORIGIN_REGEX = (
    r"https://.*\.vercel\.app"
    if _is_deployed
    else r"https://.*\.vercel\.app|http://\d+\.\d+\.\d+\.\d+:517[3-6]"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_FRONTEND_ORIGINS + EXTRA_FRONTEND_ORIGINS,
    allow_origin_regex=_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    ingreso_mensual: float
    deuda_mensual: float
    edad: int
    ahorro_disponible: float
    property_value: Optional[float] = None
    property_value_unit: Optional[str] = None
    property_value_uf: Optional[float] = None
    property_value_clp: Optional[float] = None
    uf_value_clp: Optional[float] = None
    plazo_credito_hipotecario: int
    tipo_contrato: str  # 'indefinido', 'plazo_fijo', 'independiente'
    continuidad_laboral: str
    morosidad_actual: str
    monto_morosidad: Optional[float] = None
    antiguedad_morosidad: Optional[str] = None
    comuna_objetivo: Optional[str] = None
    dividendo_estimado: Optional[float] = None
    dividendo_esperado: Optional[float] = None
    dividendo_estimado_origen: Optional[str] = None
    dividendo_estimado_calculado: Optional[float] = None
    dividendo_estimado_manual: Optional[float] = None
    dividendo_tasa_anual_referencial: Optional[float] = None
    dividendo_monto_credito_estimado_clp: Optional[float] = None
    dividendo_monto_credito_estimado_uf: Optional[float] = None
    dividendo_uf_referencial_clp: Optional[float] = None
    anonymous_flow_id: Optional[str] = None
    complemento_renta: bool = False
    ingreso_mensual_complementario: Optional[float] = None
    deuda_mensual_complementario: Optional[float] = None
    tipo_contrato_complementario: Optional[str] = None
    continuidad_laboral_complementario: Optional[str] = None
    morosidad_complementario: Optional[str] = None
    relacion_complementario: Optional[str] = None
    vivienda_nueva: Optional[bool] = None
    plazo_compra: Optional[str] = None
    tiene_propiedad_vista: Optional[bool] = None
    pie_en_cuotas_interes: Optional[bool] = None
    consentimiento: bool
    declara_patrimonio: bool = False
    valor_vehiculos: Optional[float] = 0.0
    valor_inmuebles: Optional[float] = 0.0
    patrimonio_unit: Optional[str] = "clp"

    @model_validator(mode="before")
    @classmethod
    def normalize_compatible_payload(cls, values: Any):
        if not isinstance(values, dict):
            return values

        data = dict(values)
        if data.get("dividendo_estimado") is None:
            dividend = (
                data.get("dividendo_esperado")
                or data.get("dividendo_estimado_manual")
                or data.get("dividendo_estimado_calculado")
            )
            if dividend is not None:
                data["dividendo_estimado"] = dividend

        purchase_term_aliases = {
            "0_3_meses": "inmediato",
            "3_6_meses": "3_a_6_meses",
            "6_12_meses": "6_a_12_meses",
        }
        if data.get("plazo_compra") in purchase_term_aliases:
            data["plazo_compra"] = purchase_term_aliases[data["plazo_compra"]]
        return data

    @field_validator("ingreso_mensual")
    @classmethod
    def validate_income(cls, value):
        if value <= 0:
            raise ValueError("El ingreso mensual debe ser mayor que 0")
        return value

    @field_validator("deuda_mensual", "ahorro_disponible", "dividendo_estimado")
    @classmethod
    def validate_non_negative(cls, value):
        if value is not None and value < 0:
            raise ValueError("El valor no puede ser negativo")
        return value

    @field_validator(
        "property_value", 
        "property_value_uf", 
        "property_value_clp", 
        "uf_value_clp",
        "monto_morosidad",
        "valor_vehiculos",
        "valor_inmuebles"
    )
    @classmethod
    def validate_optional_non_negative(cls, value):
        if value is not None and value < 0:
            raise ValueError("El valor no puede ser negativo")
        return value

    @field_validator("edad")
    @classmethod
    def validate_age(cls, value):
        if value < 18 or value > 100:
            raise ValueError("La edad debe estar entre 18 y 100")
        return value

    @field_validator("plazo_credito_hipotecario")
    @classmethod
    def validate_mortgage_term(cls, value):
        if value not in VALID_MORTGAGE_TERMS:
            raise ValueError("Plazo de crédito hipotecario inválido")
        return value

    @field_validator("tipo_contrato")
    @classmethod
    def validate_contract_type(cls, value):
        if value not in VALID_CONTRACT_TYPES:
            raise ValueError("Tipo de contrato inválido")
        return value

    @field_validator("continuidad_laboral")
    @classmethod
    def validate_work_continuity(cls, value):
        if value not in VALID_CONTINUITY_VALUES:
            raise ValueError("Continuidad laboral inválida")
        return value

    @field_validator("morosidad_actual")
    @classmethod
    def validate_current_delinquency(cls, value):
        if value not in VALID_DELINQUENCY_VALUES:
            raise ValueError("Morosidad actual inválida")
        return value

    @field_validator("antiguedad_morosidad")
    @classmethod
    def validate_delinquency_age(cls, value):
        if value is not None:
            if value not in VALID_DELINQUENCY_AGE_VALUES:
                raise ValueError("Antigüedad de morosidad inválida")
        return value

    @field_validator("property_value_unit")
    @classmethod
    def validate_property_value_unit(cls, value):
        if value is not None and value not in VALID_PROPERTY_UNITS:
            raise ValueError("Unidad de monto de vivienda inválida")
        return value

    @field_validator("plazo_compra")
    @classmethod
    def validate_purchase_term(cls, value):
        if value is not None and value not in VALID_PURCHASE_TERMS:
            raise ValueError("Plazo de compra inválido")
        return value

    @field_validator("consentimiento")
    @classmethod
    def validate_consent(cls, value):
        if not value:
            raise ValueError("El consentimiento es obligatorio")
        return value

    @field_validator("ingreso_mensual_complementario", "deuda_mensual_complementario")
    @classmethod
    def validate_complement_non_negative(cls, value):
        if value is not None and value < 0:
            raise ValueError("Los valores del co-deudor no pueden ser negativos")
        return value

    @field_validator("morosidad_complementario")
    @classmethod
    def validate_complement_delinquency(cls, value):
        if value is not None:
            if value not in VALID_DELINQUENCY_VALUES:
                raise ValueError("Morosidad del co-deudor inválida")
        return value

    @field_validator("tipo_contrato_complementario")
    @classmethod
    def validate_complement_contract(cls, value):
        if value is not None:
            if value not in VALID_CONTRACT_TYPES:
                raise ValueError("Tipo de contrato del co-deudor inválido")
        return value

    @field_validator("continuidad_laboral_complementario")
    @classmethod
    def validate_complement_continuity(cls, value):
        if value is not None:
            if value not in VALID_CONTINUITY_VALUES:
                raise ValueError("Continuidad laboral del co-deudor inválida")
        return value

    @field_validator("relacion_complementario")
    @classmethod
    def validate_complement_relation(cls, value):
        if value is not None:
            if value not in VALID_RELATION_TYPES:
                raise ValueError("Relación del complemento de renta inválida")
        return value

    @model_validator(mode="after")
    def validate_conditional_fields(self):
        if self.dividendo_estimado is None:
            raise ValueError("Debe indicar el dividendo estimado")
        if self.morosidad_actual == "si":
            if self.monto_morosidad is None or self.monto_morosidad <= 0:
                raise ValueError("Debe indicar el monto de morosidad")
            if not self.antiguedad_morosidad:
                raise ValueError("Debe indicar la antigüedad de morosidad")
        return self


@app.post("/score")
async def score_endpoint(payload: ScoreRequest):
    result = calculate_score(payload.model_dump())
    return result


class ExplainRequest(ScoreRequest):
    # "user": solo la explicación del usuario. "all": incluye también los
    # textos del ejecutivo (resumen y guía comercial).
    scope: str = "user"

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, value):
        if value not in {"user", "all"}:
            raise ValueError("Scope inválido")
        return value


@app.post("/score/explain")
async def explain_endpoint(payload: ExplainRequest):
    """
    Regenera los textos de IA para una preevaluación ya calculada.
    Recalcula el scoring localmente (sin gastar llamadas de IA en el score)
    y devuelve únicamente los textos generados. Si un texto no pudo
    generarse, su campo llega en null: el detalle del fallo nunca se expone
    al cliente.
    """
    data = payload.model_dump(exclude={"scope"})
    base = calculate_score(data, include_ai=False)

    response = {
        "score": base.get("score"),
        "classification": base.get("classification"),
        "ai_explanation": None,
        "executive_summary": None,
        "commercial_guidance": None,
    }

    response["ai_explanation"] = generate_user_explanation(
        classification=base["classification"],
        score=base["score"],
        positive_indicators=base["positive_indicators"],
        risks=base["risks"],
    )

    if payload.scope == "all":
        response["executive_summary"] = generate_executive_summary(
            classification=base["classification"],
            score=base["score"],
            positive_indicators=base["positive_indicators"],
            risks=base["risks"],
        )
        response["commercial_guidance"] = generate_commercial_guidance(
            classification=base["classification"],
            score=base["score"],
            positive_indicators=base["positive_indicators"],
            risks=base["risks"],
            recommendations=base["recommendations"],
        )

    return response
