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


# La mayoria de las filas historicas guardan el input plano, sin result ni
# snapshots, y sin edad ni plazo. ALG-9 R2 contempla justo ese caso.
FILA_LEGADA = {
    "ingreso_mensual": 1500000,
    "deuda_mensual": 100000,
    "ahorro_disponible": 12000000,
    "comuna_objetivo": "Macul",
    "dividendo_estimado": 600000,
    "tipo_contrato": "indefinido",
    "continuidad_laboral": "mas_3_anios",
    "morosidad_actual": "no",
    "complemento_renta": False,
}


def test_calcula_la_forma_legada_plana():
    estado, nuevo = procesar_fila(FILA_LEGADA)
    indicadores = nuevo["result"]["financial_indicators"]

    assert estado == "calculado"
    assert indicadores["capacidad_status"] == "ok"
    assert indicadores["capacidad_supuestos"]["plazo_origen"] == "default"
    assert indicadores["capacidad_supuestos"]["age_term_verified"] is False


def test_la_forma_legada_escribe_indicadores_completos():
    # ALG-10 lee ingreso_total para la brecha de renta. Escribir solo las nueve
    # claves de capacidad haria que la tarjeta pidiera el ingreso entero en vez
    # de lo que falta.
    _, nuevo = procesar_fila(FILA_LEGADA)
    indicadores = nuevo["result"]["financial_indicators"]

    assert indicadores["ingreso_total"] == 1500000
    assert indicadores["uf_value_clp"] > 0
    assert indicadores["property_value_clp"] > 0, "Macul resuelve precio referencial"
    assert indicadores["pie_ratio"] > 0


def test_una_fila_moderna_no_recalcula_sus_indicadores_guardados():
    guardados = {"ingreso_total": 999, "property_value_clp": 1, "algo_propio": "intacto"}
    _, nuevo = procesar_fila(_fila(indicadores=guardados))
    indicadores = nuevo["result"]["financial_indicators"]

    for clave, valor in guardados.items():
        assert indicadores[clave] == valor
    assert set(indicadores) == set(guardados) | set(CLAVES_CAPACIDAD)


def test_la_forma_legada_conserva_su_input_plano():
    _, nuevo = procesar_fila(FILA_LEGADA)
    for clave, valor in FILA_LEGADA.items():
        assert nuevo[clave] == valor


def test_repara_una_fila_escrita_con_solo_las_claves_de_capacidad():
    # Lo que dejo una corrida temprana del script: capacidad sin indicadores
    # base, asi que ALG-10 leia ingreso_total ausente y calculaba mal la brecha.
    _, incompleta = procesar_fila(FILA_LEGADA)
    solo_capacidad = incompleta["result"]["financial_indicators"]
    incompleta["result"]["financial_indicators"] = {
        clave: solo_capacidad[clave] for clave in CLAVES_CAPACIDAD
    }

    estado, reparada = procesar_fila(incompleta)
    indicadores = reparada["result"]["financial_indicators"]

    assert estado == "reparado"
    assert indicadores["ingreso_total"] == 1500000
    assert indicadores["capacidad_compra_estimada_uf"] == solo_capacidad["capacidad_compra_estimada_uf"]
    assert procesar_fila(reparada) == ("ya_presente", None)


def test_la_forma_legada_tambien_es_idempotente():
    _, nuevo = procesar_fila(FILA_LEGADA)
    assert procesar_fila(nuevo) == ("ya_presente", None)


@pytest.mark.parametrize(
    "fila",
    [
        {},
        {"result": {"financial_indicators": {}}},
        {"input_snapshot": ENTRADA, "result": {"financial_indicators": "nada"}},
    ],
)
def test_falla_fuerte_en_filas_que_no_entiende(fila):
    with pytest.raises(FilaIncomprensible):
        procesar_fila(fila)


# El dry-run es la evidencia que el equipo pega en el hilo del PR, así que su
# conteo tiene que cubrir todas las filas. Con `desde += PAGINA` una página
# recortada por db-max-rows dejaba filas fuera del recorrido, en silencio.
def test_la_paginacion_no_salta_filas_cuando_la_pagina_viene_recortada(monkeypatch, capsys):
    import backfill_capacity as script

    total = 7
    filas = [{"id": f"row-{i}", "financial_data": _fila()} for i in range(total)]
    recortada = 3  # el servidor devuelve menos de PAGINA aunque queden filas

    def leer_pagina(_url, _key, desde):
        return filas[desde : desde + recortada]

    monkeypatch.setattr(script, "_config", lambda: ("https://x", "sb_secret_x"))
    monkeypatch.setattr(script, "_leer_pagina", leer_pagina)
    monkeypatch.setattr(sys, "argv", ["backfill_capacity.py"])

    script.main()

    salida = capsys.readouterr().out
    assert f"calculados      : {total}" in salida


def test_un_error_de_red_informa_lo_ya_procesado_antes_de_cortar(monkeypatch, capsys):
    import backfill_capacity as script

    filas = [{"id": f"row-{i}", "financial_data": _fila()} for i in range(2)]
    paginas = iter([filas])

    def leer_pagina(_url, _key, _desde):
        try:
            return next(paginas)
        except StopIteration:
            raise script.ErrorDeRed("GET devolvió 503")

    monkeypatch.setattr(script, "_config", lambda: ("https://x", "sb_secret_x"))
    monkeypatch.setattr(script, "_leer_pagina", leer_pagina)
    monkeypatch.setattr(sys, "argv", ["backfill_capacity.py"])

    with pytest.raises(SystemExit):
        script.main()

    salida = capsys.readouterr().out
    assert "calculados      : 2" in salida
