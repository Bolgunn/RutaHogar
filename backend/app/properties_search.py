import os
import math
import re
import html
import json
import logging
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional

# Disclaimer legal obligatorio (Criterio E4)
RUTAHOGAR_REFERENTIAL_DISCLAIMER = (
    "La información exhibida sobre las propiedades es de carácter referencial e informativa, "
    "obtenida desde fuentes públicas de Portal Inmobiliario. Te recomendamos verificar directamente "
    "en la fuente original o con el ejecutivo comercial las condiciones actualizadas del inmueble "
    "y evaluar tu calificación crediticia en RutaHogar."
)

EMPTY_RESULTS_SUGGESTION = (
    "No se encontraron propiedades que coincidan con tus criterios de búsqueda. "
    "Te sugerimos flexibilizar los filtros de comuna, aumentar el tope de precio en UF o utilizar términos más generales."
)

# Dimensión del vector para pgvector (384 float vector)
VECTOR_DIMENSION = 384

# Única fuente del umbral: se aplica sobre la similitud ya ajustada por intención,
# por eso la RPC recupera candidatos sin umbral (match_threshold = 0).
DEFAULT_SIMILARITY_THRESHOLD = 0.85
SUPABASE_TIMEOUT_SECONDS = 5
# Serverless Inference API de Hugging Face: torch no cabe en el límite de 250 MB de Vercel.
# Sus 384 dims calzan con proyectos_rag.embedding vector(384).
EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-small"
# api-inference.huggingface.co ya no responde; el router es su reemplazo oficial.
HUGGINGFACE_EMBEDDINGS_URL = (
    f"https://router.huggingface.co/hf-inference/models/{EMBEDDING_MODEL_NAME}/pipeline/feature-extraction"
)
HUGGINGFACE_TIMEOUT_SECONDS = 40
# Reintentos ante 503 (modelo dormido en cold start), con espera exponencial.
HUGGINGFACE_MAX_RETRIES = 3
HUGGINGFACE_BACKOFF_SECONDS = 2
HUGGINGFACE_BATCH_SIZE = 32

logger = logging.getLogger(__name__)

# Las 52 comunas de la Región Metropolitana, sin tildes. Una comuna que no se
# reconoce no penaliza, y el catálogo de otra comuna se colaría como resultado.
RM_COMMUNES = (
    "santiago", "cerrillos", "cerro navia", "conchali", "el bosque", "estacion central",
    "huechuraba", "independencia", "la cisterna", "la florida", "la granja", "la pintana",
    "la reina", "las condes", "lo barnechea", "lo espejo", "lo prado", "macul", "maipu",
    "nunoa", "pedro aguirre cerda", "penalolen", "providencia", "pudahuel", "quilicura",
    "quinta normal", "recoleta", "renca", "san joaquin", "san miguel", "san ramon",
    "vitacura", "puente alto", "pirque", "san jose de maipo", "colina", "lampa", "tiltil",
    "san bernardo", "buin", "calera de tango", "paine", "melipilla", "alhue", "curacavi",
    "maria pinto", "san pedro", "talagante", "el monte", "isla de maipo",
    "padre hurtado", "penaflor",
)
_RM_COMMUNES_BY_LENGTH = sorted(RM_COMMUNES, key=len, reverse=True)

# Las bonificaciones solo desempatan: el rango útil de E5 es ~0.78-0.92, así que
# sumas mayores aplastan la similitud semántica contra el tope.
ATTRIBUTE_EXACT_BOOST = 0.02
ATTRIBUTE_ABOVE_BOOST = 0.01
ATTRIBUTE_MISS_PENALTY = 0.10
# Tipo o comuna distintos a los pedidos no son un resultado parcial: se descartan.
HARD_MISMATCH_PENALTY = 2.0


def _strip_accents(text: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", text) if unicodedata.category(char) != "Mn"
    )


def _extract_query_intent(query_text: str) -> Dict[str, Any]:
    """Extracts numerical intent from query (bathrooms, bedrooms, max price UF)."""
    intent = {
        "req_banos": None,
        "req_dormitorios": None,
        "req_max_uf": None,
    }
    q = html.unescape(query_text or "").lower()

    # 1. Dormitorios / Baños combinados (ej: "2d2b", "2d 2b", "3d2b", "2d+2b")
    m_comb = re.search(r"(\d+)\s*d[^\d]*(\d+)\s*b", q)
    if m_comb:
        intent["req_dormitorios"] = int(m_comb.group(1))
        intent["req_banos"] = int(m_comb.group(2))

    # 2. Baños (ej: "2 baños", "2 banos", "2 b", "con 2 baños")
    if intent["req_banos"] is None:
        m_b = re.search(r"(\d+)\s*(?:baño|baños|bano|banos|b\b)", q)
        if m_b:
            intent["req_banos"] = int(m_b.group(1))

    # 3. Dormitorios (ej: "3 dormitorios", "3 dorm", "3d")
    if intent["req_dormitorios"] is None:
        m_d = re.search(r"(\d+)\s*(?:dormitorio|dormitorios|dorm|d\b)", q)
        if m_d:
            intent["req_dormitorios"] = int(m_d.group(1))

    # 4. Máximo precio UF en texto (ej: "hasta 3000 uf", "bajo 4000uf", "3000 uf")
    # En Chile el punto separa miles ("3.000 UF") y la coma decimales ("2.650,5 UF").
    m_uf = re.search(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*uf", q)
    if m_uf:
        entero = m_uf.group(1).replace(".", "")
        decimales = m_uf.group(2)
        intent["req_max_uf"] = float(f"{entero}.{decimales}" if decimales else entero)
    # 5. Tipo de vivienda ("depto", "dpto", "casas"... ya normalizados)
    m_tipo = re.search(r"\b(departamento|casa)\b", _normalize_terms(q))
    if m_tipo:
        intent["req_tipo"] = m_tipo.group(1)

    # 6. Comuna: la más larga primero, para que "san joaquin" no se lea como "san" + otra.
    q_plain = _strip_accents(q)
    for comuna in _RM_COMMUNES_BY_LENGTH:
        if re.search(rf"\b{re.escape(comuna)}\b", q_plain):
            intent["req_comuna"] = comuna
            break

    return intent

def _adjust_similarity_score(item: Dict[str, Any], base_sim: float, intent: Dict[str, Any], query_text: str) -> float:
    """Aplica impulsos y penalizaciones según atributos numéricos requeridos en la consulta."""
    sim = base_sim
    banos = int(item.get("banos") or item.get("bathrooms") or 1)
    dormitorios = int(item.get("dormitorios") or item.get("bedrooms") or 1)
    precio_uf = float(item.get("valor_uf") or item.get("price_uf") or 0.0)
    commune = _strip_accents(str(item.get("comuna") or item.get("commune") or "").lower().strip())

    for requerido, actual in ((intent.get("req_banos"), banos), (intent.get("req_dormitorios"), dormitorios)):
        if requerido is None:
            continue
        if actual == requerido:
            sim += ATTRIBUTE_EXACT_BOOST
        elif actual > requerido:
            sim += ATTRIBUTE_ABOVE_BOOST
        else:
            sim -= ATTRIBUTE_MISS_PENALTY

    req_uf = intent.get("req_max_uf")
    if req_uf is not None and req_uf > 0:
        if precio_uf <= req_uf:
            sim += ATTRIBUTE_EXACT_BOOST
        else:
            sim -= ATTRIBUTE_MISS_PENALTY

    req_t = intent.get("req_tipo")
    if req_t:
        item_tipo = _normalize_property_type(item.get("tipo_vivienda") or item.get("property_type"))
        if item_tipo and item_tipo != req_t:
            sim -= HARD_MISMATCH_PENALTY

    req_c = intent.get("req_comuna")
    if req_c:
        if commune == req_c:
            sim += ATTRIBUTE_EXACT_BOOST
        else:
            sim -= HARD_MISMATCH_PENALTY

    # Tope en 1.0 solo para que el porcentaje mostrado no pase de 100%.
    return max(0.0, min(1.0, float(sim)))


class EmbeddingError(RuntimeError):
    """El proveedor de embeddings configurado no pudo vectorizar el texto."""


# Abreviaturas chilenas que el usuario escribe y el catálogo no; el modelo no sabe
# que "depto" es "departamento".
_TERM_SYNONYMS = {
    "depto": "departamento",
    "deptos": "departamento",
    "dpto": "departamento",
    "dptos": "departamento",
    "depa": "departamento",
    "depas": "departamento",
    "departamentos": "departamento",
    "casas": "casa",
}


def _normalize_terms(text: str) -> str:
    return re.sub(
        r"\b(" + "|".join(_TERM_SYNONYMS) + r")\b",
        lambda m: _TERM_SYNONYMS[m.group(1)],
        html.unescape(text or "").lower(),
    )


def _normalize_property_type(value: Any) -> str:
    tipo = str(value or "").strip().lower()
    return _TERM_SYNONYMS.get(tipo, tipo)


def _cta_text(property_type: Any) -> str:
    tipo = _normalize_property_type(property_type)
    if tipo == "departamento":
        return "Ver si califico para este departamento"
    if tipo == "casa":
        return "Ver si califico para esta casa"
    return "Ver si califico para esta propiedad"


def _request_embeddings(inputs: List[str]) -> List[List[float]]:
    from .config import get_huggingface_api_key

    api_key = get_huggingface_api_key()
    if not api_key:
        raise EmbeddingError("Falta HUGGINGFACE_API_KEY para generar embeddings.")

    request = urllib.request.Request(
        HUGGINGFACE_EMBEDDINGS_URL,
        data=json.dumps({"inputs": inputs}).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(HUGGINGFACE_MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=HUGGINGFACE_TIMEOUT_SECONDS) as response:
                vectors = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 503 and attempt < HUGGINGFACE_MAX_RETRIES:
                delay = HUGGINGFACE_BACKOFF_SECONDS * 2 ** attempt
                logger.info("Hugging Face 503 (modelo cargando); reintento %d en %ds", attempt + 1, delay)
                time.sleep(delay)
                continue
            raise EmbeddingError(f"Hugging Face respondió HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise EmbeddingError(f"No se pudo contactar a Hugging Face: {exc}") from exc

    if (
        not isinstance(vectors, list)
        or len(vectors) != len(inputs)
        or any(not isinstance(v, list) or len(v) != VECTOR_DIMENSION for v in vectors)
    ):
        raise EmbeddingError("Hugging Face devolvió embeddings con un formato inesperado.")
    return vectors


def generate_text_embeddings(texts: List[str], kind: str = "passage") -> List[List[float]]:
    """
    Vectoriza en lotes con multilingual-e5-small (384 dims, norma L2). La ingesta y la
    consulta pasan por aquí para que los vectores de Supabase y los de la consulta vivan
    en el mismo espacio. e5 exige el prefijo "query: " o "passage: " según el lado.
    """
    inputs = [f"{kind}: {_normalize_terms(text)}" for text in texts]
    vectors: List[List[float]] = []
    for i in range(0, len(inputs), HUGGINGFACE_BATCH_SIZE):
        vectors.extend(_request_embeddings(inputs[i:i + HUGGINGFACE_BATCH_SIZE]))
    return vectors


def generate_text_embedding(text: str, kind: str = "query") -> List[float]:
    return generate_text_embeddings([text], kind=kind)[0]


def calculate_cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calcula la similitud de coseno entre dos vectores numéricos."""
    if len(vec1) != len(vec2) or not vec1 or not vec2:
        return 0.0
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    similarity = dot_product / (norm1 * norm2)
    # Acotar entre -1.0 y 1.0 por imprecisión flotante
    return max(-1.0, min(1.0, float(similarity)))

# Catálogo semilla inicial de propiedades extraídas vía Apify desde Portal Inmobiliario
SAMPLE_PROPERTIES_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Departamento 2D1B cercano a Metro Bellas Artes",
        "description": "Hermoso departamento de 2 dormitorios y 1 baño con balcón, vista despejada, cocina equipada. Excelente conectividad a pasos de metro Bellas Artes y Parque Forestal.",
        "price_uf": 2650.0,
        "price_clp": 100700000.0,
        "commune": "Santiago",
        "address": "Santo Domingo 850",
        "property_type": "departamento",
        "bedrooms": 2,
        "bathrooms": 1,
        "surface_m2": 52.0,
        "url": "https://www.portalinmobiliario.com/venta/departamento/santiago/1234",
        "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "title": "Moderno Departamento 1D1B en Providencia / Metro Manuel Montt",
        "description": "Departamento estudio tipo suite 1 dormitorio y 1 baño en pleno corazón de Providencia. Ideal inversionistas o primera vivienda. Edificio con gimnasio y piscina.",
        "price_uf": 3200.0,
        "price_clp": 121600000.0,
        "commune": "Providencia",
        "address": "Av. Nueva Providencia 1350",
        "property_type": "departamento",
        "bedrooms": 1,
        "bathrooms": 1,
        "surface_m2": 38.0,
        "url": "https://www.portalinmobiliario.com/venta/departamento/providencia/2345",
        "image_url": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    },
    {
        "id": "33333333-3333-3333-3333-333333333333",
        "title": "Departamento Familiar 3D2B con Estacionamiento en Ñuñoa",
        "description": "Amplio departamento de 3 dormitorios, 2 baños, estacionamiento subterráneo y bodega. Barrio residencial muy tranquilo cercano a Metro Chile España.",
        "price_uf": 4850.0,
        "price_clp": 184300000.0,
        "commune": "Ñuñoa",
        "address": "Av. Irarrázaval 3400",
        "property_type": "departamento",
        "bedrooms": 3,
        "bathrooms": 2,
        "surface_m2": 85.0,
        "url": "https://www.portalinmobiliario.com/venta/departamento/nunoa/3456",
        "image_url": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    },
    {
        "id": "44444444-4444-4444-4444-444444444444",
        "title": "Casa 4D3B con Jardín y Quincho en Las Condes",
        "description": "Espectacular casa de 2 pisos, 4 dormitorios, 3 baños, amplio jardín con piscina y quincho. Sector exclusivo de Las Condes cercano a colegios.",
        "price_uf": 11500.0,
        "price_clp": 437000000.0,
        "commune": "Las Condes",
        "address": "Camino El Alba 9200",
        "property_type": "casa",
        "bedrooms": 4,
        "bathrooms": 3,
        "surface_m2": 210.0,
        "url": "https://www.portalinmobiliario.com/venta/casa/las-condes/4567",
        "image_url": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    },
    {
        "id": "55555555-5555-5555-5555-555555555555",
        "title": "Departamento 2D2B Económico en La Florida / Metro Mirador",
        "description": "Excelente oportunidad para primera vivienda o subsidio DS19. Departamento 2 dormitorios 2 baños con gastos comunes bajos a pasos del Mall Plaza Vespucio.",
        "price_uf": 2150.0,
        "price_clp": 81700000.0,
        "commune": "La Florida",
        "address": "Vicuña Mackenna 7300",
        "property_type": "departamento",
        "bedrooms": 2,
        "bathrooms": 2,
        "surface_m2": 58.0,
        "url": "https://www.portalinmobiliario.com/venta/departamento/la-florida/5678",
        "image_url": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    },
    {
        "id": "66666666-6666-6666-6666-666666666666",
        "title": "Departamento 2D1B Remodelado en San Miguel",
        "description": "Departamento remodelado 2 dormitorios 1 baño cerca de Metro El Llano. Piso flotante, cocina americana e iluminación LED.",
        "price_uf": 2400.0,
        "price_clp": 91200000.0,
        "commune": "San Miguel",
        "address": "Gran Avenida 3800",
        "property_type": "departamento",
        "bedrooms": 2,
        "bathrooms": 1,
        "surface_m2": 49.0,
        "url": "https://www.portalinmobiliario.com/venta/departamento/san-miguel/6789",
        "image_url": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
        "source": "Portal Inmobiliario (Apify)"
    }
]

def _local_catalog_embeddings() -> List[List[float]]:
    global _local_catalog_vectors
    if _local_catalog_vectors is None:
        _local_catalog_vectors = generate_text_embeddings([
            f"{prop['title']} {prop['description']} {prop['commune']} {prop['property_type']} {prop['bedrooms']} dormitorios"
            for prop in SAMPLE_PROPERTIES_CATALOG
        ])
    return _local_catalog_vectors


_local_catalog_vectors: Optional[List[List[float]]] = None


def _query_supabase_proyectos_rag(
    query_vec: List[float],
    commune: Optional[str] = None,
    max_price_uf: Optional[float] = None,
    property_type: Optional[str] = None,
    limit: int = 12,
) -> Optional[List[Dict[str, Any]]]:
    """Consulta la función RPC match_proyectos_rag o la tabla public.proyectos_rag en Supabase."""
    try:
        from .config import get_supabase_url, get_supabase_key
        supabase_url = get_supabase_url()
        supabase_key = get_supabase_key()
    except Exception:
        return None

    if not supabase_url or not supabase_key:
        return None

    headers = {
        "Content-Type": "application/json",
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }

    req_limit = 500

    # 1. Intentar llamar a la función RPC match_proyectos_rag
    rpc_endpoint = f"{supabase_url.rstrip('/')}/rest/v1/rpc/match_proyectos_rag"
    payload_data = {
        "query_embedding": query_vec,
        "match_threshold": 0.0,
        "match_count": req_limit,
        "filter_commune": commune if commune else None,
        "filter_max_price_uf": max_price_uf if max_price_uf else None,
        "filter_property_type": property_type if property_type else None,
    }

    try:
        payload = json.dumps(payload_data).encode("utf-8")
        req = urllib.request.Request(
            rpc_endpoint,
            data=payload,
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            # Una lista vacía es una respuesta legítima (catálogo vacío o sin
            # coincidencias), no un fallo: no debe disparar el escaneo de la tabla.
            if isinstance(rows, list):
                return rows
    except Exception as exc:
        logger.warning("RPC match_proyectos_rag falló, se consulta la tabla directamente: %s", exc)

    # 2. Fallback: Consulta directa a la tabla public.proyectos_rag vía REST API de Supabase
    table_url = f"{supabase_url.rstrip('/')}/rest/v1/proyectos_rag?select=*"
    if commune:
        table_url += f"&comuna=ilike.*{urllib.parse.quote(commune)}*"
    if max_price_uf:
        table_url += f"&valor_uf=lte.{max_price_uf}"
    if property_type:
        table_url += f"&tipo_vivienda=eq.{urllib.parse.quote(property_type)}"
    
    table_url += f"&limit={req_limit}"

    try:
        req = urllib.request.Request(table_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            if isinstance(rows, list):
                for r in rows:
                    r_vec = r.get("embedding")
                    # PostgREST serializa vector(384) como texto "[0.1,...]".
                    if isinstance(r_vec, str):
                        try:
                            r_vec = json.loads(r_vec)
                        except ValueError:
                            r_vec = None
                    if r_vec and isinstance(r_vec, list) and len(r_vec) == len(query_vec):
                        r["similarity"] = calculate_cosine_similarity(query_vec, r_vec)
                    else:
                        r["similarity"] = 0.0
                rows.sort(key=lambda x: x.get("similarity", 0), reverse=True)
                return rows
    except Exception as exc:
        logger.warning("Consulta a proyectos_rag falló, se usa el catálogo local: %s", exc)

    return None


def _empty_results_suggestion(intent: Dict[str, Any]) -> str:
    if intent.get("req_comuna"):
        return (
            f"Por ahora no tenemos propiedades en {intent['req_comuna'].title()}. "
            "Prueba con otra comuna o quítala de la búsqueda para ver todo el catálogo."
        )
    return EMPTY_RESULTS_SUGGESTION


def _log_top_similarities(source: str, query_text: str, threshold: float, scored: List[tuple]) -> None:
    """Top 5 previo al umbral, para calibrar DEFAULT_SIMILARITY_THRESHOLD con datos reales."""
    if not logger.isEnabledFor(logging.DEBUG):
        return
    top = sorted(scored, key=lambda entry: entry[0], reverse=True)[:5]
    logger.debug(
        "RAG %s query=%r threshold=%.2f candidatos=%d top5=%s",
        source,
        query_text,
        threshold,
        len(scored),
        [
            {"id": item.get("id"), "tipo": item.get("property_type"), "base": round(base, 4), "ajustada": round(adj, 4)}
            for adj, base, item in top
        ],
    )


def search_properties(
    query: str,
    commune: Optional[str] = None,
    max_price_uf: Optional[float] = None,
    property_type: Optional[str] = None,
    limit: int = 10,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD
) -> Dict[str, Any]:
    query_text = (query or "").strip()
    if not query_text:
        return {
            "query": query_text,
            "results": [],
            "total": 0,
            "disclaimer": RUTAHOGAR_REFERENTIAL_DISCLAIMER,
            "suggestion": "Por favor ingresa un término o descripción de búsqueda."
        }

    # EmbeddingError se propaga (503): sin modelo no hay búsqueda semántica posible.
    query_vec = generate_text_embedding(query_text)
    query_intent = _extract_query_intent(query_text)

    # Intentar consulta directa a Supabase RPC sobre public.proyectos_rag
    db_rows = _query_supabase_proyectos_rag(
        query_vec=query_vec,
        commune=commune,
        max_price_uf=max_price_uf,
        property_type=property_type,
        limit=limit,
    )

    if db_rows is not None and isinstance(db_rows, list):
        formatted_results = []
        scored_rows = []
        for row in db_rows:
            p_uf = float(row.get("valor_uf") or row.get("price_uf") or 0.0)
            p_com = row.get("comuna") or row.get("commune") or "Santiago"
            
            title_clean = html.unescape(row.get("nombre") or row.get("title") or "Proyecto Inmobiliario")
            desc_clean = html.unescape(row.get("descripcion") or row.get("description") or "")
            
            raw_item = {
                "id": row.get("id"),
                "title": title_clean,
                "nombre": title_clean,
                "description": desc_clean,
                "descripcion": desc_clean,
                "price_uf": p_uf,
                "valor_uf": p_uf,
                "price_clp": float(row.get("precio_clp") or row.get("price_clp") or 0.0),
                "precio_clp": float(row.get("precio_clp") or row.get("price_clp") or 0.0),
                "commune": p_com,
                "comuna": p_com,
                "address": html.unescape(row.get("direccion") or row.get("address") or p_com),
                "property_type": row.get("tipo_vivienda") or row.get("property_type") or "departamento",
                "tipo_vivienda": row.get("tipo_vivienda") or row.get("property_type") or "departamento",
                "bedrooms": int(row.get("dormitorios") or row.get("bedrooms") or 1),
                "bathrooms": int(row.get("banos") or row.get("bathrooms") or 1),
                "surface_m2": float(row.get("superficie_m2") or row.get("surface_m2") or 0.0),
                "url": row.get("url") or "https://www.portalinmobiliario.com",
                "image_url": row.get("imagen_url") or row.get("image_url") or "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2",
                "source": row.get("fuente") or row.get("source") or "Portal Inmobiliario (Apify)",
                "cta_text": _cta_text(row.get("tipo_vivienda") or row.get("property_type")),
                "cta_url": f"/evaluacion?property_uf={p_uf}&commune={p_com}"
            }
            
            # Sin similitud calculada (fila sin embedding) no hay evidencia de relevancia.
            base_sim = float(row.get("similarity") or 0.0)
            adj_sim = _adjust_similarity_score(raw_item, base_sim, query_intent, query_text)
            raw_item["similarity"] = round(adj_sim, 4)
            scored_rows.append((adj_sim, base_sim, raw_item))

            if adj_sim >= similarity_threshold:
                formatted_results.append(raw_item)

        _log_top_similarities("supabase", query_text, similarity_threshold, scored_rows)

        # Reordenar por similitud ajustada descendente
        formatted_results.sort(key=lambda x: x["similarity"], reverse=True)
        total_count = len(formatted_results)
        sliced_results = formatted_results[:max(1, limit)]

        response_payload = {
            "query": query_text,
            "results": sliced_results,
            "total": total_count,
            "disclaimer": RUTAHOGAR_REFERENTIAL_DISCLAIMER
        }
        if total_count == 0:
            response_payload["suggestion"] = _empty_results_suggestion(query_intent)
        return response_payload

    # Fallback local determinístico cuando no hay conexión a Supabase
    scored_items = []
    scored_local = []
    catalog_vectors = _local_catalog_embeddings()

    for item, item_vec in zip(SAMPLE_PROPERTIES_CATALOG, catalog_vectors):
        norm_item = {
            "id": item.get("id"),
            "title": html.unescape(item.get("title") or item.get("nombre") or ""),
            "nombre": html.unescape(item.get("nombre") or item.get("title") or ""),
            "description": html.unescape(item.get("description") or item.get("descripcion") or ""),
            "price_uf": float(item.get("price_uf") or item.get("valor_uf") or 0.0),
            "price_clp": float(item.get("price_clp") or item.get("precio_clp") or 0.0),
            "commune": item.get("commune") or item.get("comuna"),
            "address": html.unescape(item.get("address") or item.get("direccion") or ""),
            "property_type": item.get("property_type") or item.get("tipo_vivienda"),
            "bedrooms": int(item.get("bedrooms") or item.get("dormitorios") or 1),
            "bathrooms": int(item.get("bathrooms") or item.get("banos") or 1),
            "surface_m2": float(item.get("surface_m2") or item.get("superficie_m2") or 45.0),
            "url": item.get("url"),
            "image_url": item.get("image_url") or item.get("imagen_url"),
            "source": item.get("source") or item.get("fuente") or "Portal Inmobiliario (Apify)"
        }
        
        # Aplicar filtros estrictos de atributos si vienen especificados
        if commune:
            if norm_item["commune"].lower() != commune.strip().lower():
                continue
        
        if max_price_uf is not None and max_price_uf > 0:
            if norm_item["price_uf"] > max_price_uf:
                continue

        if property_type:
            if norm_item["property_type"].lower() != property_type.strip().lower():
                continue

        # Calcular similitud coseno entre el embedding de la consulta y la propiedad
        base_sim = calculate_cosine_similarity(query_vec, item_vec)
        adj_sim = _adjust_similarity_score(norm_item, base_sim, query_intent, query_text)
        scored_local.append((adj_sim, base_sim, norm_item))

        if adj_sim >= similarity_threshold:
            property_copy = dict(norm_item)
            property_copy["similarity"] = round(adj_sim, 4)
            property_copy["cta_text"] = _cta_text(norm_item["property_type"])
            property_copy["cta_url"] = f"/evaluacion?property_uf={norm_item['price_uf']}&commune={norm_item['commune']}"
            scored_items.append(property_copy)

    _log_top_similarities("local", query_text, similarity_threshold, scored_local)

    # Ordenar estrictamente por relevancia/similitud semántica descendente (Criterio E1)
    scored_items.sort(key=lambda x: x["similarity"], reverse=True)
    
    total_count = len(scored_items)
    results = scored_items[:max(1, limit)]

    response_payload = {
        "query": query_text,
        "results": results,
        "total": total_count,
        "disclaimer": RUTAHOGAR_REFERENTIAL_DISCLAIMER
    }

    # Criterio E5: Manejo de resultados vacíos
    if total_count == 0:
        response_payload["suggestion"] = _empty_results_suggestion(query_intent)

    return response_payload

