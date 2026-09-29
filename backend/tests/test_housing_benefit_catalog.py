import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "publish_housing_benefit_catalog.py"
SPEC = importlib.util.spec_from_file_location("catalogue_publish", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def valid_catalogue():
    return {
        "version": "test-v1", "status": "published", "source_checksum": "abc",
        "official_source_metadata": {"sources": [{"url": "https://example.test/ds1"}]},
        "entries": [{"identifier": "DS1", "value": {"amount_clp": 1}}, {"identifier": "DS49", "value": {"amount_clp": 1}}],
    }


def test_catalogue_validation_requires_reviewed_metadata_and_amount_matrix():
    assert MODULE.validate(valid_catalogue())["version"] == "test-v1"
    invalid = valid_catalogue()
    invalid["entries"][0]["value"]["amount_clp"] = 0
    try:
        MODULE.validate(invalid)
    except ValueError as error:
        assert "amount matrix" in str(error)
    else:
        raise AssertionError("catalogue without an official amount was accepted")
