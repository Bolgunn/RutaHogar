"""Constants and tunables for the Virtual Assistant."""

from pathlib import Path

# File paths
KB_DIR = Path(__file__).resolve().parent / "kb"
KB_PATH = KB_DIR / "kb.json"

# Retrieval thresholds & weights
MIN_RETRIEVAL_SCORE = 1.0
EXACT_HIT_SCORE = 4.0
TOP_K_CHUNKS = 3

TITLE_WEIGHT = 3.0
SYNONYMS_WEIGHT = 2.5
CONTENT_WEIGHT = 1.0

SCREEN_MATCH_BOOST = 0.5
FIELD_MATCH_BOOST = 3.5

# Chat limits & sanitization
MAX_MESSAGE_LENGTH = 500
MAX_HISTORY_MESSAGES = 6
MAX_RESPONSE_TOKENS = 350
LLM_TIMEOUT_SECONDS = 6.0
LLM_COOLDOWN_SECONDS = 30.0

# Guard messages (S1 / S7 safeguards)
GUARD_CREDIT_APPROVAL_RESPONSE = (
    "Como asistente virtual de RutaHogar, puedo orientarte sobre los conceptos y pasos de la plataforma, "
    "pero no tengo la facultad de aprobar créditos ni modificar tu puntaje financiero. "
    "El resultado entregado por RutaHogar es meramente orientativo y referencial; la evaluación y aprobación "
    "formal del crédito corresponde exclusivamente a las instituciones financieras (bancos y mutuarias)."
)

GUARD_ADVICE_DISCLAIMER = (
    "Recuerda que la información entregada es de orientación general y no constituye asesoría financiera vinculante."
)

DEFAULT_NOT_FOUND_RESPONSE = (
    "No encontré información suficiente en la guía de RutaHogar para responder a tu consulta específica. "
    "¿Podrías reformular tu pregunta o indicar sobre qué paso o campo tienes dudas? "
    "Si necesitas ayuda especializada, puedes solicitar contacto con soporte."
)

WELCOME_MESSAGE = (
    "¡Hola! Soy tu asistente virtual de RutaHogar. Puedo orientarte sobre los pasos de la pre-evaluación, "
    "el significado de cada campo y conceptos financieros. ¿En qué te puedo ayudar hoy?"
)
