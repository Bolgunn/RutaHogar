"""Test process: production HTTP/services/scoring, fixed market and controllable projection clock."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT / 'backend/tests/tracking'))
from test_service import market_snapshot
from app.main import app
from app.tracking import routes
from app.tracking.service import TrackingService
from app.tracking.owner_reads import OwnerReadService
from app.tracking.staff import StaffLeadService
import uvicorn


def clock():
    value = json.loads(Path(os.environ['HU30_E2E_CONFIG']).read_text()).get('projection_time')
    return datetime.fromisoformat(value) if value else datetime.now(timezone.utc)

routes.TrackingService = lambda repo: TrackingService(repo, market_snapshot_resolver=market_snapshot)
routes.OwnerReadService = lambda repo, user: OwnerReadService(repo, user, clock())
routes.StaffLeadService = lambda repo: StaffLeadService(repo, clock=clock)
uvicorn.run(app, host='127.0.0.1', port=int(os.environ['HU30_BACKEND_PORT']), log_level='warning')
