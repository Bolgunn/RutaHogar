import asyncio
from copy import deepcopy

import httpx
import pytest

from app.main import app
from app.tracking.routes import repository
from test_hu30_safe_projections import Repository, LEAD_ID, OUTSIDE_LEAD_ID, NOW, closed
from app.tracking.owner_reads import OwnerReadService
from app.tracking.staff import StaffLeadService


@pytest.fixture
def api(monkeypatch):
    async def inline(call,*args,**kwargs):
        return call(*args,**kwargs)
    monkeypatch.setattr('fastapi.dependencies.utils.run_in_threadpool',inline)
    monkeypatch.setattr('fastapi.routing.run_in_threadpool',inline)
    # Fixed server clock for cutoff assertions; no financial recalculation.
    monkeypatch.setattr('app.tracking.routes.OwnerReadService',lambda repo,user:OwnerReadService(repo,user,NOW))
    monkeypatch.setattr('app.tracking.routes.StaffLeadService',lambda repo:StaffLeadService(repo,clock=lambda:NOW))
    repo=Repository()
    repo.authenticate=lambda token: LEAD_ID if token=='owner' else OUTSIDE_LEAD_ID
    actor=repo.staff_actor
    repo.staff_actor=lambda token: actor(token) if token in {'ejecutivo','admin','admin_inmobiliario'} else {'role':'usuario'}
    repo.evaluation_identity=lambda identifier: {'id':repo.rows[0]['id'],'user_id':LEAD_ID} if identifier==repo.rows[0]['id'] else None
    app.dependency_overrides[repository]=lambda:repo
    def get(path,token=None):
        async def send():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                return await client.get(path,headers={'Authorization':f'Bearer {token}'} if token else {})
        return asyncio.run(send())
    try:
        yield get,repo
    finally:
        app.dependency_overrides.clear()


def test_owner_endpoints_are_session_scoped_and_responses_cannot_be_cached(api):
    get,repo=api
    assert get('/tracking/owner/evaluations').status_code==401
    own=get('/tracking/owner/evaluations?user_id='+OUTSIDE_LEAD_ID,'owner')
    assert own.status_code==200
    view=own.json()['items'][0]['co_debtor']
    assert view['evaluation_type']=='bipersonal_confirmed'
    assert 'has_other_active_participations' not in view
    assert own.headers['cache-control']=='private, no-store'
    assert 'Authorization' in own.headers['vary']
    assert get('/tracking/owner/evaluations','other-owner').json()['items']==[]
    assert get('/tracking/owner/scoring-history','other-owner').json()['items']==[]
    assert get('/tracking/owner/co-debtor','other-owner').json()['items']==[]


def test_staff_history_route_uses_staff_projection_and_never_owner_pending_fields(api):
    get,repo=api
    identifier=repo.rows[0]['id']
    assert get(f'/tracking/evaluations/{identifier}/history','other-owner').status_code==403
    response=get(f'/tracking/evaluations/{identifier}/history','ejecutivo')
    assert response.status_code==200,response.text
    view=response.json()['items'][0]['co_debtor']
    assert view['has_other_active_participations'] is True
    assert 'current_revision' not in view and 'update_required' not in view
    own=get(f'/tracking/evaluations/{identifier}/history','owner')
    assert 'has_other_active_participations' not in own.json()['items'][0]['co_debtor']


def test_live_refresh_after_cutoff_redacts_body_without_changing_stored_evaluation(api):
    get,repo=api
    from datetime import timedelta
    path='/tracking/staff/leads/'+LEAD_ID
    assert get(path,'ejecutivo').json()['co_debtor']['co_debtor']['income']==1500000
    before=deepcopy(repo.rows)
    closed(repo.invitations[0],'revoked',NOW-timedelta(days=30))
    response=get(path,'ejecutivo')
    assert response.status_code==200
    view=response.json()['co_debtor']
    assert view['visibility']=='hidden' and view['evaluation_type']=='bipersonal_confirmed'
    assert '1500000' not in response.text and 'private@test.invalid' not in response.text
    assert repo.rows==before
    repo.tenant='tenant-2'
    assert get(path,'ejecutivo').status_code==403
    assert get('/tracking/staff/evaluations','ejecutivo').json()['items']==[]


def test_private_denials_cannot_be_cached(api):
    get, repo = api
    for path, token, status in [('/tracking/owner/evaluations', None, 401),
                                ('/tracking/staff/leads/' + OUTSIDE_LEAD_ID, 'ejecutivo', 403)]:
        response = get(path, token)
        assert response.status_code == status
        assert response.headers.get('cache-control') == 'private, no-store'
        assert response.headers.get('vary') == 'Authorization'
