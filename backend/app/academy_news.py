import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from hashlib import sha1
from html import unescape
from typing import Any

from fastapi import APIRouter


router = APIRouter(prefix="/academy", tags=["academy"])

DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60
DEFAULT_TIMEOUT_SECONDS = 4
MAX_ITEMS_PER_FEED = 5

CURATED_UPDATES = [
    {
        "id": "bcch-indicadores",
        "category": "Tasas e inflación",
        "title": "Revisa TPM, inflación y series de tasas en el Banco Central",
        "summary": "Indicadores oficiales ayudan a entender el contexto financiero, pero no determinan por sí solos la tasa que ofrecerá una institución.",
        "source": "Banco Central de Chile",
        "url": "https://www.bcentral.cl/",
        "published_at": None,
        "type": "curated",
    },
    {
        "id": "cmf-educa-creditos",
        "category": "Crédito hipotecario",
        "title": "Consulta educación financiera y derechos del consumidor financiero",
        "summary": "La CMF publica material educativo sobre créditos, endeudamiento, seguros y funcionamiento del mercado financiero.",
        "source": "CMF Educa",
        "url": "https://www.cmfchile.cl/educa/621/w3-channel.html",
        "published_at": None,
        "type": "curated",
    },
    {
        "id": "minvu-beneficios",
        "category": "Subsidios",
        "title": "Confirma requisitos y llamados habitacionales vigentes en MINVU",
        "summary": "Los requisitos, fechas y montos pueden cambiar por llamado; la fuente oficial debe ser MINVU o ChileAtiende.",
        "source": "MINVU",
        "url": "https://www.minvu.gob.cl/beneficio/vivienda/",
        "published_at": None,
        "type": "curated",
    },
]

_cache: dict[str, Any] = {"expires_at": 0, "payload": None}


def _cache_ttl() -> int:
    try:
        return max(60, int(os.environ.get("RUTAHOGAR_ACADEMY_NEWS_CACHE_SECONDS", DEFAULT_CACHE_TTL_SECONDS)))
    except ValueError:
        return DEFAULT_CACHE_TTL_SECONDS


def _configured_feeds() -> list[dict[str, str]]:
    configured = os.environ.get("RUTAHOGAR_ACADEMY_NEWS_FEEDS", None)
    if configured is None:
        configured = globals().get("RUTAHOGAR_ACADEMY_NEWS_FEEDS", "")

    if isinstance(configured, str):
        raw = configured.strip()
        if not raw:
            return []
        try:
            feeds = json.loads(raw)
        except json.JSONDecodeError:
            return []
    elif isinstance(configured, list):
        feeds = configured
    else:
        return []

    if not isinstance(feeds, list):
        return []
    normalized = []
    for item in feeds:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        normalized.append({
            "url": str(item["url"]),
            "source": str(item.get("source") or "Fuente externa"),
            "category": str(item.get("category") or "Actualidad"),
        })
    return normalized


def _text(node: ET.Element | None, default: str = "") -> str:
    return "".join(node.itertext()).strip() if node is not None else default


def _parse_date(value: str) -> str | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).isoformat()
    except (TypeError, ValueError, IndexError):
        return value


def _clean_summary(value: str, limit: int = 280) -> str:
    if not value:
        return ""
    text = unescape(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _stable_id(prefix: str, feed_url: str, item_url: str) -> str:
    digest = sha1(f"{feed_url}|{item_url}".encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _fetch_feed(feed: dict[str, str], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> list[dict[str, Any]]:
    request = urllib.request.Request(feed["url"], headers={"User-Agent": "RutaHogar Academy/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()

    root = ET.fromstring(body)
    channel_items = root.findall(".//item")
    if channel_items:
        rows = []
        for item in channel_items[:MAX_ITEMS_PER_FEED]:
            title = _text(item.find("title"))
            link = _text(item.find("link"))
            if not title or not link:
                continue
            rows.append({
                "id": _stable_id("rss", feed["url"], link),
                "category": feed["category"],
                "title": title,
                "summary": _clean_summary(_text(item.find("description"))),
                "source": feed["source"],
                "url": link,
                "published_at": _parse_date(_text(item.find("pubDate"))),
                "type": "rss",
            })
        return rows

    atom_items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    rows = []
    for item in atom_items[:MAX_ITEMS_PER_FEED]:
        title = _text(item.find("{http://www.w3.org/2005/Atom}title"))
        link_node = item.find("{http://www.w3.org/2005/Atom}link")
        link = link_node.attrib.get("href", "") if link_node is not None else ""
        if not title or not link:
            continue
        rows.append({
            "id": _stable_id("atom", feed["url"], link),
            "category": feed["category"],
            "title": title,
            "summary": _clean_summary(_text(item.find("{http://www.w3.org/2005/Atom}summary"))),
            "source": feed["source"],
            "url": link,
            "published_at": _text(item.find("{http://www.w3.org/2005/Atom}updated")) or None,
            "type": "rss",
        })
    return rows


def build_academy_news_payload(now: float | None = None) -> dict[str, Any]:
    current_time = now if now is not None else time.time()
    if _cache["payload"] is not None and current_time < _cache["expires_at"]:
        return _cache["payload"]

    feeds = _configured_feeds()
    fetched: list[dict[str, Any]] = []
    failed_sources: list[str] = []
    for feed in feeds:
        try:
            fetched.extend(_fetch_feed(feed))
        except Exception:
            failed_sources.append(feed["source"])

    payload = {
        "items": fetched + CURATED_UPDATES,
        "meta": {
            "dynamic_enabled": bool(feeds),
            "fetched_count": len(fetched),
            "curated_count": len(CURATED_UPDATES),
            "failed_sources": failed_sources,
            "cache_seconds": _cache_ttl(),
            "disclaimer": "Contenido informativo y referencial. Confirma condiciones vigentes en la fuente oficial.",
        },
    }
    _cache["payload"] = payload
    _cache["expires_at"] = current_time + _cache_ttl()
    return payload


@router.get("/news")
def get_academy_news():
    return build_academy_news_payload()
