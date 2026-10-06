from datetime import date, datetime, timezone
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data import bcch
from app.market_data.bcch import BCChClient, redact_url


VALUES = {
    "F073.UFF.PRE.Z.D": ("18-09-2026", "40695.00"),
    "F022.VIV.TIP.MA03.UF.Z.M": ("01-08-2026", "4.00"),
    "F034.RPV.PPO.BCCH.Z.Z.T": ("01-07-2026", "80.00"),
    "F022.PZCHV.PER50.Z.Z.Z.D": ("17-09-2026", "306.00"),
}


def transport(url, timeout):
    query = parse_qs(urlsplit(url).query)
    assert query["token"] == ["secret"]
    series = query["timeseries"][0]
    day, value = VALUES[series]
    return {
        "Codigo": 0,
        "Descripcion": "Success",
        "Series": {
            "Obs": [
                {
                    "indexDateString": day,
                    "value": value,
                    "statusCode": "OK",
                    "period": "III.2026",
                }
            ]
        },
        "SeriesInfos": [],
    }


def test_connector_uses_exact_series_and_normalizes_units():
    snapshot = BCChClient("secret", transport=transport).fetch_snapshot(date(2026, 9, 18), datetime(2026, 9, 18, tzinfo=timezone.utc))
    assert snapshot["tasa_anual_uf"] == .04
    assert snapshot["ltv_referencial"] == .8
    assert snapshot["plazo_referencial_anios"] == 25.5


def test_fetch_series_selects_latest_usable_observation_on_or_before_as_of():
    payload = {
        "Codigo": 0,
        "Descripcion": "Success",
        "Series": {
            "seriesId": "F073.UFF.PRE.Z.D",
            "Obs": [
                {"indexDateString": "24-09-2026", "value": "40780.12", "statusCode": "OK"},
                {"indexDateString": "23-09-2026", "value": "NaN", "statusCode": "ND"},
                {"indexDateString": "22-09-2026", "value": "40760.34", "statusCode": "OK"},
            ],
        },
        "SeriesInfos": [],
    }

    observation_date, value, item = BCChClient(
        "secret", transport=lambda _url, _timeout: payload
    )._fetch_series("F073.UFF.PRE.Z.D", date(2026, 9, 23))

    assert observation_date == date(2026, 9, 22)
    assert value == 40760.34
    assert item["statusCode"] == "OK"


def test_default_transport_uses_bcch_declared_charset(monkeypatch):
    body = (
        '{"Codigo":0,"Descripcion":"Success","Series":{"descripEsp":"Tasa de interés"}}'
        .encode("iso-8859-1")
    )

    class Headers:
        @staticmethod
        def get_content_charset():
            return "iso-8859-1"

    class Response:
        status = 200
        headers = Headers()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return body

    monkeypatch.setattr(bcch, "urlopen", lambda _request, timeout: Response())

    payload = bcch._default_transport("https://example.test", 15)

    assert payload["Codigo"] == 0
    assert payload["Series"]["descripEsp"] == "Tasa de interés"


def test_redacted_url_never_leaks_token():
    assert "secret" not in redact_url("https://x.test/?token=secret&function=GetSeries")
