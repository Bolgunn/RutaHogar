"""BCCh BDE REST adapter. It is deliberately outside the scoring engine."""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from typing import Callable
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from .snapshot import TERM_DATASET_NAME, TERM_TABLE_URL, validate_snapshot

BCCH_ENDPOINT = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx"
SERIES = {
    "uf_value_clp": "F073.UFF.PRE.Z.D",
    "tasa_anual_uf": "F022.VIV.TIP.MA03.UF.Z.M",
    "ltv_referencial": "F034.RPV.PPO.BCCH.Z.Z.T",
    "plazo_referencial_anios": "F022.PZCHV.PER50.Z.Z.Z.D",
}
HTTP_TIMEOUT_SECONDS = 15


class BCChError(RuntimeError):
    pass


def redact_url(url: str) -> str:
    parts = urlsplit(url)
    query = "&".join(
        "token=REDACTED" if item.startswith("token=") else item
        for item in parts.query.split("&")
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def _default_transport(url: str, timeout: int):
    with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=timeout) as response:
        if response.status != 200:
            raise BCChError(f"BCCh HTTP status {response.status}")
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def _first(mapping: dict, *names):
    for name in names:
        if name in mapping and mapping[name] not in (None, ""):
            return mapping[name]
    return None


def _observation_list(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("Obs", "obs", "observations", "Observations", "data", "Data"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = _observation_list(value)
            if nested:
                return nested
    for value in payload.values():
        nested = _observation_list(value)
        if nested:
            return nested
    return []


def _parse_date(value) -> date:
    if not isinstance(value, str):
        raise BCChError("BCCh observation has no usable date")
    normalized = value.strip()[:10]
    for date_format in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(normalized, date_format).date()
        except ValueError:
            continue
    raise BCChError("BCCh observation date is invalid")


def _number(value) -> float:
    if isinstance(value, bool):
        raise BCChError("BCCh observation value is invalid")
    try:
        normalized = str(value).strip()
        if "," in normalized and "." not in normalized:
            normalized = normalized.replace(",", ".")
        number = float(normalized)
    except (TypeError, ValueError) as exc:
        raise BCChError("BCCh observation value is invalid") from exc
    if not math.isfinite(number):
        raise BCChError("BCCh observation value is invalid")
    return number


class BCChClient:
    def __init__(self, api_key_token: str, transport: Callable | None = None, timeout: int = HTTP_TIMEOUT_SECONDS):
        if not api_key_token:
            raise BCChError("BCCH_API_KEY_TOKEN is required")
        self.api_key_token = api_key_token
        self.transport = transport or _default_transport
        self.timeout = timeout

    def _fetch_series(self, series_id: str, as_of: date):
        query = urlencode({
            "token": self.api_key_token,
            "function": "GetSeries",
            "timeseries": series_id,
            "lastdate": as_of.isoformat(),
        })
        url = f"{BCCH_ENDPOINT}?{query}"
        try:
            payload = self.transport(url, self.timeout)
        except BCChError:
            raise
        except Exception as exc:
            raise BCChError(f"BCCh request failed for {series_id}") from exc
        if isinstance(payload, dict):
            response_code = payload.get("Codigo")
            if response_code not in (None, 0, "0"):
                raise BCChError(f"BCCh returned error code {response_code} for {series_id}")
        observations = []
        for item in _observation_list(payload):
            if not isinstance(item, dict):
                continue
            status = _first(item, "statusCode", "StatusCode")
            if status is not None and str(status).strip().upper() != "OK":
                continue
            raw_date = _first(item, "indexDateString", "date", "Date", "periodDate", "period")
            raw_value = _first(item, "value", "Value", "valor")
            try:
                observation_date = _parse_date(raw_date)
                value = _number(raw_value)
            except BCChError:
                continue
            if observation_date <= as_of:
                observations.append((observation_date, value, item))
        if not observations:
            raise BCChError(f"BCCh has no usable observation for {series_id}")
        return max(observations, key=lambda item: item[0])

    def fetch_snapshot(self, as_of: date, fetched_at: datetime | None = None) -> dict:
        if not isinstance(as_of, date):
            raise BCChError("as_of must be a date")
        fetched_at = fetched_at or datetime.now(timezone.utc)
        if fetched_at.tzinfo is None:
            raise BCChError("fetched_at must be timezone-aware")
        timestamp = fetched_at.isoformat().replace("+00:00", "Z")
        selected = {key: self._fetch_series(series, as_of) for key, series in SERIES.items()}

        def source(key, unit, **extra):
            observation_date, value, item = selected[key]
            return {
                "provider": "BCCh BDE",
                "series": SERIES[key],
                "unit": unit,
                "effective_date": observation_date.isoformat(),
                "fetched_at": timestamp,
                "raw_value": value,
                **extra,
            }

        ltv_item = selected["ltv_referencial"][2]
        period = _first(ltv_item, "period", "Period", "indexDateString")
        snapshot = {
            "uf_value_clp": selected["uf_value_clp"][1],
            "tasa_anual_uf": selected["tasa_anual_uf"][1] / 100,
            "ltv_referencial": selected["ltv_referencial"][1] / 100,
            "plazo_referencial_anios": selected["plazo_referencial_anios"][1] / 12,
            "effective_date": as_of.isoformat(),
            "fetched_at": timestamp,
            "source": {
                "uf_value_clp": source("uf_value_clp", "CLP/UF"),
                "tasa_anual_uf": source("tasa_anual_uf", "annual_percent"),
                "ltv_referencial": source("ltv_referencial", "percent", period=period),
                "plazo_referencial_anios": source(
                    "plazo_referencial_anios", "months", statistic="Percentil 50", url=TERM_TABLE_URL
                ),
            },
        }
        # The display name is preserved as metadata while the REST query remains exact code.
        snapshot["source"]["plazo_referencial_anios"]["dataset"] = TERM_DATASET_NAME
        return validate_snapshot(snapshot)
