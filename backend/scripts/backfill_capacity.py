"""Backfill de la capacidad de compra (ALG-9) sobre evaluaciones ya guardadas.

Las filas escritas antes de HU 10 no tienen ninguna de las nueve claves de
capacidad. Este script las recalcula desde el input_snapshot guardado y las
escribe dentro de financial_data.result.financial_indicators. No hay cambio de
esquema: la capacidad viaja en la columna JSON que ya existe.

No se aplica solo ni lo corre CI. Quien haga merge del PR lo ejecuta contra el
Supabase hosteado y pega los conteos del dry-run en el hilo del PR.

    python backend/scripts/backfill_capacity.py             # dry-run (por defecto)
    python backend/scripts/backfill_capacity.py --apply     # escribe

Necesita SUPABASE_URL y una llave que salte RLS -- SUPABASE_SECRET_KEY (esquema
actual) o SUPABASE_SERVICE_ROLE_KEY (esquema legado) -- en el entorno o en
backend/.env (la misma convención que GROQ_API_KEY). Usa la API REST por urllib
para no sumar una dependencia al backend.
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
from app.scoring_engine.property_value import resolve_property_value_clp
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


CAMPOS_ENTRADA = ("ingreso_mensual", "deuda_mensual", "ahorro_disponible")


class FilaIncomprensible(Exception):
    """La fila no tiene la forma que este script sabe leer. No se escribe nada."""


class ErrorDeRed(Exception):
    """Supabase respondió con un error. Se corta, pero informando lo ya hecho."""


def _desde_env_file(nombre: str) -> str:
    archivo = Path(__file__).resolve().parents[1] / ".env"
    if not archivo.exists():
        return ""
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        clave, sep, valor = linea.partition("=")
        if sep and clave.strip() == nombre:
            return valor.strip().strip('"').strip("'")
    return ""


def _config():
    url = (os.environ.get("SUPABASE_URL") or _desde_env_file("SUPABASE_URL")).rstrip("/")
    # Supabase renombró sus llaves: sb_secret_* reemplaza al JWT service_role.
    key = ""
    for nombre in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        key = os.environ.get(nombre) or _desde_env_file(nombre)
        if key:
            break
    if not url or not key:
        sys.exit(
            "Faltan SUPABASE_URL y/o la llave secreta (SUPABASE_SECRET_KEY o "
            "SUPABASE_SERVICE_ROLE_KEY). Ponlas en el entorno o en backend/.env."
        )
    # La publishable respeta RLS: leería cero filas y el dry-run diría "nada que
    # hacer", que es peor que fallar.
    if key.startswith("sb_publishable_"):
        sys.exit("Esa es la llave publishable: respeta RLS y no vería ninguna evaluación.")
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
        raise ErrorDeRed(f"{method} {ruta} devolvió {error.code}: {error.read().decode('utf-8')}")


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
    # Forma legada: el input financiero guardado plano, sin result ni snapshots.
    # Es la mayoría de las filas históricas y ALG-9 R2 ya la contempla: sin edad
    # ni plazo declarados, el plazo cae al de referencia con age_term_verified
    # en false. Es la razón por la que ese branch existe.
    if any(campo in financial_data for campo in CAMPOS_ENTRADA):
        return financial_data
    raise FilaIncomprensible("sin input reconocible")


def _indicadores(financial_data: dict) -> dict:
    for clave in ("result", "result_snapshot"):
        resultado = financial_data.get(clave)
        if isinstance(resultado, dict):
            indicadores = resultado.get("financial_indicators", {})
            if not isinstance(indicadores, dict):
                raise FilaIncomprensible(f"{clave}.financial_indicators no es un objeto")
            return indicadores
    return {}


def _destino(nuevo: dict) -> dict:
    for clave in ("result", "result_snapshot"):
        if isinstance(nuevo.get(clave), dict):
            return nuevo[clave]
    # La fila legada no trae result. Se crea vacío: normalizeEvaluation ya
    # resuelve score y classification desde las columnas de la tabla, así que
    # esto no le quita nada — solo le da a la capacidad dónde vivir.
    nuevo["result"] = {}
    return nuevo["result"]


def procesar_fila(financial_data: dict) -> tuple[str, dict | None]:
    indicadores = _indicadores(financial_data)
    # Una corrida temprana escribió filas legadas con SOLO las nueve claves de
    # capacidad, sin los indicadores base. ALG-10 lee ingreso_total para la
    # brecha de renta, así que esas filas muestran evidencia equivocada. Se
    # consideran incompletas y se reparan; ingreso_total siempre existe en una
    # fila bien escrita, venga de indicators.py o reconstruida aquí.
    tiene_base = "ingreso_total" in indicadores
    if tiene_base and all(clave in indicadores for clave in CLAVES_CAPACIDAD):
        return "ya_presente", None

    entrada = _snapshot(financial_data)
    property_value_clp = (
        indicadores["property_value_clp"]
        if "property_value_clp" in indicadores
        else resolve_property_value_clp(entrada).get("property_value_clp", 0)
    )
    calculados = calculate_financial_indicators(entrada, property_value_clp)
    capacidad = calculate_purchase_capacity(entrada, calculados)

    # Sin indicadores base guardados se reconstruyen como los calcularía el
    # motor hoy; con ellos, mandan los guardados y solo se les suma la capacidad.
    base = indicadores if tiene_base else calculados

    nuevo = json.loads(json.dumps(financial_data))
    _destino(nuevo)["financial_indicators"] = {**base, **capacidad}

    if capacidad["capacidad_status"] == "requires_info":
        estado = "requires_info"
    elif indicadores and not tiene_base:
        estado = "reparado"
    else:
        estado = "calculado"
    return estado, nuevo


def _informe(conteos: dict, incomprensibles: list, aplicado: bool, escritas: int) -> None:
    modo = "APLICADO" if aplicado else "DRY-RUN (nada escrito)"
    print(f"Backfill de capacidad — {modo}")
    print(f"  calculados      : {conteos['calculado']}")
    print(f"  reparados       : {conteos['reparado']}")
    print(f"  requires_info   : {conteos['requires_info']}")
    print(f"  ya presentes    : {conteos['ya_presente']}")
    print(f"  incomprensibles : {len(incomprensibles)}")
    if aplicado:
        print(f"  filas escritas  : {escritas}")

    if incomprensibles:
        print("\nFilas que este script no entiende. No se les escribió nada:")
        for fila_id, motivo in incomprensibles:
            print(f"  {fila_id}: {motivo}")


def main():
    parser = argparse.ArgumentParser(description="Backfill de capacidad de compra (ALG-9).")
    parser.add_argument("--apply", action="store_true", help="Escribe. Sin este flag es dry-run.")
    args = parser.parse_args()

    url, key = _config()
    conteos = {"calculado": 0, "reparado": 0, "requires_info": 0, "ya_presente": 0}
    incomprensibles = []
    escritas = 0
    desde = 0

    try:
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
                    escritas += 1
            # Avanza por lo efectivamente leído, no por el tamaño pedido: si
            # PostgREST recorta la página (db-max-rows), sumar PAGINA se saltaría
            # filas en silencio y el dry-run informaría un total falso.
            desde += len(filas)
    except ErrorDeRed as error:
        # Es idempotente, así que se puede repetir — pero el operador tiene que
        # ver dónde quedó antes de repetirlo.
        _informe(conteos, incomprensibles, args.apply, escritas)
        sys.exit(f"\nInterrumpido: {error}")

    _informe(conteos, incomprensibles, args.apply, escritas)
    if incomprensibles:
        sys.exit(1)


if __name__ == "__main__":
    main()
