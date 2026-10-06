import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import ingest_apify


def _raw(**overrides):
    item = {
        "title": "Edificio Ambar - Euro",
        "price_text": "Desde UF 2.983",
        "price_aria_label": "2983 unidades de fomento",
        "location": "Av. Matta 500, Santiago, Santiago",
        "possession_date": "Entrega inmediata",
        "seller": "Euro Inmobiliaria",
        "attributes": ["1 a 2 dormitorios", "1 a 2 baños", "29 - 44 m² útiles"],
        "url": "https://www.portalinmobiliario.com/MLC-1",
        "property_type": "Departamentos",
    }
    item.update(overrides)
    return item


def test_precio_desde_solo_cuando_el_aviso_lo_dice():
    assert ingest_apify.normalize_property_item(_raw())["precio_desde"] is True
    assert ingest_apify.normalize_property_item(_raw(price_text="UF 5.890"))["precio_desde"] is False


def test_inmobiliaria_sale_del_seller():
    assert ingest_apify.normalize_property_item(_raw())["inmobiliaria"] == "Euro Inmobiliaria"


def test_sin_seller_no_se_deduce_inmobiliaria_del_titulo():
    fila = ingest_apify.normalize_property_item(_raw(seller="", title="Diagonal Vicuña - Euro"))
    assert fila["inmobiliaria"] is None


def test_estado_segun_entrega():
    for entrega in ("Venta en verde", "Venta en blanco"):
        assert ingest_apify.normalize_property_item(_raw(possession_date=entrega))["estado"] == "en_construccion"
    for entrega in ("Entrega inmediata", "Pronta entrega", ""):
        assert ingest_apify.normalize_property_item(_raw(possession_date=entrega))["estado"] == "disponible"
