import os
import sys
from pathlib import Path

import pytest

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from backfill_capacity import CLAVES_CAPACIDAD, FilaIncomprensible, procesar_fila

ENTRADA = {
    "ingreso_mensual": 1500000,
    "deuda_mensual": 100000,
    "ahorro_disponible": 12000000,
    "edad": 32,
    "plazo_credito_hipotecario": 30,
    "uf_value_clp": 40695,
    "consentimiento": True,
}


def _fila(entrada=ENTRADA, indicadores=None):
    return {
        "input_snapshot": entrada,
        "result": {"financial_indicators": indicadores if indicadores is not None else {"ingreso_total": 0}},
    }


def test_calcula_una_fila_legada():
    estado, nuevo = procesar_fila(_fila())
    indicadores = nuevo["result"]["financial_indicators"]

    assert estado == "calculado"
    assert indicadores["capacidad_compra_estimada_uf"] == 1474.4
    assert all(clave in indicadores for clave in CLAVES_CAPACIDAD)


def test_no_pierde_las_claves_previas():
    _, nuevo = procesar_fila(_fila(indicadores={"ingreso_total": 0, "ratio_deuda_ingreso": 0.07}))
    assert nuevo["result"]["financial_indicators"]["ratio_deuda_ingreso"] == 0.07


def test_es_idempotente():
    _, nuevo = procesar_fila(_fila())
    estado, sin_cambios = procesar_fila(nuevo)
    assert estado == "ya_presente"
    assert sin_cambios is None


def test_una_fila_sin_ingreso_queda_requires_info_nunca_cero():
    estado, nuevo = procesar_fila(_fila(entrada={**ENTRADA, "ingreso_mensual": 0}))
    indicadores = nuevo["result"]["financial_indicators"]

    assert estado == "requires_info"
    assert indicadores["capacidad_status"] == "requires_info"
    assert indicadores["capacidad_compra_estimada_uf"] is None


def test_no_muta_la_fila_original():
    original = _fila()
    procesar_fila(original)
    assert original["result"]["financial_indicators"] == {"ingreso_total": 0}


@pytest.mark.parametrize(
    "fila",
    [
        {"result": {"financial_indicators": {}}},
        {"input_snapshot": ENTRADA},
        {"input_snapshot": ENTRADA, "result": {"financial_indicators": "nada"}},
    ],
)
def test_falla_fuerte_en_filas_que_no_entiende(fila):
    with pytest.raises(FilaIncomprensible):
        procesar_fila(fila)
