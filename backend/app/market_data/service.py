"""Snapshot refresh and resolution; scoring only receives the resolved value."""

from __future__ import annotations

import json
import os
from datetime import date, datetime
from pathlib import Path

from .bcch import BCChClient
from .repository import MarketRepositoryError, MarketSnapshotRepository
from .snapshot import SnapshotValidationError, validate_snapshot


class MarketSnapshotUnavailable(RuntimeError):
    pass


class MarketSnapshotStorageUnavailable(MarketSnapshotUnavailable):
    """The persisted market-data store cannot be configured or read."""


class MarketSnapshotNotFound(MarketSnapshotUnavailable):
    """The store was reachable but did not contain a valid bundle."""


FIXTURE_PATH = Path(__file__).resolve().parents[3] / "docs" / "algorithms" / "ALG-9-cases.json"


def _backend_secret() -> str:
    return os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""


def repository_from_environment() -> MarketSnapshotRepository:
    return MarketSnapshotRepository(os.getenv("SUPABASE_URL", ""), _backend_secret())


def resolve_latest_valid_snapshot(repository: MarketSnapshotRepository) -> dict:
    try:
        candidates = repository.list_candidates()
    except MarketRepositoryError as exc:
        raise MarketSnapshotStorageUnavailable("No fue posible acceder al almacenamiento de referencias de mercado.") from exc
    for row in candidates:
        candidate = row.get("snapshot") if isinstance(row, dict) else None
        try:
            snapshot = validate_snapshot(candidate)
        except SnapshotValidationError:
            continue
        if row.get("effective_date") != snapshot["effective_date"]:
            continue
        try:
            persisted_at = datetime.fromisoformat(str(row.get("fetched_at")).replace("Z", "+00:00"))
            embedded_at = datetime.fromisoformat(snapshot["fetched_at"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if persisted_at != embedded_at:
            continue
        return snapshot
    raise MarketSnapshotNotFound("No existe una referencia de mercado válida para completar la evaluación. Intenta nuevamente más tarde.")


def fixture_snapshots_allowed() -> bool:
    """Fixtures are an explicit development/test dependency, never a default."""
    return os.getenv("MARKET_SNAPSHOT_ALLOW_FIXTURE", "").lower() == "true"


def load_fixture_snapshot(path: Path | None = None) -> dict:
    """Load the single shared ALG-9 fixture and validate it as any persisted bundle."""
    fixture_path = path or FIXTURE_PATH
    try:
        document = json.loads(fixture_path.read_text(encoding="utf-8"))
        candidate = document["cases"][0]["input"]["market_snapshot"]
    except (OSError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        raise MarketSnapshotUnavailable("No fue posible cargar el fixture local de referencia de mercado.") from exc
    if not isinstance(candidate, dict) or candidate.get("fixture_only") is not True:
        raise MarketSnapshotUnavailable("El fixture local de referencia de mercado no está marcado sólo para desarrollo.")
    try:
        return validate_snapshot(candidate)
    except SnapshotValidationError as exc:
        raise MarketSnapshotUnavailable("El fixture local de referencia de mercado no es válido.") from exc


def resolve_market_snapshot_from_environment() -> dict:
    """Prefer persisted data; opt-in local fixture is only a development/test fallback."""
    try:
        repository = repository_from_environment()
        return resolve_latest_valid_snapshot(repository)
    except MarketRepositoryError as exc:
        unavailable = MarketSnapshotStorageUnavailable(
            "No hay almacenamiento de referencias de mercado configurado."
        )
        unavailable.__cause__ = exc
    except MarketSnapshotUnavailable as exc:
        unavailable = exc

    if fixture_snapshots_allowed():
        return load_fixture_snapshot()
    raise unavailable


def refresh_market_snapshot(repository: MarketSnapshotRepository, client: BCChClient, as_of: date) -> dict:
    # Fetch/validate completely before the single append-only persistence operation.
    snapshot = client.fetch_snapshot(as_of)
    try:
        repository.insert(snapshot)
    except MarketRepositoryError as exc:
        raise MarketSnapshotUnavailable("No fue posible persistir la referencia de mercado válida.") from exc
    return snapshot
