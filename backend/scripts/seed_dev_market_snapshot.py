"""Explicit development-only seed for the ALG-9 fixture market snapshot.

It neither contacts BCCh nor changes the production refresh path.  The same
fixture remains ineligible for normal resolution unless the developer has set
MARKET_SNAPSHOT_ALLOW_FIXTURE=true in the local backend process.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.market_data.service import repository_from_environment
from app.market_data.snapshot import validate_snapshot


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "docs" / "algorithms" / "ALG-9-cases.json"


def fixture_snapshot() -> dict:
    """Load and validate the existing first ALG-9 case without changing it."""
    document = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    snapshot = document["cases"][0]["input"]["market_snapshot"]
    if snapshot.get("fixture_only") is not True:
        raise RuntimeError("The selected ALG-9 snapshot is not marked fixture_only")
    return validate_snapshot(snapshot)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed or remove the explicit DEV ALG-9 market fixture.")
    parser.add_argument("action", choices=("seed", "delete"))
    parser.add_argument("--confirm-dev", action="store_true", help="required acknowledgement that the target is development")
    args = parser.parse_args()
    if not args.confirm_dev:
        parser.error("--confirm-dev is required; this command is for a development store only")
    if os.getenv("MARKET_SNAPSHOT_ALLOW_FIXTURE") != "true":
        parser.error("MARKET_SNAPSHOT_ALLOW_FIXTURE=true is required for this development-only command")

    repository = repository_from_environment()
    if args.action == "seed":
        snapshot = fixture_snapshot()
        repository.insert(snapshot)
        print("Persisted explicit DEV fixture market snapshot.")
        return
    removed = repository.delete_fixture_snapshots()
    print(f"Removed {len(removed)} explicit DEV fixture market snapshot(s).")


if __name__ == "__main__":
    main()
