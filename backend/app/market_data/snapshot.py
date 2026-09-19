"""Pure validation for a complete, reproducible ALG-9 market snapshot."""

from __future__ import annotations

import copy
import math
from datetime import date, datetime


class SnapshotValidationError(ValueError):
    """A candidate does not meet the persisted BCCh snapshot contract."""


SOURCE_REQUIREMENTS = {
    "uf_value_clp": {"series": "F073.UFF.PRE.Z.D", "unit": "CLP/UF"},
    "tasa_anual_uf": {"series": "F022.VIV.TIP.MA03.UF.Z.M", "unit": "annual_percent"},
    "ltv_referencial": {"series": "F034.RPV.PPO.BCCH.Z.Z.T", "unit": "percent"},
    "plazo_referencial_anios": {"series": "F022.PZCHV.PER50.Z.Z.Z.D", "unit": "months"},
}
TERM_DATASET_NAME = "Plazo de créditos hipotecarios para la vivienda"
TERM_TABLE_URL = "https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/CAP_IND_VIVIENDA/MN_IND_VIVIENDA/IVM_ECRED_01/638290046022543847"


def _finite_number(value, name: str) -> float:
    if isinstance(value, bool):
        raise SnapshotValidationError(f"{name} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SnapshotValidationError(f"{name} must be a finite number") from exc
    if not math.isfinite(number):
        raise SnapshotValidationError(f"{name} must be a finite number")
    return number


def _date(value, name: str) -> date:
    if not isinstance(value, str):
        raise SnapshotValidationError(f"{name} must be an ISO date")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SnapshotValidationError(f"{name} must be an ISO date") from exc


def _timestamp(value, name: str) -> datetime:
    if not isinstance(value, str):
        raise SnapshotValidationError(f"{name} must be a timezone-aware ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SnapshotValidationError(f"{name} must be a timezone-aware ISO timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SnapshotValidationError(f"{name} must be a timezone-aware ISO timestamp")
    return parsed


def _close(left: float, right: float) -> bool:
    return math.isclose(left, right, rel_tol=1e-12, abs_tol=1e-12)


def _validate_source(snapshot: dict, key: str, cutoff: date) -> None:
    source = snapshot["source"].get(key)
    if not isinstance(source, dict):
        raise SnapshotValidationError(f"source.{key} is required")
    if source.get("provider") != "BCCh BDE":
        raise SnapshotValidationError(f"source.{key}.provider must be BCCh BDE")

    expected = SOURCE_REQUIREMENTS[key]
    series = source.get("series")
    if key == "plazo_referencial_anios":
        if series not in {expected["series"], TERM_DATASET_NAME}:
            raise SnapshotValidationError("term source must identify the verified P50 series")
        if source.get("statistic") != "Percentil 50" or source.get("url") != TERM_TABLE_URL:
            raise SnapshotValidationError("term source must retain the P50 selector and official table URL")
    elif series != expected["series"]:
        raise SnapshotValidationError(f"source.{key}.series is not the required BCCh series")
    if source.get("unit") != expected["unit"]:
        raise SnapshotValidationError(f"source.{key}.unit is not the published unit")

    observation_date = _date(source.get("effective_date"), f"source.{key}.effective_date")
    _timestamp(source.get("fetched_at"), f"source.{key}.fetched_at")
    if observation_date > cutoff:
        raise SnapshotValidationError(f"source.{key} is after the bundle as-of date")
    raw = _finite_number(source.get("raw_value"), f"source.{key}.raw_value")
    normalized = _finite_number(snapshot[key], key)
    if key == "uf_value_clp" and not _close(raw, normalized):
        raise SnapshotValidationError("UF normalization does not match source")
    if key in {"tasa_anual_uf", "ltv_referencial"} and not _close(raw / 100, normalized):
        raise SnapshotValidationError(f"{key} normalization does not match source")
    if key == "plazo_referencial_anios" and not _close(raw / 12, normalized):
        raise SnapshotValidationError("term normalization does not match source months")
    if key == "ltv_referencial" and not source.get("period"):
        raise SnapshotValidationError("LTV source must retain its original period")


def validate_snapshot(candidate: dict) -> dict:
    """Return a deep copy of a complete valid snapshot or raise deterministically."""
    if not isinstance(candidate, dict):
        raise SnapshotValidationError("market snapshot must be an object")
    snapshot = copy.deepcopy(candidate)
    if not isinstance(snapshot.get("source"), dict):
        raise SnapshotValidationError("market snapshot source is required")

    uf = _finite_number(snapshot.get("uf_value_clp"), "uf_value_clp")
    rate = _finite_number(snapshot.get("tasa_anual_uf"), "tasa_anual_uf")
    ltv = _finite_number(snapshot.get("ltv_referencial"), "ltv_referencial")
    term = _finite_number(snapshot.get("plazo_referencial_anios"), "plazo_referencial_anios")
    if uf <= 0 or rate < 0 or not 0 < ltv < 1 or term <= 0:
        raise SnapshotValidationError("market snapshot values are outside their documented domain")
    cutoff = _date(snapshot.get("effective_date"), "effective_date")
    _timestamp(snapshot.get("fetched_at"), "fetched_at")
    for field in SOURCE_REQUIREMENTS:
        _validate_source(snapshot, field, cutoff)
    return snapshot


def is_valid_snapshot(candidate: dict) -> bool:
    try:
        validate_snapshot(candidate)
    except SnapshotValidationError:
        return False
    return True
