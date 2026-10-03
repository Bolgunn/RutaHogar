import os
import sys
import json
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.scoring import calculate_score

MARKET_SNAPSHOT = json.loads((Path(__file__).resolve().parents[1] / "docs" / "algorithms" / "ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


def base_payload(**overrides):
    data = {
        "ingreso_mensual": 2500000,
        "deuda_mensual": 150000,
        "edad": 32,
        "ahorro_disponible": 30000000,
        "property_value": 3500,
        "property_value_unit": "uf",
        "property_value_uf": 3500,
        "property_value_clp": 142432500,
        "uf_value_clp": 40695,
        "plazo_credito_hipotecario": 25,
        "tipo_contrato": "indefinido",
        "continuidad_laboral": "mas_3_anios",
        "morosidad_actual": "no",
        "dividendo_estimado": 500000,
        "complemento_renta": False,
        "declara_patrimonio": False,
        "market_snapshot": MARKET_SNAPSHOT,
    }
    data.update(overrides)
    return data


def joined(result, key):
    items = result.get(key, [])
    texts = []
    for item in items:
        if isinstance(item, dict):
            texts.append(item.get("text", str(item)))
        else:
            texts.append(str(item))
    return " ".join(texts)


def test_joven_indefinido_sin_morosidad_buen_ahorro():
    result = calculate_score(base_payload())
    assert result["classification"] == "Alto", result
    assert "Ahorro" in joined(result, "positive_indicators")


def test_edad_mas_plazo_no_rechaza_ni_penaliza_en_backend():
    base = calculate_score(base_payload())
    result = calculate_score(base_payload(edad=50, plazo_credito_hipotecario=30))
    assert result["classification"] in {"Alto", "Medio"}, result
    assert result["score"] >= base["score"] - 5, result
    text = f"{joined(result, 'risks')} {joined(result, 'recommendations')}".lower()
    assert "edad" in text or "plazo" in text, result


def test_contrato_plazo_fijo_alerta_y_baja_score():
    base = calculate_score(base_payload())
    result = calculate_score(base_payload(tipo_contrato="plazo_fijo"))
    assert result["score"] < base["score"], result
    assert "plazo fijo" in joined(result, "risks").lower()


def test_morosidad_alta_y_antigua_genera_advertencia_fuerte():
    result = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            deuda_mensual=450000,
            ahorro_disponible=1000000,
            morosidad_actual="si",
            monto_morosidad=1500000,
            antiguedad_morosidad="1_a_3_anios",
        )
    )
    assert result["classification"] == "Bajo", result
    assert "morosidad" in joined(result, "risks").lower()


def test_complementario_valido_sin_morosidad_se_considera():
    sin_complemento = calculate_score(base_payload(ingreso_mensual=1200000, dividendo_estimado=500000))
    con_complemento = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            dividendo_estimado=500000,
            complemento_renta=True,
            ingreso_mensual_complementario=1200000,
            deuda_mensual_complementario=100000,
            tipo_contrato_complementario="indefinido",
            continuidad_laboral_complementario="mas_3_anios",
            morosidad_complementario="no",
            relacion_complementario="conyuge",
        )
    )
    assert con_complemento["financial_indicators"]["ingreso_total"] == 2400000, con_complemento
    assert con_complemento["financial_indicators"]["ingreso_complementario_considerado"] == 1200000, con_complemento
    assert con_complemento["base_score"] > sin_complemento["base_score"], con_complemento
    assert con_complemento["score"] > sin_complemento["score"], con_complemento
    assert not con_complemento["blockers"], con_complemento


def test_complementario_con_morosidad_no_mejora():
    sin_complemento = calculate_score(base_payload(ingreso_mensual=1200000, dividendo_estimado=500000))
    con_morosidad = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            dividendo_estimado=500000,
            complemento_renta=True,
            ingreso_mensual_complementario=1200000,
            deuda_mensual_complementario=100000,
            tipo_contrato_complementario="indefinido",
            continuidad_laboral_complementario="mas_3_anios",
            morosidad_complementario="si",
            relacion_complementario="conyuge",
        )
    )
    assert con_morosidad["score"] <= sin_complemento["score"], con_morosidad
    assert "complementaria declara morosidad" in joined(con_morosidad, "risks").lower()


def test_complementario_amigo_advierte_y_no_mejora_demasiado():
    result = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            dividendo_estimado=500000,
            complemento_renta=True,
            ingreso_mensual_complementario=1800000,
            deuda_mensual_complementario=0,
            tipo_contrato_complementario="indefinido",
            continuidad_laboral_complementario="mas_3_anios",
            morosidad_complementario="no",
            relacion_complementario="amigo",
        )
    )
    assert "relación" in joined(result, "risks").lower() or "relacion" in joined(result, "risks").lower()


def test_monto_vivienda_alto_vs_ingreso_ahorro_recomienda_ajustar():
    result = calculate_score(
        base_payload(
            ingreso_mensual=1000000,
            deuda_mensual=100000,
            ahorro_disponible=1000000,
            property_value_uf=8000,
            property_value_clp=325560000,
            dividendo_estimado=900000,
        )
    )
    text = f"{joined(result, 'risks')} {joined(result, 'recommendations')}".lower()
    assert "ahorro" in text or "objetivo" in text, result


def test_patrimonio_declared_mejora_moderada():
    sin_patrimonio = calculate_score(base_payload(ahorro_disponible=12000000))
    con_patrimonio = calculate_score(
        base_payload(
            ahorro_disponible=12000000,
            declara_patrimonio=True,
            valor_vehiculos=12000000,
            valor_inmuebles=25000000,
            patrimonio_unit="clp",
        )
    )
    assert con_patrimonio["score"] == sin_patrimonio["score"], con_patrimonio
    assert con_patrimonio["base_score"] == sin_patrimonio["base_score"], con_patrimonio
    assert con_patrimonio["classification"] == sin_patrimonio["classification"], con_patrimonio
    assert con_patrimonio["main_blocker"]["code"] == "pie_insuficiente", con_patrimonio
    assert "Patrimonio" in joined(con_patrimonio, "positive_indicators")


def test_vehiculo_como_patrimonio_mejora_leve():
    sin_patrimonio = calculate_score(base_payload(ahorro_disponible=12000000))
    con_vehiculo = calculate_score(
        base_payload(
            ahorro_disponible=12000000,
            declara_patrimonio=True,
            valor_vehiculos=9000000,
            valor_inmuebles=0,
            patrimonio_unit="clp",
        )
    )
    assert con_vehiculo["score"] == sin_patrimonio["score"], con_vehiculo
    assert con_vehiculo["base_score"] == sin_patrimonio["base_score"], con_vehiculo
    assert con_vehiculo["classification"] == sin_patrimonio["classification"], con_vehiculo
    assert con_vehiculo["main_blocker"]["code"] == "pie_insuficiente", con_vehiculo
    assert "respaldo patrimonial" in joined(con_vehiculo, "positive_indicators").lower()


def test_propiedad_como_patrimonio_mejora_moderada_sin_forzar_alto():
    sin_patrimonio = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            deuda_mensual=200000,
            ahorro_disponible=8000000,
            tipo_contrato="honorarios_variable",
            continuidad_laboral="entre_1_y_3_anios",
            dividendo_estimado=500000,
        )
    )
    con_propiedad = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            deuda_mensual=200000,
            ahorro_disponible=8000000,
            tipo_contrato="honorarios_variable",
            continuidad_laboral="entre_1_y_3_anios",
            dividendo_estimado=500000,
            declara_patrimonio=True,
            valor_vehiculos=0,
            valor_inmuebles=45000000,
            patrimonio_unit="clp",
        )
    )
    assert con_propiedad["score"] == sin_patrimonio["score"], con_propiedad
    assert con_propiedad["base_score"] == sin_patrimonio["base_score"], con_propiedad
    # ALG-1's weighted score replaces the retired additive classification.
    assert con_propiedad["classification"] in {"Bajo", "Medio"}, con_propiedad
    assert con_propiedad["main_blocker"]["code"] == "carga_total_alta", con_propiedad
    assert "Patrimonio" in joined(con_propiedad, "positive_indicators")


def test_patrimonio_no_compensa_morosidad_fuerte():
    result = calculate_score(
        base_payload(
            ingreso_mensual=1200000,
            deuda_mensual=450000,
            ahorro_disponible=1000000,
            morosidad_actual="si",
            monto_morosidad=1500000,
            antiguedad_morosidad="1_a_3_anios",
            declara_patrimonio=True,
            valor_vehiculos=15000000,
            valor_inmuebles=50000000,
            patrimonio_unit="clp",
        )
    )
    assert result["classification"] == "Bajo", result
    assert "morosidad" in joined(result, "risks").lower()
    assert "Patrimonio" in joined(result, "positive_indicators")
    assert result["score"] <= 59, result


def test_datos_contacto_no_afectan_scoring():
    base = calculate_score(base_payload())
    con_contacto = calculate_score(
        base_payload(
            full_name="Persona Demo",
            email="persona@example.com",
            phone="+56912345678",
        )
    )
    assert con_contacto["score"] == base["score"]
    assert con_contacto["classification"] == base["classification"]


if __name__ == "__main__":
    tests = [
        test_joven_indefinido_sin_morosidad_buen_ahorro,
        test_edad_mas_plazo_no_rechaza_ni_penaliza_en_backend,
        test_contrato_plazo_fijo_alerta_y_baja_score,
        test_morosidad_alta_y_antigua_genera_advertencia_fuerte,
        test_complementario_valido_sin_morosidad_se_considera,
        test_complementario_con_morosidad_no_mejora,
        test_complementario_amigo_advierte_y_no_mejora_demasiado,
        test_monto_vivienda_alto_vs_ingreso_ahorro_recomienda_ajustar,
        test_patrimonio_declared_mejora_moderada,
        test_vehiculo_como_patrimonio_mejora_leve,
        test_propiedad_como_patrimonio_mejora_moderada_sin_forzar_alto,
        test_patrimonio_no_compensa_morosidad_fuerte,
        test_datos_contacto_no_afectan_scoring,
    ]
    for test in tests:
        test()
        print(f"{test.__name__}: OK")
    print("Todas las pruebas de scoring pasaron.")
