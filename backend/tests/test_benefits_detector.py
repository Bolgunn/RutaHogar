import os
import sys
from pathlib import Path

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring_engine.housing_benefits import detect_housing_benefits, CONDITION_LABELS


def _benefit_by_type(result, btype):
    for b in result["applicable_benefits"]:
        if b["type"] == btype:
            return b
    return None


def _eligible_types(result):
    return {b["type"] for b in result["applicable_benefits"] if b["eligible"]}


def _has_disclaimer(result):
    return (
        "referencial" in result["disclaimer"].lower()
        and "garantiza" in result["disclaimer"].lower()
    )


def _has_academy_modules(result):
    for b in result["applicable_benefits"]:
        if "academy_module" not in b:
            return False
    return True


def test_returns_all_six_benefits():
    result = detect_housing_benefits({}, {})
    assert len(result["applicable_benefits"]) == 6
    types = {b["type"] for b in result["applicable_benefits"]}
    assert types == {"FOGAES", "DS49", "PADHI", "DS1", "LEASING", "LEY_21748"}


def test_disclaimer_always_present():
    result = detect_housing_benefits({}, {})
    assert _has_disclaimer(result)
    assert result["summary"]


def test_all_benefits_have_academy_module():
    result = detect_housing_benefits({}, {})
    assert _has_academy_modules(result)


def test_fogaes_eligible():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3000, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert b["eligible"] is True
    assert CONDITION_LABELS["vivienda_nueva"] in b["conditions_met"]
    assert CONDITION_LABELS["precio_dentro_limite"] in b["conditions_met"]
    assert CONDITION_LABELS["pie_suficiente"] in b["conditions_met"]


def test_fogaes_eligible_up_to_6000_uf():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 5500, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert b["eligible"] is True
    assert CONDITION_LABELS["precio_dentro_limite"] in b["conditions_met"]


def test_fogaes_not_eligible_no_new_home():
    data = {"vivienda_nueva": False}
    indicators = {"property_value_uf": 3000, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert b["eligible"] is False
    assert CONDITION_LABELS["vivienda_nueva"] in b["conditions_not_met"]


def test_fogaes_not_eligible_price_too_high():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 6500, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert b["eligible"] is False
    assert CONDITION_LABELS["precio_dentro_limite"] in b["conditions_not_met"]


def test_fogaes_not_eligible_pie_too_low():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3000, "pie_ratio": 0.05}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert b["eligible"] is False
    assert CONDITION_LABELS["pie_suficiente"] in b["conditions_not_met"]


def test_fogaes_notes_always_mention_subsidio_3000_uf():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3000, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "FOGAES")
    assert "3000 UF" in b["notes"]
    assert "subsidio habitacional" in b["notes"]

    not_eligible_data = {"vivienda_nueva": False}
    not_eligible_ind = {"property_value_uf": 3000, "pie_ratio": 0.15}
    not_eligible_result = detect_housing_benefits(not_eligible_data, not_eligible_ind)
    b2 = _benefit_by_type(not_eligible_result, "FOGAES")
    assert b2["eligible"] is False
    assert "3000 UF" in b2["notes"]


def test_ds49_eligible():
    data = {
        "edad": 25,
        "rsh_tramo": 30,
        "propiedad_previa": False,
        "ahorro_uf": 15,
        "grupo_familiar_rsh": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS49")
    assert b["eligible"] is True
    assert CONDITION_LABELS["edad_minima"] in b["conditions_met"]
    assert CONDITION_LABELS["vulnerabilidad_rsh"] in b["conditions_met"]
    assert CONDITION_LABELS["sin_propiedad_previa"] in b["conditions_met"]
    assert CONDITION_LABELS["ahorro_minimo"] in b["conditions_met"]
    assert CONDITION_LABELS["grupo_familiar"] in b["conditions_met"]


def test_ds49_not_eligible_no_grupo_familiar():
    data = {
        "edad": 25,
        "rsh_tramo": 30,
        "propiedad_previa": False,
        "ahorro_uf": 15,
        "grupo_familiar_rsh": False,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS49")
    assert b["eligible"] is False
    assert CONDITION_LABELS["grupo_familiar"] in b["conditions_not_met"]


def test_ds49_not_eligible_propiedad_previa():
    data = {
        "edad": 25,
        "rsh_tramo": 30,
        "propiedad_previa": True,
        "ahorro_uf": 15,
        "grupo_familiar_rsh": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS49")
    assert b["eligible"] is False
    assert CONDITION_LABELS["sin_propiedad_previa"] in b["conditions_not_met"]


def test_ds49_adulto_mayor_rsh_relaxed():
    data = {
        "edad": 65,
        "rsh_tramo": 30,
        "propiedad_previa": False,
        "ahorro_uf": 15,
        "grupo_familiar_rsh": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS49")
    assert b["eligible"] is True
    assert CONDITION_LABELS["vulnerabilidad_rsh"] in b["conditions_met"]


def test_ds49_no_adulto_mayor_exception_above_40():
    data = {
        "edad": 65,
        "rsh_tramo": 85,
        "propiedad_previa": False,
        "ahorro_uf": 15,
        "grupo_familiar_rsh": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS49")
    assert b["eligible"] is False
    assert CONDITION_LABELS["vulnerabilidad_rsh"] in b["conditions_not_met"]


def test_padhi_eligible():
    data = {
        "deuda_hipotecaria_vigente": True,
        "beneficio_previo": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "PADHI")
    assert b["eligible"] is True


def test_padhi_not_eligible_no_beneficio_previo():
    data = {
        "deuda_hipotecaria_vigente": True,
        "beneficio_previo": False,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "PADHI")
    assert b["eligible"] is False
    assert CONDITION_LABELS["beneficio_previo"] in b["conditions_not_met"]


def test_padhi_not_eligible_no_deuda():
    data = {
        "deuda_hipotecaria_vigente": False,
        "beneficio_previo": True,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "PADHI")
    assert b["eligible"] is False
    assert CONDITION_LABELS["deuda_hipotecaria_vigente"] in b["conditions_not_met"]


def test_ds1_tramo_i_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert CONDITION_LABELS["tramo_I_ahorro"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_I_tope"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_I_rsh"] in b["conditions_met"]


def test_ds1_tramo_ii_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 45,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 70,
        "edad": 30,
    }
    indicators = {"property_value_uf": 1500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert CONDITION_LABELS["tramo_II_ahorro"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_II_tope"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_II_rsh"] in b["conditions_met"]


def test_ds1_tramo_iii_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 85,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 2000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert CONDITION_LABELS["tramo_III_ahorro"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_III_tope"] in b["conditions_met"]
    assert CONDITION_LABELS["tramo_III_rsh"] in b["conditions_met"]


def test_ds1_not_eligible_propiedad_previa():
    data = {
        "propiedad_previa": True,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is False
    assert CONDITION_LABELS["sin_propiedad_previa"] in b["conditions_not_met"]


def test_ds1_not_eligible_insufficient_savings():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 20,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is False
    assert CONDITION_LABELS["tramo_compatible"] in b["conditions_not_met"]


def test_ds1_not_eligible_insufficient_antiguedad():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 6,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is False
    assert CONDITION_LABELS["antiguedad_ahorro"] in b["conditions_not_met"]


def test_leasing_eligible():
    data = {
        "edad": 25,
        "registro_rui": True,
        "propiedad_previa": False,
        "beneficio_previo": False,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEASING")
    assert b["eligible"] is True
    assert CONDITION_LABELS["edad_minima"] in b["conditions_met"]
    assert CONDITION_LABELS["inscrito_rui"] in b["conditions_met"]
    assert CONDITION_LABELS["sin_propiedad_previa"] in b["conditions_met"]
    assert CONDITION_LABELS["sin_beneficio_previo"] in b["conditions_met"]


def test_leasing_not_eligible_no_rui():
    data = {
        "edad": 25,
        "registro_rui": False,
        "propiedad_previa": False,
        "beneficio_previo": False,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEASING")
    assert b["eligible"] is False
    assert CONDITION_LABELS["inscrito_rui"] in b["conditions_not_met"]


def test_leasing_not_eligible_propiedad_previa():
    data = {
        "edad": 25,
        "registro_rui": True,
        "propiedad_previa": True,
        "beneficio_previo": False,
    }
    indicators = {}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEASING")
    assert b["eligible"] is False
    assert CONDITION_LABELS["sin_propiedad_previa"] in b["conditions_not_met"]


def test_ley_21748_eligible():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEY_21748")
    assert b["eligible"] is True
    assert CONDITION_LABELS["vivienda_nueva"] in b["conditions_met"]
    assert CONDITION_LABELS["persona_natural"] in b["conditions_met"]
    assert CONDITION_LABELS["valor_dentro_limite"] in b["conditions_met"]


def test_ley_21748_not_eligible_no_new_home():
    data = {"vivienda_nueva": False}
    indicators = {"property_value_uf": 3500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEY_21748")
    assert b["eligible"] is False
    assert CONDITION_LABELS["vivienda_nueva"] in b["conditions_not_met"]


def test_ley_21748_not_eligible_price_too_high():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 5000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEY_21748")
    assert b["eligible"] is False
    assert CONDITION_LABELS["valor_dentro_limite"] in b["conditions_not_met"]


def test_empty_data_returns_all_benefits_not_eligible():
    result = detect_housing_benefits(None, None)
    assert len(result["applicable_benefits"]) == 6
    eligible = _eligible_types(result)
    assert len(eligible) == 0


def test_multiple_benefits_eligible():
    data = {
        "vivienda_nueva": True,
        "edad": 25,
        "rsh_tramo": 30,
        "propiedad_previa": False,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 18,
        "grupo_familiar_rsh": True,
        "registro_rui": True,
        "beneficio_previo": False,
    }
    indicators = {"property_value_uf": 1000, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    eligible = _eligible_types(result)
    assert "FOGAES" in eligible
    assert "DS49" in eligible
    assert "DS1" in eligible
    assert "LEASING" in eligible
    assert "LEY_21748" in eligible


def test_summary_reflects_eligibility():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3000, "pie_ratio": 0.15}
    result = detect_housing_benefits(data, indicators)
    assert "compatible" in result["summary"].lower()

    result_empty = detect_housing_benefits({}, {})
    assert "no se detectaron" in result_empty["summary"].lower()


def test_condition_labels_are_all_strings():
    for key, label in CONDITION_LABELS.items():
        assert isinstance(label, str), f"{key} label is not a string"
        assert len(label) > 5, f"{key} label is too short: {label}"


def test_ds1_tramo_i_adulto_mayor_rsh_90_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 90,
        "edad": 65,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert CONDITION_LABELS["tramo_I_ahorro"] in b["conditions_met"]


def test_ds1_tramo_i_adulto_mayor_rsh_95_not_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 35,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 95,
        "edad": 65,
    }
    indicators = {"property_value_uf": 1000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is False


def test_ds1_tramo_ii_adulto_mayor_rsh_90_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 45,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 90,
        "edad": 65,
    }
    indicators = {"property_value_uf": 1500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert CONDITION_LABELS["tramo_II_ahorro"] in b["conditions_met"]


def test_ds1_tramo_ii_adulto_mayor_rsh_95_not_eligible():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 45,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 95,
        "edad": 65,
    }
    indicators = {"property_value_uf": 1500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is False


def test_ds1_tramo_iii_notes_mention_renta_minvu_aviso():
    data = {
        "propiedad_previa": False,
        "ahorro_uf": 85,
        "ahorro_antiguedad_meses": 18,
        "rsh_tramo": 50,
        "edad": 30,
    }
    indicators = {"property_value_uf": 2000}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "DS1")
    assert b["eligible"] is True
    assert b["notes"] and "MINVU" in b["notes"]


def test_ley_21748_notes_60_puntos_base():
    data = {"vivienda_nueva": True}
    indicators = {"property_value_uf": 3500}
    result = detect_housing_benefits(data, indicators)
    b = _benefit_by_type(result, "LEY_21748")
    assert b["eligible"] is True
    assert "60 puntos base" in b["notes"]
    assert "0.6 puntos base" not in b["notes"]
