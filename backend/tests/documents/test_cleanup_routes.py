"""Cron is independent of user authentication; only fixed aggregate counts escape."""
import asyncio
import httpx
import pytest
from app.main import app
from app.documents.routes import cleanup_service, DocumentRepository


def request(method='GET', token=None):
    async def invoke():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            return await client.request(method,'/tracking/documents/cleanup',headers={} if token is None else {'Authorization':'Bearer '+token})
    return asyncio.run(invoke())


@pytest.mark.parametrize('method',['GET','POST'])
@pytest.mark.parametrize('token',[None,'user-jwt','wrong'])
def test_cleanup_rejects_users_before_creating_privileged_repository(monkeypatch,method,token):
    monkeypatch.setenv('CRON_SECRET','synthetic-cron')
    monkeypatch.delenv('HU23_CLEANUP_CRON_TOKEN',raising=False)
    def forbidden(*a,**k):raise AssertionError('unauthorized cron constructed service')
    monkeypatch.setattr('app.documents.routes.DocumentRepository',forbidden)
    response=request(method,token)
    assert response.status_code==401
    assert response.headers['cache-control']=='no-store'


def test_cleanup_unconfigured_is_unavailable(monkeypatch):
    monkeypatch.delenv('CRON_SECRET',raising=False);monkeypatch.delenv('HU23_CLEANUP_CRON_TOKEN',raising=False)
    assert request().status_code==503


@pytest.mark.parametrize('token',['synthetic-cron','synthetic-manual'])
def test_scheduler_and_dedicated_manual_secret_work_without_user_auth(monkeypatch,token):
    monkeypatch.setenv('CRON_SECRET','synthetic-cron');monkeypatch.setenv('HU23_CLEANUP_CRON_TOKEN','synthetic-manual')
    monkeypatch.setattr('app.documents.routes.DocumentRepository',lambda:object())
    monkeypatch.setattr('app.documents.cleanup.DocumentCleanupService.run',lambda self:{'storage_deleted':1})
    response=request(token=token)
    assert response.status_code==200 and response.json()=={'storage_deleted':1}
    assert response.headers['cache-control']=='no-store'
