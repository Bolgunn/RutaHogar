"""
Módulo centralizado de configuración de RutaHogar Backend.
Carga variables de entorno desde el archivo .env y expone la única fuente de verdad
para las credenciales de Supabase, Groq, Apify y otros servicios.
"""

import os
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
_project_dir = _backend_dir.parent

_env_candidates = [
    _backend_dir / ".env",
    _project_dir / ".env",
]

for env_file in _env_candidates:
    if env_file.exists():
        try:
            with open(env_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        key = key.strip()
                        val = value.strip().strip("'\"")
                        if key and key not in os.environ:
                            os.environ[key] = val
        except Exception:
            pass


def get_supabase_url() -> str:
    """Retorna la URL oficial del proyecto Supabase."""
    return (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    )


def get_supabase_key() -> str:
    """Retorna la clave de API / Service Role Key de Supabase para operaciones del backend."""
    return (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
        or ""
    )


def get_apify_api_key() -> str:
    """Retorna la API Key oficial de Apify."""
    return os.environ.get("APIFY_API_KEY", "")


def get_apify_actor_id() -> str:
    """Retorna el ID del actor de Apify por defecto."""
    return os.environ.get(
        "APIFY_ACTOR_ID",
        "scraperschile/portal-inmobiliario-chile-scraper-api"
    )


def get_groq_api_key() -> str:
    """Retorna la API Key oficial de Groq para explicaciones IA."""
    return os.environ.get("GROQ_API_KEY", "")


def get_embedding_provider() -> str:
    """Proveedor de embeddings del RAG: "hashing" (local, por defecto) u "openai"."""
    return os.environ.get("EMBEDDING_PROVIDER", "hashing").strip().lower()


def get_openai_api_key() -> str:
    """Retorna la API Key de OpenAI usada solo para embeddings del portal (HU19)."""
    return os.environ.get("OPENAI_API_KEY", "")


def get_embedding_model() -> str:
    """Modelo de embeddings de OpenAI; debe aceptar `dimensions` para calzar con vector(384)."""
    return os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
