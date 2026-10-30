from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tracking'))
from test_service import service, command, valid_snapshot
from app.documents.tracking_adapter import prepare_update
from app.documents.contracts import DocumentError
from app.tracking.service import TrackingService


def test_hu23_uses_real_hu13_lineage_without_scoring_or_market(monkeypatch):
    repo, normal=service()
    first=normal.execute('u1',command(valid_snapshot()))
    before=deepcopy(repo.bundle)
    def forbidden(*a,**k): raise AssertionError('HU23 invoked scoring/market')
    monkeypatch.setattr('app.tracking.scoring_adapter.resolve_tracking_market_snapshot', forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.score_snapshot',forbidden)
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    monkeypatch.setattr(TrackingService,'execute',forbidden)
    event_id=str(uuid4())
    update=prepare_update(repo.bundle,'u1',str(uuid4()),event_id,{'ingreso_mensual':1200000},'2026-03-01T00:00:00Z')
    records=update['records']
    assert records['evaluations']==[] and records['events'][0]['evaluation_id'] is None
    repo.commit('u1',update['command'],repo.bundle['revision'],records)
    assert repo.bundle['evaluations']==before['evaluations']
    assert repo.bundle['events'][0]==before['events'][0]
    assert normal.read('u1')['latest_effective_snapshot']['ingreso_mensual']==1200000
    assert normal.read('u1')['current_evaluation_id']==first['evaluation']['id']
    assert repo.bundle['plan']==before['plan']


def test_normal_data_update_still_evaluates():
    repo, normal=service()
    first=normal.execute('u1',command(valid_snapshot()))
    second=normal.execute('u1',command({'ahorro_disponible':2000000},first['event_id'],'2026-02-01T00:00:00Z'))
    assert len(repo.bundle['evaluations'])==2
    assert second['evaluation'] is not None
    assert repo.bundle['events'][-1]['evaluation_id'] is not None


def test_invalid_full_snapshot_cannot_be_prepared():
    repo,normal=service()
    normal.execute('u1',command(valid_snapshot()))
    with pytest.raises(Exception):
        prepare_update(repo.bundle,'u1',str(uuid4()),str(uuid4()),{'ingreso_mensual':-1},'2026-03-01Z')
    with pytest.raises(DocumentError,match='tracking_baseline_required'):
        prepare_update({'plan':None},'u1',str(uuid4()),str(uuid4()),{},'2026-03-01Z')
