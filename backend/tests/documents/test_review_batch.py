from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.documents.backing import DocumentBackingService
from app.documents.contracts import StaffBackingBatchRequest
from app.documents.score_update import pending_context
from app.documents.tracking_adapter import effective_declaration
from app.tracking.contracts import TrackingError

NOW = datetime(2026, 10, 3, tzinfo=timezone.utc)


def test_batch_authenticates_once_and_omits_unauthorized(monkeypatch):
    ids = [str(uuid4()) for _ in range(100)]
    class Tracking:
        calls = 0
        def staff_actor(self, token):
            self.calls += 1
            return {"role": "ejecutivo", "inmobiliaria_id": "tenant"}
        def staff_can_access(self, actor, subject):
            return subject != ids[-1]
    class Repo:
        tracking = Tracking()
    repo = Repo()
    service = DocumentBackingService(repo)
    calls = []
    monkeypatch.setattr(service, '_projection', lambda subject, owner: calls.append(subject) or {'fields': []})
    result = service.staff_batch('token', ids)
    assert repo.tracking.calls == 1 and set(result) == set(ids[:-1])
    assert ids[-1] not in calls


def test_batch_checks_uuid_and_limit():
    ids = [uuid4() for _ in range(100)]
    assert len(StaffBackingBatchRequest(lead_ids=ids).lead_ids) == 100
    with pytest.raises(ValidationError): StaffBackingBatchRequest(lead_ids=ids + [uuid4()])
    with pytest.raises(ValidationError): StaffBackingBatchRequest(lead_ids=['not-a-uuid'])
    with pytest.raises(ValidationError): StaffBackingBatchRequest(lead_ids=[])


def test_effective_helper_handles_future_current_correction_and_empty(monkeypatch):
    import app.documents.tracking_adapter as adapter
    calls = []
    rows = [
        {'event_id': 'past', 'effective_at': '2026-10-01T00:00:00Z', 'snapshot': {'ingreso_mensual': 50}},
        {'event_id': 'corrected', 'effective_at': '2026-10-02T00:00:00Z', 'snapshot': {'ingreso_mensual': 90}},
        {'event_id': 'future', 'effective_at': '2026-10-04T00:00:00Z', 'snapshot': {'ingreso_mensual': 999}},
    ]
    monkeypatch.setattr(adapter, 'source_events', lambda bundle: bundle['events'])
    monkeypatch.setattr(adapter, 'financial_field_contract', lambda: {})
    def reconstruct(events, user, contract):
        calls.append(list(events))
        return {'active_line': events}
    monkeypatch.setattr(adapter, 'reconstruct', reconstruct)
    bundle = {'plan': {}, 'evaluations': [1], 'events': rows}
    bundle['plan'] = {'id':'p'}
    assert effective_declaration(bundle, 'u', at=NOW)[2]['ingreso_mensual'] == 90
    assert effective_declaration(bundle, 'u', at=NOW, through_revision='past')[2]['ingreso_mensual'] == 50
    assert effective_declaration(bundle, 'u', at=datetime(2026,9,1,tzinfo=timezone.utc))[2] == {}
    with pytest.raises(Exception, match='invalid_lineage'):
        effective_declaration(bundle, 'u', at=NOW, through_revision='unknown')


def test_pending_context_empty_effective_line_does_not_raise(monkeypatch):
    import app.documents.score_update as module
    monkeypatch.setattr(module, 'effective_declaration', lambda *a, **kw: ({'active_line': []}, [], {}))
    result = pending_context({'user_id':'u', 'tracking':{'plan':{'id':'p'}, 'revision':'r', 'events':[], 'evaluations':[{}]}, 'evidence':[]}, NOW)
    assert result['pending'] is False and result['evaluation_id'] is None and result['_previous'] is None


def test_batch_http_scope_and_invalid_payload_are_private(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.documents.routes import router, repository
    allowed, denied = str(uuid4()), str(uuid4())
    class Tracking:
        actor_calls = 0
        def staff_actor(self, token):
            self.actor_calls += 1
            return {'role':'ejecutivo','inmobiliaria_id':'tenant'}
        def staff_can_access(self, actor, subject): return subject == allowed
    class Repo:
        tracking = Tracking()
    repo = Repo()
    app = FastAPI(); app.include_router(router); app.dependency_overrides[repository] = lambda: repo
    fields = [{'field': f, 'status':'sin_respaldo','confirmed_on':None} for f in
              ('ingreso_mensual','ahorro_disponible','tipo_contrato','continuidad_laboral')]
    monkeypatch.setattr(DocumentBackingService, '_projection', lambda self, subject, owner: {'fields':fields})
    client = TestClient(app)
    response = client.post('/tracking/documents/staff/backing/batch', headers={'Authorization':'Bearer token'},
                           json={'lead_ids':[allowed, denied]})
    assert response.status_code == 200 and list(response.json()) == [allowed]
    assert denied not in response.text and response.headers['cache-control'] == 'no-store'
    assert repo.tracking.actor_calls == 1
    assert client.post('/tracking/documents/staff/backing/batch', headers={'Authorization':'Bearer token'},
                       json={'lead_ids':['bad']}).status_code == 422
    assert client.post('/tracking/documents/staff/backing/batch', headers={'Authorization':'Bearer token'},
                       json={'lead_ids':[allowed]*101}).status_code == 422


def test_score_status_http_with_no_effective_event_returns_conservative_200():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.documents.routes import router, context
    from app.documents.service import DocumentService
    class Repo:
        def rpc(self, name, payload):
            assert name == 'hu23_score_context'
            return {'user_id':'u', 'tracking':{'plan':{'id':'p'}, 'revision':None,
                                               'events':[], 'evaluations':[{'id':'e'}]}, 'evidence':[]}
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[context] = lambda: ('u', DocumentService(Repo()))
    response = TestClient(app).get('/tracking/documents/score/status')
    assert response.status_code == 200
    assert response.json()['pending'] is False and response.json()['evaluation_id'] is None
