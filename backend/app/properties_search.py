import os
import math
import hashlib
import re
import html
import json
import logging
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
DEFAULT_SIMILARITY_THRESHOLD = 0.5
SUPABASE_TIMEOUT_SECONDS = 5
EMBEDDING_TIMEOUT_SECONDS = 8

logger = logging.getLogger(__name__)

def _tokenize(text: str) -> List[str]:
    """Limpia y tokeniza un texto en palabras en minúsculas, preservando dígitos y decodificando HTML."""
    unescaped = html.unescape(text or "")
    cleaned = re.sub(r"[^\w\s]", " ", unescaped.lower())
    tokens = [t for t in cleaned.split() if len(t) > 1 or t.isdigit()]
    return tokens

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

    # 6. Comunas comunes
    comunas = ["santiago", "providencia", "ñuñoa", "las condes", "la florida", "san miguel", "vitacura", "macul", "peñalolén", "lo barnechea", "recoleta", "estación central"]
    for c in comunas:
        if c in q:
            intent["req_comuna"] = c
            break

    return intent

def _adjust_similarity_score(item: Dict[str, Any], base_sim: float, intent: Dict[str, Any], query_text: str) -> float:
    """Aplica impulsos y penalizaciones según atributos numéricos requeridos en la consulta."""
    sim = base_sim
    banos = int(item.get("banos") or item.get("bathrooms") or 1)
    dormitorios = int(item.get("dormitorios") or item.get("bedrooms") or 1)
    precio_uf = float(item.get("valor_uf") or item.get("price_uf") or 0.0)
    commune = str(item.get("comuna") or item.get("commune") or "").lower()

    # Requisito de Baños
    req_b = intent.get("req_banos")
    if req_b is not None:
        if banos == req_b:
            sim += 0.35
        elif banos > req_b:
            sim += 0.25
        else:
            sim -= 0.45

    # Requisito de Dormitorios
    req_d = intent.get("req_dormitorios")
    if req_d is not None:
        if dormitorios == req_d:
            sim += 0.35
        elif dormitorios > req_d:
            sim += 0.25
        else:
            sim -= 0.45

    # Requisito de UF
    req_uf = intent.get("req_max_uf")
    if req_uf is not None and req_uf > 0:
        if precio_uf <= req_uf:
            sim += 0.15
        else:
            sim -= 0.40

    # Pedir un tipo y recibir otro no es un resultado parcial: se descarta igual que la comuna.
    req_t = intent.get("req_tipo")
    if req_t:
        item_tipo = _normalize_property_type(item.get("tipo_vivienda") or item.get("property_type"))
        if item_tipo and item_tipo != req_t:
            sim -= 2.0

    req_c = intent.get("req_comuna")
    if req_c:
        if req_c in commune:
            sim += 0.25
        else:
            sim -= 2.0
    elif commune and commune in query_text.lower():
        sim += 0.15

    return max(0.0, min(0.99, float(sim)))


class EmbeddingError(RuntimeError):
    """El proveedor de embeddings configurado no pudo vectorizar el texto."""


# Abreviaturas que el usuario escribe y el catálogo no: sin esto "depto" no
# comparte ningún token con "departamento" en el modelo de hashing.
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


def generate_text_embedding(text: str) -> List[float]:
    """
    Vectoriza con el proveedor configurado (EMBEDDING_PROVIDER). La ingesta y la
    consulta llaman a esta misma función para que ambos vectores vivan en el mismo espacio.
    """
    from .config import get_embedding_provider

    normalized = _normalize_terms(text)
    if get_embedding_provider() == "openai":
        return _openai_embedding(normalized)
    return _hashing_embedding(normalized)


def _openai_embedding(text: str) -> List[float]:
    from .config import get_embedding_model, get_openai_api_key

    api_key = get_openai_api_key()
    if not api_key:
        raise EmbeddingError("EMBEDDING_PROVIDER=openai requiere OPENAI_API_KEY")

    payload = json.dumps({
        "model": get_embedding_model(),
        "input": text or " ",
        "dimensions": VECTOR_DIMENSION,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=EMBEDDING_TIMEOUT_SECONDS) as resp:
            vec = json.loads(resp.read().decode("utf-8"))["data"][0]["embedding"]
    except Exception as exc:
        raise EmbeddingError(f"OpenAI embeddings falló: {exc}") from exc

    if len(vec) != VECTOR_DIMENSION:
        raise EmbeddingError(f"Embedding de {len(vec)} dimensiones; se esperaban {VECTOR_DIMENSION}")
    return vec


def _hashing_embedding(text: str) -> List[float]:
    """
    Proyección léxica por hashing de unigramas y bigramas (384 dims, norma L2).
    No entiende sinónimos: solo sirve como modo local sin API externa.
    """
    vec = [0.0] * VECTOR_DIMENSION
    tokens = _tokenize(text)
    if not tokens:
        # Retorna vector unitario por defecto
        vec[0] = 1.0
        return vec

    # 1. Proyección de palabras unigramas y n-gramas
    for token in tokens:
        # Generar hash numérico positivo
        h = 0
        for char in token:
            h = (h * 31 + ord(char)) & 0xFFFFFFFF
        
        idx1 = h % VECTOR_DIMENSION
        idx2 = (h * 17 + 5) % VECTOR_DIMENSION
        weight = 1.0 + (len(token) * 0.1)
        
        vec[idx1] += weight
        vec[idx2] += (weight * 0.5)

    # 2. Proyección de bigramas para capturar contexto ("2 dormitorios", "las condes", etc.)
    for i in range(len(tokens) - 1):
        bigram = f"{tokens[i]}_{tokens[i+1]}"
        h = 0
        for char in bigram:
            h = (h * 37 + ord(char)) & 0xFFFFFFFF
        idx = h % VECTOR_DIMENSION
        vec[idx] += 2.0

    # 3. Normalizar vector a norma L2 (longitud unitaria)
    norm = math.sqrt(sum(val * val for val in vec))
    if norm > 0:
        vec = [val / norm for val in vec]
    else:
        vec[0] = 1.0

    return vec

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

# Precomputar embeddings para la lista en memoria
for prop in SAMPLE_PROPERTIES_CATALOG:
    text_content = f"{prop['title']} {prop['description']} {prop['commune']} {prop['property_type']} {prop['bedrooms']} dormitorios"
    prop["embedding"] = _hashing_embedding(_normalize_terms(text_content))


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

    # EmbeddingError se propaga: comparar con un vector de otro modelo daría resultados basura.
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
            response_payload["suggestion"] = EMPTY_RESULTS_SUGGESTION
        return response_payload

    # Fallback local determinístico cuando no hay conexión a Supabase
    scored_items = []
    scored_local = []
    # El catálogo local se vectorizó con hashing al importar; la consulta debe usar el mismo modelo.
    local_query_vec = _hashing_embedding(_normalize_terms(query_text))

    for item in SAMPLE_PROPERTIES_CATALOG:
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
        base_sim = calculate_cosine_similarity(local_query_vec, item["embedding"])
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
        response_payload["suggestion"] = EMPTY_RESULTS_SUGGESTION

    return response_payload

