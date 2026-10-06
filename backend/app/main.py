import asyncio
import logging
import os
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env local si existe
load_dotenv()

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from fastapi.middleware.cors import CORSMiddleware
from .market_data.service import MarketSnapshotUnavailable, resolve_market_snapshot_from_environment
from .market_data.repository import MarketRepositoryError
from .scoring import calculate_score
from .properties_search import DEFAULT_SIMILARITY_THRESHOLD, EmbeddingError, search_properties
from .ai import (
    generate_commercial_guidance,
    generate_executive_summary,
    generate_user_explanation,
)
from .routers import crm_mock
from .tracking.routes import router as tracking_router
from .academy_news import router as academy_news_router

logger = logging.getLogger(__name__)


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
app.include_router(crm_mock.router, prefix="/api/v1/crm-mock", tags=["CRM Mock"])
app.include_router(academy_news_router)

# HU13 has its own authenticated contract; POST /score is unchanged.
app.include_router(tracking_router)

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
    market_snapshot_fetched_at: Optional[str] = None
    plazo_credito_hipotecario: Optional[int] = None
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
    time_to_submit: Optional[int] = None
    device_id_hash: Optional[str] = None

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
        if value is not None and value not in VALID_MORTGAGE_TERMS:
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
    # The request never calls BCCh or starts a refresh: it only resolves storage.
    try:
        snapshot = await asyncio.to_thread(resolve_market_snapshot)
    except (MarketSnapshotUnavailable, MarketRepositoryError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if (
        payload.market_snapshot_fetched_at
        and payload.market_snapshot_fetched_at != snapshot["fetched_at"]
    ):
        raise HTTPException(
            status_code=409,
            detail="La referencia de mercado se actualizó. Vuelve a cargarla antes de calcular.",
        )

    data = payload.model_dump()

    # -------------------------------------------------------------
    # REGLA DE BACKEND: Tanteo / Múltiples Intentos
    # -------------------------------------------------------------
    device_hash = data.get("device_id_hash")
    intentos_previos = 0
    ahorro_previo = None

    if device_hash:
        try:
            from .ml_fraud import get_supabase_client
            supabase = get_supabase_client()

            hace_24_horas = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

            response = supabase.table("evaluations") \
                .select("financial_data, created_at") \
                .eq("financial_data->input->>device_id_hash", device_hash) \
                .gte("created_at", hace_24_horas) \
                .order("created_at", desc=False) \
                .execute()

            filas = response.data if response.data else []

            quince_minutos_atras = datetime.now(timezone.utc) - timedelta(minutes=15)
            intentos_15m = 0

            for f in filas:
                dt = datetime.fromisoformat(f["created_at"].replace("Z", "+00:00"))
                if dt >= quince_minutos_atras:
                    intentos_15m += 1

                if ahorro_previo is None:
                    fin_data = f.get("financial_data") or {}
                    inp = fin_data.get("input") or {}
                    ah_disp = inp.get("ahorro_disponible")
                    if ah_disp is not None:
                        ahorro_previo = float(ah_disp)

            intentos_previos = intentos_15m

        except Exception as e:
            print(f"Error consultando historial de intentos: {e}")

    # Inyectamos el historial de intentos al payload
    data["intentos_previos"] = intentos_previos

    if ahorro_previo is not None:
        data["ahorro_previo_24h"] = ahorro_previo

    return calculate_score(data, market_snapshot=snapshot)


def resolve_market_snapshot() -> dict:
    """Small injectable boundary used by the endpoint and its contract tests."""
    return resolve_market_snapshot_from_environment()


@app.get("/market-reference")
async def market_reference_endpoint():
    """Public projection of the persisted snapshot; never calls BCCh."""
    try:
        snapshot = await asyncio.to_thread(resolve_market_snapshot)
    except (MarketSnapshotUnavailable, MarketRepositoryError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    uf_source = snapshot["source"]["uf_value_clp"]
    return {
        "uf_value_clp": snapshot["uf_value_clp"],
        "effective_date": uf_source["effective_date"],
        "snapshot_effective_date": snapshot["effective_date"],
        "snapshot_fetched_at": snapshot["fetched_at"],
        "source": {
            "provider": uf_source["provider"],
            "series": uf_source["series"],
        },
    }


class PropertySearchRequest(BaseModel):
    query: str
    commune: Optional[str] = None
    max_price_uf: Optional[float] = None
    property_type: Optional[str] = None
    limit: Optional[int] = 10
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD


@app.post("/api/properties/search")
@app.post("/properties/search")
async def properties_search_endpoint(payload: PropertySearchRequest):
    try:
        return search_properties(
            query=payload.query,
            commune=payload.commune,
            max_price_uf=payload.max_price_uf,
            property_type=payload.property_type,
            limit=payload.limit or 10,
            similarity_threshold=payload.similarity_threshold,
        )
    except EmbeddingError as exc:
        logger.warning("Búsqueda de propiedades sin embedding: %s", exc)
        raise HTTPException(status_code=503, detail="El buscador no está disponible en este momento.")

class ExplainRequest(ScoreRequest):
    # Narrative retry recalculates authoritative score inputs without spending AI.
    scope: str = "user"

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, value):
        if value not in {"user", "all"}:
            raise ValueError("Scope inválido")
        return value


@app.post("/score/explain")
async def explain_endpoint(payload: ExplainRequest):
    """Regenerate narratives from a server-calculated, non-AI score result."""
    try:
        snapshot = await asyncio.to_thread(resolve_market_snapshot)
    except (MarketSnapshotUnavailable, MarketRepositoryError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if payload.market_snapshot_fetched_at and payload.market_snapshot_fetched_at != snapshot["fetched_at"]:
        raise HTTPException(status_code=409, detail="La referencia de mercado se actualizó. Vuelve a cargarla antes de generar la explicación.")
    base = calculate_score(payload.model_dump(exclude={"scope"}), include_ai=False, market_snapshot=snapshot)

    response = {
        "score": base.get("score"),
        "classification": base.get("classification"),
        "ai_explanation": None,
        "executive_summary": None,
        "commercial_guidance": None,
    }

    response["ai_explanation"] = generate_user_explanation(
        classification=base["classification"], score=base["score"],
        positive_indicators=base.get("positive_indicators", []), risks=base.get("risks", []),
    )

    if payload.scope == "all":
        response["executive_summary"] = generate_executive_summary(
            classification=base["classification"],
            score=base["score"],
            positive_indicators=base.get("positive_indicators", []), risks=base.get("risks", []),
        )
        response["commercial_guidance"] = generate_commercial_guidance(
            classification=base["classification"],
            score=base["score"],
            positive_indicators=base.get("positive_indicators", []), risks=base.get("risks", []),
            recommendations=base.get("recommendations", []),
        )

    return response



# --- HU 9: interés en un proyecto ---
# El catálogo de proyectos NO vive aquí. La fuente única es la tabla
# `proyectos` de Supabase, que el frontend lee vía services/projectService.js
# (contrato congelado en docs/project-catalog-contract.md). Antes existía en
# este archivo un MOCK_PROYECTOS con cinco dicts y un GET /projects que lo
# servía; se eliminó porque era una segunda fuente de proyectos, invisible para
# el administrador que mantiene el catálogo. Ver
# docs/stories/CATALOGO-UNICO-HU9/PLAN.md.


class InterestRequest(BaseModel):
    proyecto_id: str
    contactar_ejecutivo: bool
    email: Optional[str] = None

@app.post("/interest")
async def post_interest(payload: InterestRequest):
    if payload.contactar_ejecutivo:
        return {"status": "success", "message": "Notificación enviada al ejecutivo exitosamente."}
    return {"status": "success", "message": "Interés guardado correctamente."}
