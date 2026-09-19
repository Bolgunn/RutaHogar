import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data.snapshot import SnapshotValidationError, validate_snapshot


def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


def test_snapshot_accepts_complete_provenance_and_preserves_copy():
    candidate = snapshot()
    validated = validate_snapshot(candidate)
    assert validated == candidate
    assert validated is not candidate


@pytest.mark.parametrize("path,value", [
    (("uf_value_clp",), 0), (("tasa_anual_uf",), float("nan")), (("ltv_referencial",), 1), (("plazo_referencial_anios",), 0),
])
def test_snapshot_rejects_invalid_market_domains(path, value):
    candidate = snapshot()
    candidate[path[0]] = value
    with pytest.raises(SnapshotValidationError):
        validate_snapshot(candidate)


def test_snapshot_rejects_missing_provenance():
    candidate = snapshot()
    del candidate["source"]["ltv_referencial"]["period"]
    with pytest.raises(SnapshotValidationError):
        validate_snapshot(candidate)
