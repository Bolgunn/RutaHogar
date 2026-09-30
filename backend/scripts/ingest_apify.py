#!/usr/bin/env python3
"""
Script de transformación e ingesta de propiedades hacia Supabase con pgvector.
Desacoplado de la extracción de red de Apify.

Soporta parámetros CLI:
- raw_apify_dump_casas.json o --file=raw_apify_dump_casas.json : Especifica el archivo estático a ingestar
- --no-truncate o --append : Conserva las propiedades existentes en Supabase (evita el TRUNCATE)
- --dry-run : Muestra la normalización del primer elemento sin insertar en Supabase
"""

import os
import sys
import json
import re
import html
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Tuple, List, Dict

# Añadir el directorio raíz del backend al path para importar módulos de app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import (
    get_supabase_url,
    get_supabase_key,
)
from app.properties_search import generate_text_embedding

DEFAULT_DUMP_FILE = Path(__file__).resolve().parent.parent / "raw_apify_dump.json"

KNOWN_RM_COMMUNES: Dict[str, str] = {
    "santiago": "Santiago",
    "santiago centro": "Santiago",
    "providencia": "Providencia",
    "ñuñoa": "Ñuñoa",
    "nunoa": "Ñuñoa",
    "las condes": "Las Condes",
    "vitacura": "Vitacura",
    "lo barnechea": "Lo Barnechea",
    "la florida": "La Florida",
    "peñalolén": "Peñalolén",
    "penalolen": "Peñalolén",
    "macul": "Macul",
    "san miguel": "San Miguel",
    "estación central": "Estación Central",
    "estacion central": "Estación Central",
    "recoleta": "Recoleta",
    "independencia": "Independencia",
    "quilicura": "Quilicura",
    "maipú": "Maipú",
    "maipu": "Maipú",
    "pudahuel": "Pudahuel",
    "cerrillos": "Cerrillos",
    "quinta normal": "Quinta Normal",
    "conchalí": "Conchalí",
    "conchali": "Conchalí",
    "renca": "Renca",
    "la cisterna": "La Cisterna",
    "la granja": "La Granja",
    "el bosque": "El Bosque",
    "san ramón": "San Ramón",
    "san ramon": "San Ramón",
    "la pintana": "La Pintana",
    "san bernardo": "San Bernardo",
    "puente alto": "Puente Alto",
    "lampa": "Lampa",
    "colina": "Colina",
    "chicureo": "Colina",
    "buin": "Buin",
    "paine": "Paine",
    "talagante": "Talagante",
    "isla de maipo": "Isla de Maipo",
    "peñaflor": "Peñaflor",
    "penaflor": "Peñaflor",
    "padre hurtado": "Padre Hurtado",
    "melipilla": "Melipilla",
    "pirque": "Pirque",
    "calera de tango": "Calera de Tango",
    "tiltil": "Tiltil",
    "curacaví": "Curacaví",
    "curacavi": "Curacaví",
}


def _parse_attributes(attributes: list) -> Tuple[int, int, float]:
    """Extrae dormitorios, baños y superficie m² desde el array de atributos del actor."""
    dormitorios = 1
    banos = 1
    superficie_m2 = 45.0

    if not isinstance(attributes, list):
        return dormitorios, banos, superficie_m2

    for attr in attributes:
        if not isinstance(attr, str):
            continue
        attr_lower = attr.lower()

        # Extraer dormitorios ("2 dormitorios", "1 dorm", "3 hab")
        m_bed = re.search(r"(\d+)\s*(?:dormitorio|dorm|habitaci|hab)", attr_lower)
        if m_bed:
            dormitorios = int(m_bed.group(1))

        # Extraer baños ("2 baños", "1 baño", "2 ba")
        m_bath = re.search(r"(\d+)\s*(?:baño|bano|ba)", attr_lower)
        if m_bath:
            banos = int(m_bath.group(1))

        # Extraer m² ("45 m²", "85 m2", "120 m² útiles")
        m_surf = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metro)", attr_lower)
        if m_surf:
            val = m_surf.group(1).replace(",", ".")
            try:
                superficie_m2 = float(val)
            except ValueError:
                pass

    return dormitorios, banos, superficie_m2


def _clean_chilean_number(val: Any) -> float:
    """Parsea números en formato chileno respetando miles (.) y decimales (,)."""
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s:
        return 0.0

    # Extraer dígitos, puntos y comas
    s = re.sub(r"[^\d\.\,]", "", s)
    if not s:
        return 0.0

    if "." in s and "," in s:
        # Ej: "22.368,42" -> "22368.42"
        s = s.replace(".", "").replace(",", ".")
    elif "." in s and "," not in s:
        # Si tiene múltiples puntos (ej: "182.400.000") o punto único con 3 dígitos al final (ej: "4.800")
        if s.count(".") > 1 or re.search(r"^\d+\.\d{3}$", s):
            s = s.replace(".", "")
    elif "," in s and "." not in s:
        # Coma decimal
        s = s.replace(",", ".")

    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_price(item: dict) -> Tuple[float, float]:
    """Extrae valor_uf y precio_clp corrigiendo el formato numérico chileno."""
    valor_uf = 0.0
    precio_clp = 0.0

    # 1. Si existe price_aria_label, ej: "4159 unidades de fomento"
    aria_label = str(item.get("price_aria_label") or "")
    if aria_label:
        m_aria = re.search(r"(\d+)\s*unidades de fomento", aria_label, re.IGNORECASE)
        if m_aria:
            valor_uf = float(m_aria.group(1))

    price_text = str(item.get("price_text") or item.get("precio_texto") or "")
    currency = str(item.get("currency") or item.get("moneda") or "").upper()
    amount = item.get("amount") or item.get("precio") or item.get("price")

    # 2. Intentar parsear a partir de price_text si valor_uf no fue obtenido por aria_label
    if valor_uf == 0 and price_text:
        uf_match = re.search(r"UF\s*([\d\.\,]+)|([\d\.\,]+)\s*UF", price_text, re.IGNORECASE)
        if uf_match:
            num_str = uf_match.group(1) or uf_match.group(2)
            valor_uf = _clean_chilean_number(num_str)

        clp_match = re.search(r"\$\s*([\d\.\,]+)|([\d\.\,]+)\s*CLP", price_text, re.IGNORECASE)
        if clp_match and valor_uf == 0:
            num_str = clp_match.group(1) or clp_match.group(2)
            precio_clp = _clean_chilean_number(num_str)

    # 3. Si valor_uf y precio_clp siguen en 0, usar el campo amount
    if valor_uf == 0 and precio_clp == 0 and amount is not None:
        amt = _clean_chilean_number(amount)
        if "UF" in currency or "UF" in price_text or amt < 50000:
            valor_uf = amt
        else:
            precio_clp = amt

    # 4. Corregir truncamiento de flotantes de UF expresados en miles de UF (ej: 2.89 -> 2890.0, 3.18 -> 3180.0, 14.2 -> 14200.0)
    if 0.1 < valor_uf < 100.0:
        valor_uf = round(valor_uf * 1000.0, 2)

    # 5. Calcular precio recíproco si uno de los dos es 0 (UF referencial ~38.000 CLP)
    if valor_uf > 0 and precio_clp == 0:
        precio_clp = round(valor_uf * 38000.0, 2)
    elif precio_clp > 0 and valor_uf == 0:
        valor_uf = round(precio_clp / 38000.0, 2)

    return valor_uf, precio_clp


def _parse_location(item: dict) -> Tuple[str, str]:
    """Extrae la comuna y dirección completa respetando las reglas de no usar la 1ra sección y validar comunas RM."""
    raw_loc = item.get("location") or item.get("comuna") or item.get("direccion") or "Santiago"
    
    loc_str = ""
    if isinstance(raw_loc, dict):
        for key in ["neighborhood", "commune", "city", "zone"]:
            val = raw_loc.get(key)
            if val and str(val).lower() in KNOWN_RM_COMMUNES:
                c_std = KNOWN_RM_COMMUNES[str(val).lower()]
                full_addr = raw_loc.get("address") or raw_loc.get("full_address") or loc_str
                return c_std, html.unescape(str(full_addr))
        loc_str = str(raw_loc.get("address") or raw_loc.get("full_address") or raw_loc.get("location") or "Santiago")
    else:
        loc_str = str(raw_loc)

    loc_str = html.unescape(loc_str).strip()
    parts = [p.strip() for p in loc_str.split(",") if p.strip()]

    # Regla: No utilizar la primera sección del string de dirección (es la calle/número)
    candidate_parts = parts[1:] if len(parts) > 1 else parts

    matched_commune = None

    # 1. Búsqueda de comuna conocida en segmentos de la dirección (excluyendo parts[0])
    for p in candidate_parts:
        p_clean = p.lower()
        if p_clean in ("rm (metropolitana)", "metropolitana", "región metropolitana", "chile", "santiago de chile"):
            continue
        for known_key, canonical_name in KNOWN_RM_COMMUNES.items():
            if known_key == p_clean or f" {known_key}" in f" {p_clean} ":
                # Preferir comunas específicas (ej: Ñuñoa, Providencia, La Florida) sobre "Santiago" genérico si ambas existen
                if matched_commune is None or matched_commune == "Santiago":
                    matched_commune = canonical_name

    # 2. Si no hubo coincidencia conocida, capturar el penúltimo o último segmento candidato
    if not matched_commune and candidate_parts:
        filtered_candidates = [
            c for c in candidate_parts
            if c.lower() not in ("rm (metropolitana)", "metropolitana", "región metropolitana", "chile")
        ]
        if filtered_candidates:
            matched_commune = filtered_candidates[-1]

    comuna = matched_commune if matched_commune else "Santiago"
    direccion = loc_str if loc_str else comuna

    return comuna, direccion


def normalize_property_item(raw_item: dict) -> dict:
    """Normaliza un elemento crudo del actor e ingesta hacia la tabla public.proyectos_rag."""
    raw_nombre = raw_item.get("title") or raw_item.get("title_text") or raw_item.get("nombre") or "Proyecto Portal Inmobiliario"
    raw_desc = raw_item.get("description") or raw_item.get("description_text") or raw_item.get("descripcion") or raw_nombre
    
    nombre = html.unescape(str(raw_nombre))
    descripcion = html.unescape(str(raw_desc))
    
    valor_uf, precio_clp = _parse_price(raw_item)
    comuna, direccion = _parse_location(raw_item)

    attributes = raw_item.get("attributes") or raw_item.get("atributos") or []
    dormitorios, banos, superficie_m2 = _parse_attributes(attributes)

    tipo_vivienda = str(
        raw_item.get("propertyType")
        or raw_item.get("property_type")
        or raw_item.get("tipo")
        or "departamento"
    ).lower()

    url = raw_item.get("url") or raw_item.get("link") or "https://www.portalinmobiliario.com"
    
    raw_img = raw_item.get("image") or raw_item.get("image_url") or raw_item.get("photos")
    if isinstance(raw_img, list) and len(raw_img) > 0:
        imagen_url = str(raw_img[0])
    elif isinstance(raw_img, str) and raw_img:
        imagen_url = raw_img
    else:
        imagen_url = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"

    text_content = f"{nombre} {descripcion} {comuna} {tipo_vivienda} {dormitorios} dormitorios"
    embedding = generate_text_embedding(text_content)

    return {
        "nombre": nombre,
        "descripcion": descripcion,
        "valor_uf": valor_uf,
        "precio_clp": precio_clp,
        "comuna": comuna,
        "direccion": direccion,
        "tipo_vivienda": tipo_vivienda,
        "dormitorios": dormitorios,
        "banos": banos,
        "superficie_m2": superficie_m2,
        "url": url,
        "imagen_url": imagen_url,
        "fuente": "Portal Inmobiliario (Apify)",
        "estado": "disponible",
        "embedding": embedding,
    }


def truncate_proyectos_rag_table() -> bool:
    """Vacía todos los registros de la tabla public.proyectos_rag en Supabase."""
    supabase_url = get_supabase_url()
    supabase_key = get_supabase_key()

    if not supabase_url or not supabase_key:
        print("⚠️ SUPABASE_URL y/o SUPABASE_KEY no configurados en app.config. Imposible purgar tabla.")
        return False

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/proyectos_rag?id=not.is.null"

    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer": "return=minimal",
        },
        method="DELETE"
    )

    try:
        print("🧹 Purgando registros en public.proyectos_rag (TRUNCATE)...")
        with urllib.request.urlopen(req) as resp:
            status = resp.getcode()
            if status in (200, 204):
                print("✅ Tabla public.proyectos_rag purgada exitosamente.")
                return True
            else:
                print(f"⚠️ Respuesta al purgar tabla Supabase HTTP {status}")
                return False
    except Exception as e:
        print(f"❌ Error al purgar tabla public.proyectos_rag: {e}")
        return False


def upsert_proyectos_to_supabase(proyectos_list: list) -> int:
    """Envía la lista de proyectos a la tabla public.proyectos_rag en Supabase usando app.config."""
    supabase_url = get_supabase_url()
    supabase_key = get_supabase_key()

    if not supabase_url or not supabase_key:
        print("⚠️ SUPABASE_URL y/o SUPABASE_KEY no configurados en app.config. Mostrando vista previa sin insertar:")
        print(json.dumps(proyectos_list[:2], indent=2, ensure_ascii=False))
        return 0

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/proyectos_rag"
    payload = json.dumps(proyectos_list).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.getcode()
            if status in (200, 201, 204):
                print(f"✅ {len(proyectos_list)} proyectos insertados/actualizados exitosamente en Supabase (tabla public.proyectos_rag).")
                return len(proyectos_list)
            else:
                print(f"⚠️ Respuesta de Supabase HTTP {status}")
                return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"❌ Error HTTP Supabase ({e.code}): {body}")
        return 0
    except Exception as e:
        print(f"❌ Error al conectar con Supabase: {e}")
        return 0


def load_raw_apify_dump(target_file: Path) -> list:
    """Lee el archivo estático JSON especificado."""
    if target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    print(f"📄 Cargados {len(data)} elementos desde {target_file}")
                    return data
        except Exception as e:
            print(f"⚠️ Error al leer {target_file}: {e}")

    print(f"ℹ️ No se encontró {target_file} o está vacío.")
    return []


def main():
    print("==========================================================")
    print("  RutaHogar - Ingesta de Propiedades a public.proyectos_rag ")
    print("==========================================================")

    dry_run = "--dry-run" in sys.argv
    no_truncate = "--no-truncate" in sys.argv or "--append" in sys.argv

    # Detectar parámetro de archivo personalizado (ej: --file=raw_apify_dump_casas.json o raw_apify_dump_casas.json)
    custom_file_arg = next((arg.split("=")[1] for arg in sys.argv if arg.startswith("--file=")), None)
    if not custom_file_arg:
        custom_file_arg = next((arg for arg in sys.argv[1:] if arg.endswith(".json") and not arg.startswith("--")), None)

    if custom_file_arg:
        target_path = Path(custom_file_arg)
        if not target_path.is_absolute():
            target_path = Path(__file__).resolve().parent.parent / custom_file_arg
    else:
        target_path = DEFAULT_DUMP_FILE

    items = load_raw_apify_dump(target_path)
    if not items:
        print("⚠️ No se obtuvieron elementos para ingestar.")
        sys.exit(1)

    normalized_list = [normalize_property_item(it) for it in items]
    print(f"📦 Procesados {len(normalized_list)} proyectos desde '{target_path.name}' con embeddings de 384 dimensiones.")

    if dry_run:
        print("🔍 Modo --dry-run activado. No se insertaron datos en public.proyectos_rag.")
        print(json.dumps(normalized_list[0], indent=2, ensure_ascii=False))
    else:
        if not no_truncate:
            truncate_proyectos_rag_table()
        else:
            print("⏩ Modo --no-truncate / --append activado. Se conservan los registros existentes en Supabase.")

        upsert_proyectos_to_supabase(normalized_list)


if __name__ == "__main__":
    main()
