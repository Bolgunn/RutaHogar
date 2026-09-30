# Constants for the future professional scoring engine.
# They do not replace the current logic in backend/app/scoring.py yet.
# Version 1.1.0-prep is preparatory and must not be exposed as a functional
# algorithm change until these layers are explicitly integrated.

ALGORITHM_VERSION = "1.1.0-prep"

VALOR_UF_CLP = 40695
VALOR_UF_FECHA = "2026-08-16"

CLASSIFICATION_THRESHOLDS = {
    "alto": 75,
    "medio": 50,
}

SCORING_WEIGHTS = {
    "capacidad_pago": 0.25,
    "endeudamiento": 0.20,
    "pie_ahorro": 0.20,
    "estabilidad_laboral": 0.15,
    "historial_pago": 0.10,
    "complemento_renta": 0.05,
    "calidad_datos": 0.05,
}

BLOCKER_SEVERITIES = {
    "info": "info",
    "low": "low",
    "medium": "medium",
    "high": "high",
    "critical": "critical",
}

PROJECT_FIT_CLASSIFICATIONS = {
    "compatible": "Compatible",
    "near": "Cercano",
    "out_of_reach": "Fuera de alcance",
    "requires_info": "Requiere antecedentes",
}

COMMERCIAL_ACTIONS = {
    "contact_now": "Contactar ahora",
    "contact_with_review": "Contactar con revisión",
    "nurture": "Nutrir con plan de mejora",
    "reorient": "Reorientar a otro proyecto",
    "request_info": "Solicitar antecedentes",
    "do_not_route": "No derivar todavía",
}

FOGAES_MAX_PROPERTY_UF = 6000
FOGAES_MAX_UF_CON_SUBSIDIO = 3000
FOGAES_MIN_PIE_RATIO = 0.10

DS49_MIN_AHORRO_UF = 10
DS49_MIN_EDAD = 18
DS49_RSH_VULNERABLE_MAX = 40

DS1_MIN_AHORRO_MESES = 12
DS1_TRAMO_I_AHORRO_UF = 30
DS1_TRAMO_I_TOPE_UF = 1100
DS1_TRAMO_I_RSH_MAX = 60
DS1_TRAMO_I_RSH_ADULTO_MAYOR = 90
DS1_TRAMO_II_AHORRO_UF = 40
DS1_TRAMO_II_TOPE_UF = 1600
DS1_TRAMO_II_RSH_MAX = 80
DS1_TRAMO_II_RSH_ADULTO_MAYOR = 90
DS1_TRAMO_III_AHORRO_UF = 80
DS1_TRAMO_III_TOPE_UF = 2200

LEASING_MIN_EDAD = 18

LEY_21748_TOPE_UF = 4000
LEY_21748_TASA_REDUCCION_PB = 0.60

# ALG-9 — capacidad de compra (HU 10). Ver docs/algorithms/ALG-9-purchase-capacity.md.
# Los topes FOGAES son de ALG-8 (housing_benefits.py) y se reutilizan, no se redeclaran.
MATCHING_VERSION = "e4-matching-v1"

TASA_REFERENCIA_UF_ANUAL = 0.040
PIE_RATIO_BASE = 0.20
RATIO_DIVIDENDO_MAX = 0.30
RATIO_CARGA_TOTAL_MAX = 0.45
RATIO_DIVIDENDO_SALUDABLE = 0.25
PLAZO_REFERENCIA_ANIOS = 30
PLAZO_MINIMO_VIABLE_ANIOS = 5
EDAD_MAX_FIN_CREDITO = 70
