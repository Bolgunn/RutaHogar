"""Manual/scheduled out-of-band BCCh refresh. Never import this from HTTP routes."""

from datetime import datetime, timezone
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.market_data.bcch import BCChClient
from app.market_data.service import refresh_market_snapshot, repository_from_environment


def main():
    token = os.getenv("BCCH_API_KEY_TOKEN", "")
    client = BCChClient(token)
    snapshot = refresh_market_snapshot(repository_from_environment(), client, datetime.now(timezone.utc).date())
    print(f"Persisted market snapshot effective_date={snapshot['effective_date']} fetched_at={snapshot['fetched_at']}")


if __name__ == "__main__":
    main()
