#!/usr/bin/env python3
"""
Script de extracción pura de datos crudos desde Apify.
Desacoplado de la etapa de transformación e ingesta para optimizar cuota de red.

Soporta parámetros CLI:
- --out=raw_apify_dump_casas.json : Define el archivo de salida
- --type=casa | --type=departamento : Define el tipo de propiedad a buscar
- --pages=4 : Define la cantidad de páginas (maxPages)
- --location=Ñuñoa : Comuna a buscar (por defecto Santiago). Sin --out, el archivo de salida
  es raw_apify_<tipo>_<comuna>.json, que ingest_apify.py lee junto a los demás volcados.

Presupuesto: el actor cobra por resultado (PAY_PER_EVENT, ~US$0,003 por aviso más proxy).
Cada corrida va con maxItems y maxTotalChargeUsd, y se aborta antes de lanzarla si el
crédito mensual gratuito quedaría con menos de MIN_MARGIN_USD.
"""

import sys
import json
import time
import unicodedata
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
APIFY_API = "https://api.apify.com/v2"
ITEMS_PER_PAGE = 48
# Precio medido en las corridas de septiembre: US$0,003 por aviso + ~US$0,0003 de proxy.
USD_PER_ITEM = 0.0035
MIN_MARGIN_USD = 0.50
TERMINAL_STATUSES = ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT")


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "RutaHogar-Dump/1.0"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def remaining_credit_usd(api_key: str) -> float:
    data = _get_json(f"{APIFY_API}/users/me/limits?token={api_key}")["data"]
    return data["limits"]["maxMonthlyUsageUsd"] - data["current"]["monthlyUsageUsd"]


def wait_for_run(api_key: str, run_id: str) -> dict:
    # La API corta waitForFinish a 60 s: se repite hasta que el run termine.
    while True:
        run = _get_json(f"{APIFY_API}/actor-runs/{run_id}?token={api_key}&waitForFinish=60")["data"]
        if run["status"] in TERMINAL_STATUSES:
            return run
        time.sleep(2)


def slugify(text: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return "_".join(plain.lower().split())


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


def run_apify_dump(property_type: str = "departamento", max_pages: int = 4, location: str = "Santiago") -> list:
    """Ejecuta el actor de Apify y captura la respuesta completa."""
    api_key = get_apify_api_key()
    actor_id = get_apify_actor_id()

    if not api_key:
        print("❌ APIFY_API_KEY no configurada. Configure la variable de entorno antes de ejecutar el dump.")
        sys.exit(1)

    max_items = max_pages * ITEMS_PER_PAGE
    max_charge = round(max_items * USD_PER_ITEM, 4)
    remaining = remaining_credit_usd(api_key)
    print(f"💳 Crédito Apify disponible: US${remaining:.2f}; tope de esta corrida: US${max_charge:.2f}")
    if remaining - max_charge < MIN_MARGIN_USD:
        print(f"❌ La corrida dejaría menos de US${MIN_MARGIN_USD:.2f} de margen. No se ejecuta.")
        sys.exit(1)

    actor_path = actor_id.replace("/", "~")
    url = (
        f"{APIFY_API}/acts/{actor_path}/runs?token={api_key}"
        f"&maxItems={max_items}&maxTotalChargeUsd={max_charge}"
    )

    run_input = {
        "location": location,
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
        print(f"🚀 Ejecutando extracción en Apify (location='{location}', propertyType='{property_type}', maxPages={max_pages})...")
        print(f"📥 Parámetros enviados: {json.dumps(run_input, ensure_ascii=False)}")

        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
        run = wait_for_run(api_key, res_data["data"]["id"])
        print(f"🧾 Run {run['id']}: {run['status']}")
        dataset_id = run.get("defaultDatasetId")
        if dataset_id:
            items = fetch_apify_dataset_items(dataset_id)
            # Apify consolida el cobro minutos después; se estima por aviso.
            print(f"💵 Costo estimado: ~US${len(items) * USD_PER_ITEM:.2f}")
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
    location = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--location=")), "Santiago")

    if out_arg:
        out_file = Path(out_arg)
        if not out_file.is_absolute():
            out_file = Path(__file__).resolve().parent.parent / out_arg
    elif location != "Santiago":
        out_file = DEFAULT_DUMP_FILE.with_name(f"raw_apify_{prop_type}_{slugify(location)}.json")
    else:
        out_file = DEFAULT_DUMP_FILE

    items = run_apify_dump(property_type=prop_type, max_pages=pages_arg, location=location)
    if not items:
        print("⚠️ No se obtuvieron elementos de Apify. No se actualizará el archivo de salida.")
        sys.exit(1)

    print(f"💾 Guardando {len(items)} registros crudos en {out_file}...")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)

    print(f"✅ Dump completado exitosamente: {out_file}")


if __name__ == "__main__":
    main()
