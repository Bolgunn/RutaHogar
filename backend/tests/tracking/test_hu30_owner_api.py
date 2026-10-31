from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest

from test_tracking_api import api  # shared ASGI fixture; no external Auth/database
from test_hu30_persistence_contract import participation, snapshot_row, LEAD_ID

EVALUATION_ID = 'd3000000-0000-0000-0000-000000000001'


def reads(repo, closed=False):
    row = snapshot_row()
    row['id'] = EVALUATION_ID
    item = participation('revoked', datetime.now(timezone.utc) - timedelta(days=31)) if closed else participation()
    repo.co_debtor_rows = lambda ids: [deepcopy(item)]
    repo.owner_evaluations = lambda user: [deepcopy(row)] if user == LEAD_ID else []
    repo.owner_annotations = lambda user: [{'evaluation_id': EVALUATION_ID, 'kind': 'narrative',
                                          'payload': {'ai_explanation': '$1.400.000'}}]
    repo.staff_history = lambda user: [{'evaluation_id': EVALUATION_ID, 'snapshot': row['financial_data']}]
    repo.evaluation_identity = lambda value: {'id': EVALUATION_ID, 'user_id': LEAD_ID}
    return row


def test_owner_read_requires_bearer(api):
    client, repo = api
    reads(repo)
    assert client.get('/tracking/owner/evaluations').status_code == 401


def test_owner_projection_hides_closed_snapshot_and_its_annotations(api):
    client, repo = api
    reads(repo, closed=True)
    repo.authenticate = lambda token: LEAD_ID
    response = client.get('/tracking/owner/evaluations', headers={'Authorization': 'Bearer owner'})
    assert response.status_code == 200
    assert response.json()['items'][0]['annotations'] == []
    assert '$1.400.000' not in response.text and '1400000' not in response.text


def test_another_owner_cannot_use_evaluation_history_fallback(api):
    client, repo = api
    reads(repo)
    repo.staff_actor = lambda token: {'id': 'u1', 'role': 'usuario'}
    response = client.get(f'/tracking/evaluations/{EVALUATION_ID}/history', headers={'Authorization': 'Bearer other'})
    assert response.status_code == 403


@pytest.mark.parametrize('role', ['ejecutivo', 'admin_inmobiliario', 'admin'])
@pytest.mark.parametrize('authorized', [False, True])
def test_history_fallback_retains_staff_scope_and_projection(api, role, authorized):
    client, repo = api
    reads(repo, closed=True)
    repo.staff_actor = lambda token: {'id': 'u1', 'role': role, 'inmobiliaria_id': 'tenant'}
    repo.staff_can_access = lambda actor, lead: authorized and lead == LEAD_ID
    response = client.get(f'/tracking/evaluations/{EVALUATION_ID}/history', headers={'Authorization': 'Bearer staff'})
    assert response.status_code == (200 if authorized else 403)
    assert '1400000' not in response.text and '$1.400.000' not in response.text
