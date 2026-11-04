import httpx
import pytest

from app.documents.contracts import DocumentError
from app.documents.repository import DocumentRepository
from app.tracking.repository import TrackingRepository


def test_auth_uses_supabase_auth_before_privileged_rpc(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL','https://synthetic.invalid')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-key')
    monkeypatch.delenv('SUPABASE_SECRET_KEY',raising=False)
    calls=[]
    def respond(request):
        calls.append(request)
        if request.url.path=='/auth/v1/user':
            assert request.headers['Authorization']=='Bearer owner-token'
            return httpx.Response(200,json={'id':'owner-from-auth'})
        assert request.headers['Authorization']=='Bearer synthetic-service-key'
        return httpx.Response(200,json={'process':{},'candidates':[],'evidence':[]})
    with httpx.Client(base_url='https://synthetic.invalid',transport=httpx.MockTransport(respond)) as client:
        repo=DocumentRepository(TrackingRepository(client))
        assert repo.authenticate('owner-token')=='owner-from-auth'
        repo.read('owner-from-auth','process-id')
    assert [r.url.path for r in calls]==['/auth/v1/user','/rest/v1/rpc/hu23_read']


def test_database_details_are_not_propagated(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL','https://synthetic.invalid')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','synthetic-key')
    monkeypatch.delenv('SUPABASE_SECRET_KEY',raising=False)
    with httpx.Client(base_url='https://synthetic.invalid',transport=httpx.MockTransport(
        lambda _:httpx.Response(400,json={'message':'internal details with synthetic sensitive data'}))) as client:
        with pytest.raises(DocumentError,match='^persistence_unavailable$'):
            DocumentRepository(TrackingRepository(client)).read('owner','process')
