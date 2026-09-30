#!/usr/bin/env python3
"""
Script de extracción pura de datos crudos desde Apify.
Desacoplado de la etapa de transformación e ingesta para optimizar cuota de red.

Soporta parámetros CLI:
- --out=raw_apify_dump_casas.json : Define el archivo de salida
- --type=casa | --type=departamento : Define el tipo de propiedad a buscar
- --pages=4 : Define la cantidad de páginas (maxPages)
"""

import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

# Añadir el directorio raíz del backend al path para importar módulos de app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import (
    get_apify_api_key,
    get_apify_actor_id,
)

DEFAULT_DUMP_FILE = Path(__file__).resolve().parent.parent / "raw_apify_dump.json"


def fetch_apify_dataset_items(dataset_id: str) -> list:
    """Obtiene los elementos crudos de un dataset de Apify sin transformación."""
    api_key = get_apify_api_key()
    if not api_key:
        print("⚠️ APIFY_API_KEY no configurada en app.config. Imposible descargar de Apify.")
        return []

    url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": "RutaHogar-Dump/1.0"})

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ Se obtuvieron {len(data)} elementos crudos desde Apify Dataset ID: {dataset_id}")
            return data
    except Exception as e:
        print(f"❌ Error al consultar Apify API Dataset: {e}")
        return []


def run_apify_dump(property_type: str = "departamento", max_pages: int = 4) -> list:
    """Ejecuta el actor de Apify y captura la respuesta completa."""
    api_key = get_apify_api_key()
    actor_id = get_apify_actor_id()

    if not api_key:
        print("❌ APIFY_API_KEY no configurada. Configure la variable de entorno antes de ejecutar el dump.")
        sys.exit(1)

    actor_path = actor_id.replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_path}/runs?token={api_key}&waitForFinish=180"

    run_input = {
        "location": "Santiago",
        "propertyType": property_type,
        "operation": "comprar",
        "maxPages": max_pages
    }

    payload = json.dumps(run_input).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "RutaHogar-Dump/1.0"},
        method="POST"
    )

    try:
        print("==========================================================")
        print("  RutaHogar - Dump de Portal Inmobiliario desde Apify")
        print(f"  Actor: {actor_id}")
        print("==========================================================")
        print(f"🚀 Ejecutando extracción en Apify (propertyType='{property_type}', maxPages={max_pages})...")
        print(f"📥 Parámetros enviados: {json.dumps(run_input, ensure_ascii=False)}")

        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            dataset_id = res_data.get("data", {}).get("defaultDatasetId")
            if dataset_id:
                items = fetch_apify_dataset_items(dataset_id)
                return items
            print("⚠️ No se obtuvo defaultDatasetId de la ejecución del actor.")
            return []
    except Exception as e:
        print(f"❌ Error al ejecutar el actor de Apify: {e}")
        return []


def main():
    # Parámetros CLI
    out_arg = next((arg.split("=")[1] for arg in sys.argv if arg.startswith("--out=")), None)
    if not out_arg:
        out_arg = next((arg for arg in sys.argv[1:] if arg.endswith(".json") and not arg.startswith("--")), None)

    prop_type = next((arg.split("=")[1] for arg in sys.argv if arg.startswith("--type=")), "departamento")
    pages_arg = next((int(arg.split("=")[1]) for arg in sys.argv if arg.startswith("--pages=")), 4)

    if out_arg:
        out_file = Path(out_arg)
        if not out_file.is_absolute():
            out_file = Path(__file__).resolve().parent.parent / out_arg
    else:
        out_file = DEFAULT_DUMP_FILE

    items = run_apify_dump(property_type=prop_type, max_pages=pages_arg)
    if not items:
        print("⚠️ No se obtuvieron elementos de Apify. No se actualizará el archivo de salida.")
        sys.exit(1)

    print(f"💾 Guardando {len(items)} registros crudos en {out_file}...")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)

    print(f"✅ Dump completado exitosamente: {out_file}")


if __name__ == "__main__":
    main()
