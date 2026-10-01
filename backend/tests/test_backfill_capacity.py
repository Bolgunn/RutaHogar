import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import backfill_capacity


def test_backfill_refuses_historical_mutation():
    with pytest.raises(backfill_capacity.FilaIncomprensible):
        backfill_capacity.procesar_fila({})
