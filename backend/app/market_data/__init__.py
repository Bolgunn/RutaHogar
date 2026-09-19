"""Persisted BCCh market data used by scoring orchestration."""

from .snapshot import SnapshotValidationError, validate_snapshot

__all__ = ["SnapshotValidationError", "validate_snapshot"]
