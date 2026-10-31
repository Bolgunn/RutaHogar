"""In-process RAG-lite retrieval engine for RutaHogar Virtual Assistant.

Implements fast BM25 / token scoring over the pre-built JSON knowledge base
with accent normalization, Spanish stopwords removal, audience filtering, and context boosting.
No external vector databases or heavyweight machine learning libraries required.
"""

import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .constants import (
    CONTENT_WEIGHT,
    FIELD_MATCH_BOOST,
    KB_PATH,
    MIN_RETRIEVAL_SCORE,
    SCREEN_MATCH_BOOST,
    SYNONYMS_WEIGHT,
    TITLE_WEIGHT,
    TOP_K_CHUNKS,
)

# Spanish stopwords that add little semantic discrimination
SPANISH_STOPWORDS: Set[str] = {
    "a", "al", "algo", "algunas", "algunos", "ante", "antes", "como", "con", "contra",
    "cual", "cuando", "de", "del", "desde", "donde", "durante", "e", "el", "ella",
    "ellas", "ello", "ellos", "en", "entre", "era", "erais", "eran", "eras", "eres",
    "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estado", "estais",
    "estamos", "estan", "estar", "estas", "este", "estos", "estoy", "fue", "fueron",
    "fui", "fuimos", "ha", "habeis", "habia", "habian", "habida", "habidas", "habido",
    "habidos", "hacia", "han", "has", "hasta", "la", "las", "le", "les", "lo", "los",
    "me", "mi", "mis", "mucho", "muchos", "muy", "mas", "nos", "nosotras", "nosotros",
    "o", "os", "otra", "otras", "otro", "otros", "para", "pero", "poco", "por", "porque",
    "que", "quien", "quienes", "se", "sea", "seais", "sean", "seas", "ser", "sera",
    "seran", "seras", "sere", "seria", "si", "sido", "siendo", "sin", "sobre", "sois",
    "somos", "son", "soy", "su", "sus", "suya", "suyas", "suyo", "suyos", "tambien",
    "tanto", "te", "tened", "teneis", "tenemos", "tener", "tenga", "tengais", "tengan",
    "tengas", "tengo", "tenia", "tenian", "ti", "tiene", "tienen", "tienes", "todo",
    "todos", "tu", "tus", "tuve", "tuviera", "tuvieron", "tuvo", "un", "una", "unas",
    "uno", "unos", "vosotras", "vosotros", "vuestra", "vuestras", "vuestro", "vuestros",
    "y", "ya", "yo",
}

_CACHED_KB: Optional[List[Dict[str, Any]]] = None
_CACHED_MTIME: float = 0.0

ADMIN_SCREENS = {"admin", "admin-projects", "admin-profile", "admin-reports"}
EJECUTIVO_SCREENS = {"leads", "metricas", "sales-profile"}


def get_allowed_audiences(
    is_authenticated: bool = False,
    user_role: Optional[str] = None,
    screen_id: Optional[str] = None,
) -> Set[str]:
    """Determines which KB chunk audiences the caller is authorized to retrieve."""
    if not is_authenticated:
        return {"all", "lead"}

    role = (user_role or "").strip().lower()
    if not role:
        if screen_id in ADMIN_SCREENS:
            role = "admin"
        elif screen_id in EJECUTIVO_SCREENS:
            role = "ejecutivo"
        else:
            role = "usuario"

    if role in {"admin", "admin_inmobiliario"}:
        return {"all", "lead", "ejecutivo", "admin"}
    if role == "ejecutivo":
        return {"all", "lead", "ejecutivo"}
    return {"all", "lead"}


def normalize_text(text: str) -> str:
    """Lowercases, removes diacritics (accents), and replaces non-alphanumeric chars with spaces."""
    if not text:
        return ""
    text = text.lower()
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    cleaned = re.sub(r"[^a-z0-9\s]", " ", stripped)
    return " ".join(cleaned.split())


def tokenize(text: str, remove_stopwords: bool = True) -> List[str]:
    """Tokenizes normalized text into word terms."""
    normalized = normalize_text(text)
    tokens = normalized.split()
    if remove_stopwords:
        tokens = [t for t in tokens if t not in SPANISH_STOPWORDS and len(t) > 1]
    return tokens


def load_kb(force_reload: bool = False) -> List[Dict[str, Any]]:
    """Loads knowledge base from json with modification timestamp caching."""
    global _CACHED_KB, _CACHED_MTIME

    kb_file = Path(KB_PATH)
    if not kb_file.exists():
        return []

    mtime = kb_file.stat().st_mtime
    if not force_reload and _CACHED_KB is not None and mtime == _CACHED_MTIME:
        return _CACHED_KB

    with open(kb_file, "r", encoding="utf-8") as f:
        _CACHED_KB = json.load(f)
    _CACHED_MTIME = mtime
    return _CACHED_KB


def score_chunk(
    chunk: Dict[str, Any],
    query_tokens: List[str],
    raw_query_norm: str,
    screen_id: Optional[str] = None,
    field_id: Optional[str] = None,
) -> float:
    """Calculates relevance score of a chunk against the query tokens and context."""
    if not query_tokens:
        return 0.0

    score = 0.0

    # Tokenize chunk components
    title_norm = normalize_text(chunk.get("title", ""))
    title_tokens = set(tokenize(title_norm, remove_stopwords=False))

    synonyms = chunk.get("synonyms") or []
    synonyms_norms = [normalize_text(s) for s in synonyms]
    synonyms_tokens: Set[str] = set()
    for s_norm in synonyms_norms:
        synonyms_tokens.update(tokenize(s_norm, remove_stopwords=False))

    chunk_field = chunk.get("field_id")
    if chunk_field:
        synonyms_tokens.update(tokenize(chunk_field.replace("_", " "), remove_stopwords=False))

    content_norm = normalize_text(chunk.get("content", ""))
    content_tokens = set(tokenize(content_norm, remove_stopwords=True))

    # 1. Exact phrase matches (High precision)
    if raw_query_norm and len(raw_query_norm) > 4:
        if raw_query_norm in title_norm:
            score += 5.0
        for s_norm in synonyms_norms:
            if raw_query_norm in s_norm or s_norm in raw_query_norm:
                score += 4.5
                break

    # 2. Token overlap matches
    matched_query_tokens = 0
    for qt in query_tokens:
        token_matched = False
        if qt in title_tokens:
            score += TITLE_WEIGHT
            token_matched = True
        if qt in synonyms_tokens:
            score += SYNONYMS_WEIGHT
            token_matched = True
        if qt in content_tokens:
            score += CONTENT_WEIGHT
            token_matched = True
        if token_matched:
            matched_query_tokens += 1

    # Overlap coverage bonus
    coverage_ratio = matched_query_tokens / len(query_tokens)
    score *= (0.5 + 0.5 * coverage_ratio)

    # 3. Contextual boost
    chunk_screen = chunk.get("screen_id")
    if screen_id and chunk_screen:
        # Match "evaluate" with "anon-evaluate"
        if screen_id == chunk_screen or (
            chunk_screen == "evaluate" and screen_id in {"evaluate", "anon-evaluate"}
        ):
            score += SCREEN_MATCH_BOOST

    chunk_field = chunk.get("field_id")
    if field_id and chunk_field and field_id == chunk_field:
        score += FIELD_MATCH_BOOST

    return score


def retrieve_relevant_chunks(
    query: str,
    screen_id: Optional[str] = None,
    field_id: Optional[str] = None,
    top_k: int = TOP_K_CHUNKS,
    min_score: float = MIN_RETRIEVAL_SCORE,
    allowed_audiences: Optional[Set[str]] = None,
) -> List[Tuple[float, Dict[str, Any]]]:
    """Retrieves top-k relevant knowledge base chunks for the given query."""
    kb = load_kb()
    if not kb:
        return []

    raw_query_norm = normalize_text(query)
    query_tokens = tokenize(raw_query_norm, remove_stopwords=True)

    # Fallback to keep stopwords if all tokens were stopwords (e.g. "que es")
    if not query_tokens:
        query_tokens = tokenize(raw_query_norm, remove_stopwords=False)

    if not query_tokens:
        return []

    scored_chunks: List[Tuple[float, Dict[str, Any]]] = []
    for chunk in kb:
        if allowed_audiences is not None:
            chunk_audience = chunk.get("audience") or "all"
            if chunk_audience not in allowed_audiences:
                continue

        score = score_chunk(chunk, query_tokens, raw_query_norm, screen_id, field_id)
        if score >= min_score:
            scored_chunks.append((score, chunk))

    # Sort descending by score
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return scored_chunks[:top_k]
