"""T8: real PostgreSQL claims/leases with synthetic provider deletion ports."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
from uuid import uuid4

import pytest

from app.documents.cleanup import DocumentCleanupService, RUN_BUDGET
from app.documents.config import REVIEW_LIFETIME, MAX_RETENTION
from app.documents.azure import OcrError
from app.documents.contracts import CancelProcess, DocumentError
from app.documents.service import DocumentService
from app.documents.upload import UploadService
from test_persistence import setup, api, sql, lit, admit_upload, pytestmark
from test_ocr import prepare
from test_score_update import confirmed


class TargetRepository:
    """Restrict only candidate discovery so tests don't consume other tests' duties."""
    def __init__(self, repo, ids): self.repo, self.ids = repo, ids
    def rpc(self, name, payload, **kwargs):
        if payload['p_action'] == 'list':
            return [{'process_id': pid, 'kind': kind} for pid in self.ids for kind in ('storage','azure','purge')]
        return self.repo.rpc(name, payload, **kwargs)


class Storage:
    def __init__(self): self.fail=False; self.calls=[]; self.callback=None
    def delete(self, path, **kwargs):
        self.calls.append(path)
        if self.callback: self.callback()
        if self.fail: raise DocumentError('storage_unavailable')
        sql(f"DELETE FROM storage.objects WHERE bucket_id='hu23-document-temporary' AND name={lit(path)};")


class Azure:
    def __init__(self): self.error=None; self.calls=[]; self.status=None; self.probes=0
    def delete(self, rid):
        self.calls.append(rid)
        if self.error: raise self.error
    def probe(self, rid): self.probes+=1; return self.status, 2


def worker(setup):
    user,pid,repo,_=setup
    storage,azure=Storage(),Azure()
    return DocumentCleanupService(TargetRepository(repo,[pid]),storage=storage,azure=azure),storage,azure


def expire(pid, hours=21):
    sql(f"UPDATE document_processes SET created_at=now()-interval '{hours} hours',expires_at=now()-interval '1 hour' WHERE id={lit(pid)};")


def state(pid):
    return json.loads(sql(f'SELECT to_jsonb(d) FROM document_processes d WHERE id={lit(pid)};'))


def retry_due(pid):
    sql(f"UPDATE document_processes SET storage_delete_after=now()-interval '1 second' WHERE id={lit(pid)}; "
        f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)};")


def test_abandoned_no_upload_expires_and_repeated_cleanup_is_safe(setup):
    user,pid,repo,_=setup; expire(pid)
    service,storage,_=worker(setup)
    result=service.run()
    assert result['storage_deleted']==1 and len(storage.calls)==1 # Reserved identity; API missing is idempotent.
    assert state(pid)['state']=='expired' and state(pid)['deletion_state']=='deleted'
    assert service.run()['storage_deleted']==0
    assert repo.read(user,pid)['candidates']==[]


def test_original_storage_failure_retry_backoff_then_success(setup):
    user,pid,repo,_=setup; admit_upload(user,pid,repo); expire(pid)
    service,storage,_=worker(setup); storage.fail=True
    assert service.run()['retried']==1
    assert state(pid)['deletion_state']=='retry_required'
    assert service.run()['attempted']==0 # Backoff is durable.
    storage.fail=False; retry_due(pid)
    assert service.run()['storage_deleted']==1
    assert state(pid)['storage_path'] is None


def test_lost_storage_lease_recovers_and_fences_old_ack(setup):
    user,pid,repo,docs=setup; admit_upload(user,pid,repo)
    docs.cancel(user,pid,CancelProcess(expected_revision=1))
    r=repo.rpc('hu23_cleanup',{'p_action':'begin'}); run=r['token']
    args={'p_action':'claim','p_run':run,'p_process':pid,'p_kind':'storage'}
    first=repo.rpc('hu23_cleanup',args)
    assert repo.rpc('hu23_cleanup',args) is None
    sql(f"UPDATE document_processes SET storage_delete_lease_until=now()-interval '1 second' WHERE id={lit(pid)};")
    second=repo.rpc('hu23_cleanup',args)
    assert first['token']!=second['token']
    assert repo.rpc('hu23_cleanup',{'p_action':'settle','p_run':run,'p_process':pid,'p_kind':'storage','p_token':first['token'],'p_payload':{'outcome':'deleted'}}) is None
    # Provider acknowledgement while metadata still exists must NOT claim deleted.
    result=repo.rpc('hu23_cleanup',{'p_action':'settle','p_run':run,'p_process':pid,'p_kind':'storage','p_token':second['token'],'p_payload':{'outcome':'deleted'}})
    assert result['outcome']=='retry_required'
    repo.rpc('hu23_cleanup',{'p_action':'finish','p_run':run})


def test_global_concurrency_and_stale_run_recovery(setup):
    repo=setup[2]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:repo.rpc('hu23_cleanup',{'p_action':'begin'}),range(2)))
    assert sum(bool(r.get('busy')) for r in results)==1
    winner=next(r['token'] for r in results if 'token' in r)
    sql("UPDATE document_cleanup_control SET lease_until=now()-interval '1 second';")
    newer=repo.rpc('hu23_cleanup',{'p_action':'begin'})['token']
    assert newer!=winner
    assert repo.rpc('hu23_cleanup',{'p_action':'finish','p_run':winner}) is None
    repo.rpc('hu23_cleanup',{'p_action':'finish','p_run':newer})


def azure_pending(setup):
    user,pid,repo,docs=setup
    ocr,_,_=prepare(setup); ocr.start(user,pid)
    view=docs.read(user,pid); docs.cancel(user,pid,CancelProcess(expected_revision=view['revision']))
    retry_due(pid)


@pytest.mark.parametrize('error',[None,OcrError('transient',retry_after=3600),OcrError('not_found')])
def test_azure_deletion_retry_and_404_probe(setup,error):
    user,pid,repo,_=setup; azure_pending(setup)
    service,_,azure=worker(setup); azure.error=error
    report=service.run()
    job=json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)};'))
    assert report['storage_deleted']==1
    if error is None:
        assert job['deletion_state']=='deleted'
    else:
        assert job['deletion_state']=='retry_required'
        assert service.run()['azure_deleted']==0
        retry_due(pid); azure.error=None
        assert service.run()['azure_deleted']==1
        assert azure.probes==(1 if error.code=='not_found' else 0)


def test_running_azure_probe_never_drops_duty(setup):
    pid=setup[1]; azure_pending(setup)
    service,_,azure=worker(setup); azure.error=OcrError('not_found'); service.run()
    retry_due(pid); azure.status='running'
    assert service.run()['retried']==1
    retry_due(pid); azure.status='succeeded'; service.run()
    retry_due(pid); azure.error=None
    assert service.run()['azure_deleted']==1 and len(azure.calls)==2


def test_azure_outage_does_not_block_storage_and_failed_storage_does_not_block_azure(setup):
    pid=setup[1]; azure_pending(setup)
    service,storage,azure=worker(setup); storage.fail=True
    result=service.run()
    assert result['retried']==1 and result['azure_deleted']==1
    assert state(pid)['deletion_state']=='retry_required'


def test_unknown_submit_preserves_token_for_late_202_and_closes_process(setup):
    user,pid,repo,_=setup; ocr,azure,_=prepare(setup)
    claim=ocr._step(user,pid,'start')
    token=claim['job']['lease_token']
    sql(f"UPDATE document_ocr_jobs SET lease_until=now()-interval '1 second' WHERE process_id={lit(pid)};")
    service,_,_=worker(setup)
    assert service.run()['unresolved']==1
    assert state(pid)['state']=='processing_failed'
    job=json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)};'))
    assert job['lease_token']==token and job['result_id'] is None and job['job_state']=='submission_unknown'
    ocr._step(user,pid,'settle',token,{'outcome':'started','result_id':azure.id,'retry_after':2})
    retry_due(pid)
    assert service.run()['azure_deleted']==1


def test_confirmed_evidence_and_history_survive_and_temporaries_are_purged(setup):
    user,pid,repo,_,_=confirmed(setup)
    evidence=sql(f'SELECT to_jsonb(e) FROM document_field_evidence e WHERE process_id={lit(pid)};')
    tracking=repo.load_tracking(user)
    expire(pid,25) # Closed process must stay confirmed.
    sql(f"UPDATE document_uploads SET authorized_at=now()-interval '26 hours',upload_expires_at=now()-interval '25 hours',reconcile_until=now()-interval '24 hours' WHERE process_id={lit(pid)}; "
        f"UPDATE document_ocr_jobs SET deleted_at=now()-interval '2 hours' WHERE process_id={lit(pid)};")
    service,_,_=worker(setup); assert service.run()['purged']==1
    assert state(pid)['state']=='confirmed'
    assert evidence==sql(f'SELECT to_jsonb(e) FROM document_field_evidence e WHERE process_id={lit(pid)};')
    assert tracking==repo.load_tracking(user)
    assert sql(f'SELECT count(*) FROM document_uploads WHERE process_id={lit(pid)};')=='0'
    assert sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(pid)};')=='0'


def test_cleanup_does_not_require_owner_still_having_usuario_role(setup):
    user,pid,repo,_=setup; admit_upload(user,pid,repo); expire(pid)
    sql(f"UPDATE profiles SET role='ejecutivo' WHERE id={lit(user)};")
    assert worker(setup)[0].run()['storage_deleted']==1


def test_budget_stops_claiming_and_releases_global_run(setup):
    service,_,_=worker(setup)
    ticks=iter([0, RUN_BUDGET])
    service.clock=lambda:next(ticks)
    assert service.run()['budget_exhausted']
    assert sql('SELECT lease_token is null FROM document_cleanup_control;')=='t'


def test_candidate_discovery_includes_expired_and_is_bounded(setup):
    pid=setup[1]; expire(pid); repo=setup[2]
    run=repo.rpc('hu23_cleanup',{'p_action':'begin'})['token']
    rows=repo.rpc('hu23_cleanup',{'p_action':'list','p_run':run,'p_limit':100})
    assert len(rows)<=100 and {'process_id':pid,'kind':'storage'} in rows
    repo.rpc('hu23_cleanup',{'p_action':'finish','p_run':run})


def test_database_enforces_twenty_hour_deadline(setup):
    pid=setup[1]
    sql(f"UPDATE document_processes SET expires_at=created_at+interval '23 hours' WHERE id={lit(pid)};")
    assert sql(f"SELECT expires_at=created_at+interval '20 hours' FROM document_processes WHERE id={lit(pid)};")=='t'
    assert REVIEW_LIFETIME+timedelta(hours=3,seconds=RUN_BUDGET)<MAX_RETENTION


def test_one_rpc_failure_does_not_abort_other_resource(setup):
    azure_pending(setup)
    service,_,_=worker(setup)
    original=service.repository.rpc
    def rpc(name,payload,**kwargs):
        if payload['p_action']=='claim' and payload.get('p_kind')=='storage':
            raise DocumentError('persistence_unavailable')
        return original(name,payload,**kwargs)
    service.repository.rpc=rpc
    result=service.run()
    assert result['failed']==1 and result['azure_deleted']==1
    assert sql('SELECT lease_token is null FROM document_cleanup_control;')=='t'


def test_metrics_report_overdue_original_without_financial_payload(setup):
    pid=setup[1];admit_upload(setup[0],pid,setup[2]);expire(pid,25)
    sql(f"BEGIN; ALTER TABLE storage.objects DISABLE TRIGGER hu23_storage_object_guard; "
        f"UPDATE storage.objects SET created_at=now()-interval '25 hours' WHERE name=(SELECT storage_path FROM document_uploads WHERE process_id={lit(pid)}); "
        "ALTER TABLE storage.objects ENABLE TRIGGER hu23_storage_object_guard; COMMIT;")
    service,storage,_=worker(setup);storage.fail=True
    result=service.run()
    assert result['overdue_originals']>=1 and result['pending_originals']>=1
    assert not any(key in json.dumps(result) for key in ('storage_path','signedURL','result_id','ingreso_mensual'))
