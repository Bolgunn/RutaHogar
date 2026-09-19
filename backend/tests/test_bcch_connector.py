from datetime import date, datetime, timezone
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data.bcch import BCChClient, redact_url


VALUES = {
    "F073.UFF.PRE.Z.D": ("2026-09-18", 40695),
    "F022.VIV.TIP.MA03.UF.Z.M": ("2026-08-31", 4),
    "F034.RPV.PPO.BCCH.Z.Z.T": ("2026-06-30", 80),
    "F022.PZCHV.PER50.Z.Z.Z.D": ("2026-09-17", 306),
}


def transport(url, timeout):
    query = parse_qs(urlsplit(url).query)
    assert query["token"] == ["secret"]
    series = query["timeseries"][0]
    day, value = VALUES[series]
    return {"Series": {"Obs": [{"indexDateString": day, "value": value, "period": "II.2026"}]}}


def test_connector_uses_exact_series_and_normalizes_units():
    snapshot = BCChClient("secret", transport=transport).fetch_snapshot(date(2026, 9, 18), datetime(2026, 9, 18, tzinfo=timezone.utc))
    assert snapshot["tasa_anual_uf"] == .04
    assert snapshot["ltv_referencial"] == .8
    assert snapshot["plazo_referencial_anios"] == 25.5


def test_redacted_url_never_leaks_token():
    assert "secret" not in redact_url("https://x.test/?token=secret&function=GetSeries")
