"""Snapshot refresh and resolution; scoring only receives the resolved value."""

from __future__ import annotations

import os
from datetime import date, datetime

from .bcch import BCChClient
from .repository import MarketRepositoryError, MarketSnapshotRepository
from .snapshot import SnapshotValidationError, validate_snapshot


class MarketSnapshotUnavailable(RuntimeError):
    pass


def _backend_secret() -> str:
    return os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""


def repository_from_environment() -> MarketSnapshotRepository:
    return MarketSnapshotRepository(os.getenv("SUPABASE_URL", ""), _backend_secret())


def resolve_latest_valid_snapshot(repository: MarketSnapshotRepository) -> dict:
    try:
        candidates = repository.list_candidates()
    except MarketRepositoryError as exc:
        raise MarketSnapshotUnavailable("No fue posible resolver una referencia de mercado válida.") from exc
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
    raise MarketSnapshotUnavailable("No fue posible obtener una referencia de mercado válida para completar la evaluación. Intenta nuevamente más tarde.")


def refresh_market_snapshot(repository: MarketSnapshotRepository, client: BCChClient, as_of: date) -> dict:
    # Fetch/validate completely before the single append-only persistence operation.
    snapshot = client.fetch_snapshot(as_of)
    try:
        repository.insert(snapshot)
    except MarketRepositoryError as exc:
        raise MarketSnapshotUnavailable("No fue posible persistir la referencia de mercado válida.") from exc
    return snapshot
