"""T2: real PostgreSQL Storage metadata/RLS; no remote service or binary server."""
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.documents.config import MAX_DOCUMENT_BYTES, MAX_PDF_PAGES, TEMPORARY_BUCKET, UPLOAD_LIFETIME
from app.documents.contracts import AuthorizeUpload, CancelProcess, CompleteUpload, DocumentError
from app.documents.upload import UploadService
from test_persistence import api, setup, sql, lit, seed, pytestmark


def command(**overrides):
    return AuthorizeUpload(expected_revision=0,extension='pdf',content_type='application/pdf',client_pages=1,**overrides)


class FakeStorage:
    def __init__(self,fail=False):self.paths=[];self.fail=fail
    def delete(self,path):
        self.paths.append(path)
        if self.fail:raise DocumentError('storage_unavailable')
        sql(f"DELETE FROM storage.objects WHERE bucket_id={lit(TEMPORARY_BUCKET)} AND name={lit(path)};")


def authorized(setup):
    user,pid,repo,_=setup
    storage=FakeStorage();uploads=UploadService(repo,storage)
    grant=uploads.authorize(user,pid,command())
    return uploads,storage,grant


def put(user,grant,size=100,mime='application/pdf',role=None,operation='storage.object.upload'):
    return sql(f"SELECT set_config('storage.operation',{lit(operation)},false); INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) "
               f"VALUES({lit(grant['bucket'])},{lit(grant['path'])},{lit(user)},{lit({'size':size,'mimetype':mime})});",role=role,owner=user if role else None)


def test_authorization_path_is_server_owned_short_and_opaque(setup):
    user,pid,repo,_=setup
    uploads,_,grant=authorized(setup)
    parts=grant['path'].split('/')
    assert parts[:2]==[user,pid] and parts[2].endswith('.pdf')
    UUID(parts[2].split('.')[0])
    assert grant['authorization']=='authenticated' and 'token' not in grant
    assert datetime.fromisoformat(grant['expires_at']) <= datetime.now(timezone.utc)+UPLOAD_LIFETIME
    assert uploads.authorize(user,pid,command())==grant
    assert sql(f'SELECT count(*) FROM document_uploads WHERE process_id={lit(pid)};')=='1'
    configured=repo.rpc('hu23_upload_limits',{})
    assert configured['max_bytes']==MAX_DOCUMENT_BYTES and configured['max_pdf_pages']==MAX_PDF_PAGES
    assert configured['lease_seconds']==UPLOAD_LIFETIME.total_seconds()


def test_successful_finalize_idempotence_and_no_scoring(setup,monkeypatch):
    user,pid,repo,documents=setup
    uploads,_,grant=authorized(setup)
    before=repo.load_tracking(user)
    def forbidden(*a,**k):raise AssertionError('upload called scorer')
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    put(user,grant,role='authenticated')
    with pytest.raises(DocumentError,match='upload_already_exists'):
        uploads.authorize(user,pid,command())
    ready=uploads.complete(user,pid,CompleteUpload(expected_revision=0))
    assert ready['state']=='ready' and ready['revision']==1
    assert uploads.complete(user,pid,CompleteUpload(expected_revision=0))==ready
    documents.start_processing(user,pid,1)
    assert repo.load_tracking(user)==before
    with pytest.raises(DocumentError,match='invalid_transition'):
        uploads.authorize(user,pid,command())


@pytest.mark.parametrize('size,mime',[(0,'application/pdf'),(4000001,'application/pdf'),(100,'text/html'),('fake','application/pdf')])
def test_invalid_metadata_closes_attempt_and_removes_original(setup,size,mime):
    user,pid,repo,_=setup
    uploads,storage,grant=authorized(setup)
    before=repo.load_tracking(user)
    put(user,grant,size=size,mime=mime)
    with pytest.raises(DocumentError,match='upload_invalid_metadata'):
        uploads.complete(user,pid,CompleteUpload(expected_revision=0))
    closed=repo.read(user,pid)
    assert closed['process']['state']=='processing_failed'
    assert closed['process']['deletion_state']=='deleted'
    assert closed['evidence']==[] and repo.load_tracking(user)==before
    assert storage.paths==[grant['path']]
    assert sql(f'SELECT count(*) FROM storage.objects WHERE name={lit(grant["path"])};')=='0'
    assert sql(f'SELECT storage_path FROM document_uploads WHERE process_id={lit(pid)};')==grant['path']


def test_missing_object_is_not_ready_and_retry_requires_new_session(setup):
    user,pid,repo,documents=setup
    uploads,_,grant=authorized(setup)
    with pytest.raises(DocumentError,match='upload_object_missing'):
        uploads.complete(user,pid,CompleteUpload(expected_revision=0))
    assert repo.read(user,pid)['process']['state']=='processing_failed'
    with pytest.raises(DocumentError,match='invalid_transition'):
        uploads.authorize(user,pid,command())
    from app.documents.contracts import CreateProcess
    new=documents.create(user,CreateProcess(document_type='liquidacion_sueldo'))
    assert uploads.authorize(user,new['id'],command())['path']!=grant['path']


def test_retry_without_object_reuses_identity_and_renews_only_expired_lease(setup):
    user,pid,repo,_=setup
    uploads,_,grant=authorized(setup)
    sql(f"UPDATE document_uploads SET authorized_at=now()-interval '20 minutes',upload_expires_at=now()-interval '10 minutes' WHERE process_id={lit(pid)};")
    retry=uploads.authorize(user,pid,command())
    assert retry['path']==grant['path']
    assert sql(f'SELECT count(*) FROM document_uploads WHERE process_id={lit(pid)};')=='1'
    other=AuthorizeUpload(expected_revision=0,extension='png',content_type='image/png',client_pages=1)
    with pytest.raises(DocumentError,match='upload_format_locked'):
        uploads.authorize(user,pid,other)


def test_only_owner_may_authorize_or_finalize(setup):
    user,pid,repo,_=setup
    uploads,_,_=authorized(setup)
    for actor in [seed(),seed('ejecutivo'),seed('admin_inmobiliario')]:
        with pytest.raises(DocumentError,match='not_found'):uploads.authorize(actor,pid,command())
        with pytest.raises(DocumentError,match='not_found'):uploads.complete(actor,pid,CompleteUpload(expected_revision=0))


def test_storage_guards_deny_listing_read_overwrite_and_other_paths_even_with_broad_policy(setup):
    user,pid,repo,_=setup
    uploads,_,grant=authorized(setup)
    # Exercise capability conversion while this exact empty path is otherwise uploadable.
    with pytest.raises((RuntimeError,DocumentError)):
        put(user,grant,role='authenticated',operation='storage.object.sign_upload_url')
    for actor in [seed(),seed('ejecutivo')]:
        with pytest.raises((RuntimeError,DocumentError)):
            put(actor,grant,role='authenticated')
    put(user,grant,role='authenticated')
    for actor in [user,seed(),seed('ejecutivo')]:
        assert sql(f'SELECT count(*) FROM storage.objects WHERE bucket_id={lit(grant["bucket"])};',role='authenticated',owner=actor)=='0'
    assert sql(f'SELECT count(*) FROM storage.objects WHERE bucket_id={lit(grant["bucket"])};',role='anon')=='0'
    for bad in ['../arbitrary.pdf',f'{user}/{pid}/{uuid4()}.pdf']:
        with pytest.raises((RuntimeError,DocumentError)):
            put(user,{**grant,'path':bad},role='authenticated')
    with pytest.raises((RuntimeError,DocumentError)):
        put(seed(),grant,role='authenticated')
    with pytest.raises(RuntimeError,match='hu23_no_overwrite'):
        sql(f"UPDATE storage.objects SET metadata='{{\"size\":999,\"mimetype\":\"application/pdf\"}}' WHERE name={lit(grant['path'])};")
    sql(f'DELETE FROM storage.objects WHERE name={lit(grant["path"])};',role='authenticated',owner=user)
    assert sql(f'SELECT count(*) FROM storage.objects WHERE name={lit(grant["path"])};')=='1'
    assert sql(f'SELECT count(*) FROM storage.objects WHERE name={lit(grant["path"])};',role='service_role')=='1'


def test_closed_cancelled_expired_and_ready_processes_cannot_upload(setup):
    user,pid,repo,documents=setup
    uploads,storage,grant=authorized(setup)
    uploads.cancel(user,pid,CancelProcess(expected_revision=0))
    assert storage.paths==[grant['path']]
    with pytest.raises(DocumentError,match='invalid_transition'):uploads.authorize(user,pid,command())
    with pytest.raises((DocumentError,RuntimeError)):
        put(user,grant) # even privileged Storage metadata commit is blocked after cancel
    from app.documents.contracts import CreateProcess
    newer=documents.create(user,CreateProcess(document_type='liquidacion_sueldo'))['id']
    sql(f"UPDATE document_processes SET created_at=now()-interval '23 hours',expires_at=now()-interval '1 hour' WHERE id={lit(newer)};")
    with pytest.raises(DocumentError,match='expired'):
        uploads.authorize(user,newer,command())
    p=repo.read(user,newer)['process']
    assert p['state']=='expired' and p['deletion_state']=='deleted'


def test_cancel_remains_committed_when_physical_delete_fails(setup):
    user,pid,repo,_=setup
    uploads,_,grant=authorized(setup);put(user,grant)
    storage=FakeStorage(fail=True)
    closed=UploadService(repo,storage).cancel(user,pid,CancelProcess(expected_revision=0))
    assert closed['state']=='cancelled' and closed['deletion_state']=='retry_required'
    assert sql(f'SELECT count(*) FROM storage.objects WHERE name={lit(grant["path"])};')=='1'
    UploadService(repo,FakeStorage()).try_cleanup(user,pid)
    assert repo.read(user,pid)['process']['deletion_state']=='deleted'


def test_no_ready_or_processing_without_verified_storage(setup):
    user,pid,repo,documents=setup
    with pytest.raises(DocumentError,match='upload_not_verified'):
        documents.mark_ready(user,pid,0)
    with pytest.raises(DocumentError,match='invalid_transition'):
        documents.start_processing(user,pid,0)


@pytest.mark.parametrize('extra',[{'path':'../x.pdf'},{'user_id':'forged'},{'size':1},{'document_type':'documento_laboral'}])
def test_http_authorization_rejects_client_authoritative_metadata(api,extra):
    request,(user,pid,_,_)=api
    response=request('POST',f'/tracking/documents/sessions/{pid}/upload',json={**command().model_dump(mode='json'),**extra},headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==422 and 'forged' not in response.text


def test_http_upload_and_complete_do_not_expose_original_or_require_binary(api):
    request,(user,pid,repo,_)=api
    headers={'Authorization':f'Bearer {user}'}
    auth=request('POST',f'/tracking/documents/sessions/{pid}/upload',json=command().model_dump(mode='json'),headers=headers)
    assert auth.status_code==200,auth.text
    assert auth.headers['cache-control']=='no-store'
    put(user,auth.json())
    ready=request('POST',f'/tracking/documents/sessions/{pid}/upload/complete',json={'expected_revision':0},headers=headers)
    assert ready.status_code==200 and ready.json()['state']=='ready'
    assert 'storage_path' not in ready.json()
    assert 'service_role' not in auth.text and 'token' not in auth.json()


def test_cleanup_does_not_acknowledge_deletion_while_object_remains(setup):
    user,pid,repo,_=setup
    uploads,_,grant=authorized(setup);put(user,grant)
    # A misleading/missing Storage response must not erase the database obligation.
    from types import SimpleNamespace
    closed=UploadService(repo,SimpleNamespace(delete=lambda path: None)).cancel(user,pid,CancelProcess(expected_revision=0))
    assert closed['state']=='cancelled' and closed['deletion_state']=='retry_required'
    assert sql(f'SELECT count(*) FROM storage.objects WHERE name={lit(grant["path"])};')=='1'


def test_finalize_after_lease_expiry_closes_and_cleans_attempt(setup):
    user,pid,repo,_=setup
    uploads,storage,grant=authorized(setup);put(user,grant)
    sql(f"UPDATE document_uploads SET authorized_at=now()-interval '20 minutes',upload_expires_at=now()-interval '10 minutes' WHERE process_id={lit(pid)};")
    with pytest.raises(DocumentError,match='upload_authorization_expired'):
        uploads.complete(user,pid,CompleteUpload(expected_revision=0))
    closed=repo.read(user,pid)['process']
    assert closed['state']=='processing_failed' and closed['deletion_state']=='deleted'
    assert storage.paths==[grant['path']]
