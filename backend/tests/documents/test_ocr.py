"""Real PostgreSQL orchestration with synthetic Azure and Storage ports."""
from uuid import uuid4
import pytest

from app.documents.azure import OcrError, Recognition, Started
from app.documents.contracts import CancelProcess, DocumentError
from app.documents.ocr import OcrService
from app.documents.upload import UploadService
from test_persistence import setup, api, sql, lit, seed, admit_upload, pytestmark
from test_upload import FakeStorage


class Storage(FakeStorage):
    def signed_read(self,path):
        return 'https://storage.synthetic.invalid/reserved?token=synthetic'


class Azure:
    def __init__(self):
        self.id=str(uuid4());self.begins=0;self.polls=0;self.deletes=0
        self.begin_error=None;self.poll_error=None;self.delete_error=None
        self.on_begin=None;self.on_poll=None;self.status='running'
    def begin(self,url):
        self.begins+=1
        if self.on_begin:self.on_begin()
        if self.begin_error:raise self.begin_error
        return Started(result_id=self.id,retry_after=7)
    def poll(self,result_id):
        assert result_id==self.id
        self.polls+=1
        if self.on_poll:self.on_poll()
        if self.poll_error:raise self.poll_error
        return Recognition(status=self.status,analyzeResult={'content':'SYNTHETIC SECRET OCR','pages':[{}]}),2
    def delete(self,result_id):
        assert result_id==self.id;self.deletes+=1
        if self.delete_error:raise self.delete_error


def prepare(setup):
    user,pid,repo,_=setup
    admit_upload(user,pid,repo)
    azure,storage=Azure(),Storage()
    return OcrService(repo,azure=azure,storage=storage),azure,storage


def due(pid):
    sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)};")


def test_success_is_async_idempotent_minimal_and_does_not_score(setup,monkeypatch):
    user,pid,repo,_=setup
    service,azure,storage=prepare(setup)
    before=repo.load_tracking(user)
    def forbidden(*a,**k):raise AssertionError('OCR invoked financial scoring')
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.resolve_tracking_market_snapshot',forbidden)
    started=service.start(user,pid)
    assert started['state']=='processing' and azure.begins==1 and azure.polls==0
    assert service.start(user,pid)['state']=='processing' and azure.begins==1
    service.poll(user,pid)
    assert azure.polls==0 # Provider Retry-After is durable, not a browser suggestion.
    due(pid);assert service.poll(user,pid)['state']=='processing'
    azure.status='succeeded';due(pid)
    ready=service.poll(user,pid)
    assert ready['state']=='ocr_ready' and azure.polls==2 and azure.deletes==0
    service.poll(user,pid);assert azure.polls==2
    assert service.read_layout(user,pid).analyzeResult['content']=='SYNTHETIC SECRET OCR'
    persisted=sql(f"SELECT to_jsonb(j)::text FROM document_ocr_jobs j WHERE process_id={lit(pid)};")
    assert 'SYNTHETIC' not in persisted and 'urlSource' not in persisted and '?token' not in persisted
    assert 'result_id' not in ready and 'content' not in ready
    assert repo.load_tracking(user)==before
    assert repo.read(user,pid)['candidates']==[]
    with pytest.raises(DocumentError,match='invalid_transition'):
        service.release_result(user,pid) # No early destruction before T4 consumes.


def test_claim_prevents_concurrent_double_submit_and_recovers_crash_conservatively(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    first=service._step(user,pid,'start')
    second=service._step(user,pid,'start')
    assert first['action']=='submit' and second['action'] is None
    assert first['job']['lease_token']==second['job']['lease_token']
    sql(f"UPDATE document_ocr_jobs SET lease_until=now()-interval '1 second' WHERE process_id={lit(pid)};")
    result=service.poll(user,pid)
    assert result['state']=='processing_failed' and result['status']=='submission_unknown'
    assert azure.begins==0
    # A delayed 202 is still captured after closure, solely to allow deletion.
    service._step(user,pid,'settle',first['job']['lease_token'],
                  {'outcome':'started','result_id':azure.id,'retry_after':2})
    due(pid);service.try_cleanup(user,pid)
    assert azure.deletes==1


def test_submit_429_retries_only_after_due_and_with_same_logical_job(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    azure.begin_error=OcrError('transient',retry_after=60)
    assert service.start(user,pid)['status']=='retry_wait'
    service.start(user,pid);assert azure.begins==1
    azure.begin_error=None;due(pid)
    assert service.start(user,pid)['status']=='running' and azure.begins==2
    assert sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(pid)};')=='1'


def test_uncertain_submit_is_not_repeated_and_never_changes_financial_data(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    before=repo.load_tracking(user)
    azure.begin_error=OcrError('submission_unknown')
    result=service.start(user,pid)
    assert result['status']=='submission_unknown' and result['state']=='processing_failed'
    service.start(user,pid);service.poll(user,pid)
    assert azure.begins==1 and repo.load_tracking(user)==before


@pytest.mark.parametrize('error',[None,OcrError('invalid_response')])
def test_failed_azure_closes_attempt_and_deletes_both_resources(setup,error):
    user,pid,repo,_=setup
    service,azure,storage=prepare(setup)
    service.start(user,pid);azure.status='failed';azure.poll_error=error;due(pid)
    result=service.poll(user,pid)
    assert result['state']=='processing_failed' and result['result_deletion_state']=='deleted'
    assert azure.deletes==1 and len(storage.paths)==1
    assert repo.read(user,pid)['evidence']==[]


@pytest.mark.parametrize('during',['submit','poll'])
def test_cancel_during_remote_request_cannot_reopen_process(setup,during):
    user,pid,repo,documents=setup
    service,azure,storage=prepare(setup)
    def cancel():
        process=repo.read(user,pid)['process']
        UploadService(repo,storage).cancel(user,pid,CancelProcess(expected_revision=process['revision']))
    if during=='submit':
        azure.on_begin=cancel;result=service.start(user,pid)
    else:
        service.start(user,pid);azure.on_poll=cancel;azure.status='succeeded';due(pid);result=service.poll(user,pid)
    assert result['state']=='cancelled' and azure.deletes==1
    assert repo.read(user,pid)['process']['deletion_state']=='deleted'


def test_delete_failure_retains_obligation_and_retry_after(setup):
    user,pid,repo,_=setup
    service,azure,storage=prepare(setup)
    service.start(user,pid)
    p=repo.read(user,pid)['process']
    UploadService(repo,storage).cancel(user,pid,CancelProcess(expected_revision=p['revision']))
    azure.delete_error=OcrError('transient',retry_after=30)
    service.try_cleanup(user,pid)
    row=service._step(user,pid,'read')
    assert row['job']['deletion_state']=='retry_required'
    service.try_cleanup(user,pid);assert azure.deletes==1
    due(pid);azure.delete_error=None;service.try_cleanup(user,pid)
    assert service._step(user,pid,'read')['job']['deletion_state']=='deleted'


def test_ownership_and_backend_only_result_identifier(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    for actor in [seed(),seed('ejecutivo')]:
        with pytest.raises(DocumentError,match='not_found'):service.start(actor,pid)
        with pytest.raises(DocumentError,match='not_found'):service.poll(actor,pid)
    assert azure.begins==0
    with pytest.raises(RuntimeError):
        sql('SELECT * FROM document_ocr_jobs;',role='authenticated',owner=user)


@pytest.mark.parametrize('extra',[{'urlSource':'https://attacker.invalid'}, {'result_id':str(uuid4())},
                                  {'user_id':str(uuid4())}, {'consent_external_processing':False}])
def test_http_start_rejects_forged_parameters_and_requires_consent(api,extra):
    request,(user,pid,_,_)=api
    response=request('POST',f'/tracking/documents/sessions/{pid}/ocr/start',
        json={'consent_external_processing':True,**extra},headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==422 and 'attacker' not in response.text


def test_public_routes_only_return_safe_status_and_allow_cancellation(api,monkeypatch):
    request,(user,pid,repo,_)=api
    admit_upload(user,pid,repo)
    azure,storage=Azure(),Storage()
    monkeypatch.setattr('app.documents.ocr.AzureOcrClient',lambda:azure)
    monkeypatch.setattr('app.documents.ocr.TemporaryStorage',lambda repository:storage)
    # The cancel route's existing Storage port is isolated too.
    monkeypatch.setattr('app.documents.upload.TemporaryStorage',lambda repository:storage)
    headers={'Authorization':f'Bearer {user}'}
    response=request('POST',f'/tracking/documents/sessions/{pid}/ocr/start',
                     json={'consent_external_processing':True},headers=headers)
    assert response.status_code==202,response.text
    assert response.headers['cache-control']=='no-store'
    for forbidden in ['result_id','signedURL','token=','SYNTHETIC','storage_path']:
        assert forbidden not in response.text
    bad=request('POST',f'/tracking/documents/sessions/{pid}/ocr/poll',json={'result_id':azure.id},headers=headers)
    assert bad.status_code==422
    due(pid);azure.status='succeeded'
    polled=request('POST',f'/tracking/documents/sessions/{pid}/ocr/poll',json={},headers=headers)
    assert polled.status_code==200 and polled.json()['state']=='ocr_ready'
    read=request('GET',f'/tracking/documents/sessions/{pid}',headers=headers)
    assert read.status_code==200 and read.json()['state']=='ocr_ready'
    cancelled=request('POST',f'/tracking/documents/sessions/{pid}/cancel',
        json={'expected_revision':read.json()['revision']},headers=headers)
    assert cancelled.status_code==200 and cancelled.json()['state']=='cancelled'
    assert azure.deletes==1


def test_poll_transient_errors_are_bounded_and_do_not_resubmit(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    service.start(user,pid)
    azure.poll_error=OcrError('transient',retry_after=30)
    for index in range(5):
        due(pid);result=service.poll(user,pid)
        assert result['state']==('processing' if index<4 else 'processing_failed')
    assert azure.begins==1 and azure.polls==5 and azure.deletes==1


def test_expired_process_stops_polling_and_requests_both_deletions(setup):
    user,pid,repo,_=setup
    service,azure,storage=prepare(setup)
    service.start(user,pid)
    sql(f"UPDATE document_processes SET created_at=now()-interval '23 hours',expires_at=now()-interval '1 hour' WHERE id={lit(pid)};")
    result=service.poll(user,pid)
    assert result['state']=='expired' and azure.polls==0 and azure.deletes==1
    assert len(storage.paths)==1


def test_running_result_404_is_not_acknowledged_as_deleted(setup):
    user,pid,repo,_=setup
    service,azure,storage=prepare(setup)
    service.start(user,pid)
    process=repo.read(user,pid)['process']
    UploadService(repo,storage).cancel(user,pid,CancelProcess(expected_revision=process['revision']))
    azure.delete_error=OcrError('not_found')
    service.try_cleanup(user,pid)
    assert service._step(user,pid,'read')['job']['deletion_state']=='retry_required'


def test_two_concurrent_claims_allow_exactly_one_submission(setup):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    barrier=Barrier(2)
    def claim():
        barrier.wait()
        return service._step(user,pid,'start')
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:claim(),range(2)))
    assert sum(result['action']=='submit' for result in results)==1
    assert sql(f'SELECT submit_attempts FROM document_ocr_jobs WHERE process_id={lit(pid)};')=='1'
    assert azure.begins==0


def test_delete_404_after_local_failure_keeps_duty_for_reconciliation(setup):
    user,pid,repo,_=setup
    service,azure,_=prepare(setup)
    service.start(user,pid)
    azure.poll_error=OcrError('provider_failed');azure.delete_error=OcrError('not_found')
    due(pid)
    view=service.poll(user,pid)
    assert view['state']=='processing_failed'
    assert view['result_deletion_state']=='retry_required'
    assert repo.read(user,pid)['process']['deletion_state']=='deleted'
