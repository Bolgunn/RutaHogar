import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring_engine.property_value import resolve_property_value_clp


def test_comuna_alone_does_not_create_a_property_value():
    resolved = resolve_property_value_clp({"comuna_objetivo": "Las Condes"}, 40_000)

    assert resolved["property_value_clp"] == 0
    assert resolved["property_value_source"] == "unknown"


def test_explicit_uf_value_uses_the_supplied_snapshot_uf():
    resolved = resolve_property_value_clp({"property_value_uf": 2_500}, 40_123.45)

    assert resolved["property_value_clp"] == 100_308_625
    assert resolved["property_value_uf"] == 2_500
    assert resolved["property_value_source"] == "declared_uf"


def test_explicit_clp_value_is_respected():
    resolved = resolve_property_value_clp({"property_value_clp": 175_000_000}, 40_000)

    assert resolved["property_value_clp"] == 175_000_000
    assert resolved["property_value_source"] == "declared_clp"


def test_changing_comuna_does_not_change_an_explicit_property_objective():
    declared = {"property_value_uf": 3_100}

    las_condes = resolve_property_value_clp({**declared, "comuna_objetivo": "Las Condes"}, 40_000)
    buin = resolve_property_value_clp({**declared, "comuna_objetivo": "Buin"}, 40_000)

    assert las_condes == buin
