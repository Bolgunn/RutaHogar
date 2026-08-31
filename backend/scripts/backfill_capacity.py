"""Backfill de la capacidad de compra (ALG-9) sobre evaluaciones ya guardadas.

Las filas escritas antes de HU 10 no tienen ninguna de las nueve claves de
capacidad. Este script las recalcula desde el input_snapshot guardado y las
escribe dentro de financial_data.result.financial_indicators. No hay cambio de
esquema: la capacidad viaja en la columna JSON que ya existe.

No se aplica solo ni lo corre CI. Quien haga merge del PR lo ejecuta contra el
Supabase hosteado y pega los conteos del dry-run en el hilo del PR.

    python backend/scripts/backfill_capacity.py             # dry-run (por defecto)
    python backend/scripts/backfill_capacity.py --apply     # escribe

Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno. Usa la API REST
por urllib para no sumar una dependencia al backend.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring_engine.indicators import calculate_financial_indicators
from app.scoring_engine.purchase_capacity import calculate_purchase_capacity

TABLA = "evaluations"
PAGINA = 200

CLAVES_CAPACIDAD = (
    "capacidad_compra_estimada_uf",
    "capacidad_compra_estimada_clp",
    "capacidad_por_renta_uf",
    "capacidad_por_pie_uf",
    "capacidad_asistida_uf",
    "restriccion_vinculante",
    "dividendo_maximo_sostenible_clp",
    "capacidad_status",
    "capacidad_supuestos",
)


class FilaIncomprensible(Exception):
    """La fila no tiene la forma que este script sabe leer. No se escribe nada."""


def _config():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.")
    return url, key


def _request(method: str, ruta: str, key: str, body=None, extra_headers=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    headers.update(extra_headers or {})
    data = json.dumps(body).encode("utf-8") if body is not None else None
    peticion = urllib.request.Request(ruta, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(peticion) as respuesta:
            cuerpo = respuesta.read().decode("utf-8")
            return json.loads(cuerpo) if cuerpo else None
    except urllib.error.HTTPError as error:
        sys.exit(f"{method} {ruta} devolvió {error.code}: {error.read().decode('utf-8')}")


def _leer_pagina(url: str, key: str, desde: int):
    query = urllib.parse.urlencode({"select": "id,financial_data", "order": "created_at.asc"})
    ruta = f"{url}/rest/v1/{TABLA}?{query}"
    return _request("GET", ruta, key, extra_headers={"Range": f"{desde}-{desde + PAGINA - 1}"}) or []


def _escribir(url: str, key: str, fila_id: str, financial_data: dict):
    query = urllib.parse.urlencode({"id": f"eq.{fila_id}"})
    ruta = f"{url}/rest/v1/{TABLA}?{query}"
    _request("PATCH", ruta, key, body={"financial_data": financial_data})


def _snapshot(financial_data: dict) -> dict:
    for clave in ("input_snapshot", "input"):
        valor = financial_data.get(clave)
        if isinstance(valor, dict) and valor:
            return valor
    raise FilaIncomprensible("sin input_snapshot ni input")


def _resultado(financial_data: dict) -> dict:
    for clave in ("result", "result_snapshot"):
        valor = financial_data.get(clave)
        if isinstance(valor, dict):
            return valor
    raise FilaIncomprensible("sin result ni result_snapshot")


def procesar_fila(financial_data: dict) -> tuple[str, dict | None]:
    resultado = _resultado(financial_data)
    indicadores = resultado.get("financial_indicators")
    if not isinstance(indicadores, dict):
        raise FilaIncomprensible("result.financial_indicators no es un objeto")

    if all(clave in indicadores for clave in CLAVES_CAPACIDAD):
        return "ya_presente", None

    entrada = _snapshot(financial_data)
    calculados = calculate_financial_indicators(entrada, indicadores.get("property_value_clp", 0))
    capacidad = calculate_purchase_capacity(entrada, calculados)

    nuevo = json.loads(json.dumps(financial_data))
    destino = nuevo.get("result") if isinstance(nuevo.get("result"), dict) else nuevo["result_snapshot"]
    destino["financial_indicators"] = {**indicadores, **capacidad}

    estado = "requires_info" if capacidad["capacidad_status"] == "requires_info" else "calculado"
    return estado, nuevo


def main():
    parser = argparse.ArgumentParser(description="Backfill de capacidad de compra (ALG-9).")
    parser.add_argument("--apply", action="store_true", help="Escribe. Sin este flag es dry-run.")
    args = parser.parse_args()

    url, key = _config()
    conteos = {"calculado": 0, "requires_info": 0, "ya_presente": 0}
    incomprensibles = []
    desde = 0

    while True:
        filas = _leer_pagina(url, key, desde)
        if not filas:
            break
        for fila in filas:
            financial_data = fila.get("financial_data")
            if not isinstance(financial_data, dict):
                incomprensibles.append((fila["id"], "financial_data vacío o no es un objeto"))
                continue
            try:
                estado, nuevo = procesar_fila(financial_data)
            except FilaIncomprensible as error:
                incomprensibles.append((fila["id"], str(error)))
                continue
            conteos[estado] += 1
            if nuevo is not None and args.apply:
                _escribir(url, key, fila["id"], nuevo)
        desde += PAGINA

    modo = "APLICADO" if args.apply else "DRY-RUN (nada escrito)"
    print(f"Backfill de capacidad — {modo}")
    print(f"  calculados      : {conteos['calculado']}")
    print(f"  requires_info   : {conteos['requires_info']}")
    print(f"  ya presentes    : {conteos['ya_presente']}")
    print(f"  incomprensibles : {len(incomprensibles)}")

    if incomprensibles:
        print("\nFilas que este script no entiende. No se les escribió nada:")
        for fila_id, motivo in incomprensibles:
            print(f"  {fila_id}: {motivo}")
        sys.exit(1)


if __name__ == "__main__":
    main()
