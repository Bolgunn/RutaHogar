"""T4 consumption against PostgreSQL, with Azure/Storage synthetic ports."""
from copy import deepcopy
from datetime import datetime
from uuid import uuid4

import pytest

from app.documents.azure import OcrError, Recognition
from app.documents.contracts import CancelProcess, CreateProcess, DocumentError
from app.documents.ocr import OcrService
from app.documents.parsing import ParsingService
from app.documents.upload import UploadService
from test_parsers import fixture
from test_persistence import setup, api, sql, lit, seed, admit_upload, pytestmark
from test_ocr import Azure, Storage, due


class FixtureAzure(Azure):
    def __init__(self,source):
        super().__init__();self.source=source;self.status='succeeded';self.before_delete=None
    def poll(self,result_id):
        assert result_id==self.id
        self.polls+=1
        if self.on_poll:self.on_poll()
        if self.poll_error:raise self.poll_error
        return Recognition(status=self.status,analyzeResult=deepcopy(self.source)),2
    def delete(self,result_id):
        if self.before_delete:self.before_delete()
        super().delete(result_id)


def prepared(setup,name='payslip',kind='liquidacion_sueldo'):
    user,pid,repo,documents=setup
    if kind!='liquidacion_sueldo':
        pid=documents.create(user,CreateProcess(document_type=kind))['id']
    admit_upload(user,pid,repo)
    azure,storage=FixtureAzure(fixture(name)),Storage()
    ocr=OcrService(repo,azure=azure,storage=storage)
    ocr.start(user,pid);due(pid);ocr.poll(user,pid);due(pid)
    return user,pid,repo,ParsingService(repo,ocr=ocr),azure,storage


@pytest.mark.parametrize('name,kind,expected',[
    ('payslip','liquidacion_sueldo',{'ingreso_mensual':1200000}),
    ('savings','certificado_ahorro',{'ahorro_disponible':4000000}),
    ('employment','documento_laboral',{'tipo_contrato':'indefinido','continuidad_laboral':'entre_1_y_3_anios'}),
])
def test_consume_persists_only_temporary_candidates_then_deletes_azure(setup,name,kind,expected,monkeypatch):
    user,pid,repo,service,azure,storage=prepared(setup,name,kind)
    before=repo.load_tracking(user)
    def forbidden(*a,**k):raise AssertionError('parser invoked financial mutation/scoring')
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.resolve_tracking_market_snapshot',forbidden)
    def verify_atomic_commit_before_deletion():
        bundle=repo.read(user,pid)
        assert bundle['process']['state']=='awaiting_review'
        assert {c['field']:c['detected_value'] for c in bundle['candidates']}==expected
    azure.before_delete=verify_atomic_commit_before_deletion
    view=service.consume(user,pid)
    assert view['state']=='awaiting_review' and azure.deletes==1
    assert {c['field']:c['detected_value'] for c in view['candidates']}==expected
    assert view['evidence']==[] and view['tracking_event_id'] is None
    assert view['deletion_state']=='not_requested' and storage.paths==[] # Original remains until T5.
    assert repo.load_tracking(user)==before
    assert service.ocr._step(user,pid,'read')['job']['deletion_state']=='deleted'
    text=sql(f"SELECT (SELECT to_jsonb(p) FROM document_processes p WHERE id={lit(pid)})::text || "
             f"(SELECT jsonb_agg(to_jsonb(c)) FROM document_candidates c WHERE process_id={lit(pid)})::text || "
             f"(SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)})::text;")
    for forbidden in ['PERSONA_','DIRECCION_','CUENTA_','Total haberes','Renta imponible','content','signedURL']:
        assert forbidden not in text
    calls=azure.polls
    assert service.consume(user,pid)==view
    assert azure.polls==calls and azure.deletes==1


def test_historical_comparison_is_stored_without_final_backing_or_financial_update(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    result=service.consume(user,pid)
    assert result['candidates'][0]['comparison']=='difference' # Baseline 1M; detected 1.2M.
    assert result['candidates'][0]['declared_value']==1000000
    assert result['evidence']==[]
    assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(pid)};')=='0'


def test_match_is_exact_and_remains_unconfirmed(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    azure.source={'content':'Líquido a pagar: $1.000.000','pages':[{'pageNumber':1}]}
    result=service.consume(user,pid)
    assert result['candidates'][0]['comparison']=='match' and result['evidence']==[]


def test_ambiguity_discards_alternative_values_and_missing_field_is_insufficient(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    azure.source={'content':'Líquido a pagar: $1234567\nLíquido a pagar: $2345678','pages':[{'pageNumber':1}]}
    row=service.consume(user,pid)['candidates'][0]
    assert row['detection']=='ambiguous' and row['detected_value'] is None and row['comparison']=='insufficient'
    persisted=sql(f'SELECT jsonb_agg(to_jsonb(c)) FROM document_candidates c WHERE process_id={lit(pid)};')
    assert '1234567' not in persisted and '2345678' not in persisted


def test_delete_failure_preserves_candidates_and_retry_obligation(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    azure.delete_error=OcrError('transient',retry_after=30)
    first=service.consume(user,pid)
    assert first['state']=='awaiting_review'
    assert service.ocr._step(user,pid,'read')['job']['deletion_state']=='retry_required'
    calls=azure.polls
    service.consume(user,pid)
    assert azure.deletes==1 and azure.polls==calls
    due(pid);azure.delete_error=None;service.consume(user,pid)
    assert azure.deletes==2 and azure.polls==calls


def test_cancellation_during_fetch_never_persists_candidates(setup):
    user,pid,repo,service,azure,storage=prepared(setup)
    def cancel():
        process=repo.read(user,pid)['process']
        UploadService(repo,storage).cancel(user,pid,CancelProcess(expected_revision=process['revision']))
    azure.on_poll=cancel
    result=service.consume(user,pid)
    assert result['state']=='cancelled' and result['candidates']==[]
    assert azure.deletes==1 and result['deletion_state']=='deleted'


def test_provider_retry_after_preserves_ocr_ready_and_prevents_repeated_fetch(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    azure.poll_error=OcrError('transient',retry_after=30)
    assert service.consume(user,pid)['state']=='ocr_ready'
    calls=azure.polls
    service.consume(user,pid)
    assert azure.polls==calls and repo.read(user,pid)['candidates']==[]
    due(pid);azure.poll_error=None
    assert service.consume(user,pid)['state']=='awaiting_review'


def test_malformed_layout_fails_redacted_without_candidates(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    azure.source={'content':'SENSITIVE_SYNTHETIC_NO_LOG','pages':[{'pageNumber':99}]}
    result=service.consume(user,pid)
    assert result['state']=='processing_failed' and result['candidates']==[] and azure.deletes==1


def test_claim_ownership_and_fencing_protect_concurrent_consumers(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    for actor in [seed(),seed('ejecutivo')]:
        with pytest.raises(DocumentError,match='not_found'):service.consume(actor,pid)
    first=service._control(user,pid,'claim')
    assert first['claimed'] and not service._control(user,pid,'claim')['claimed']
    assert service.consume(user,pid)['state']=='ocr_ready'
    with pytest.raises(DocumentError,match='stale_review'):
        service._control(user,pid,'release',str(uuid4()))
    service._control(user,pid,'release',first['job']['lease_token'])
    assert service.consume(user,pid)['state']=='awaiting_review'


def test_consumption_after_expiry_performs_cleanup_without_fetch(setup):
    user,pid,repo,service,azure,storage=prepared(setup)
    sql(f"UPDATE document_processes SET created_at=now()-interval '23 hours',expires_at=now()-interval '1 hour' WHERE id={lit(pid)};")
    calls=azure.polls
    result=service.consume(user,pid)
    assert result['state']=='expired' and azure.polls==calls and azure.deletes==1


def test_atomic_failure_does_not_create_partial_candidates_or_lose_ocr(setup):
    user,pid,repo,service,azure,_=prepared(setup)
    claimed=service._control(user,pid,'claim')
    p=claimed['process']
    payload={'document_type':'liquidacion_sueldo','parser_version':'test','normalizer_version':'test',
             'parse_token':claimed['job']['lease_token'],'candidates':[
                 {'field':'ingreso_mensual','detection':'detected','value':1200000,'declared_value':1000000,'comparison':'difference','page':1},
                 {'field':'ahorro_disponible','detection':'detected','value':100,'comparison':'difference','page':1}]}
    with pytest.raises(RuntimeError,match='document_candidates_check'):
        repo.lifecycle(user,pid,p['revision'],'result',payload)
    assert repo.read(user,pid)['process']['state']=='ocr_ready'
    assert repo.read(user,pid)['candidates']==[]
    assert service.ocr._step(user,pid,'read')['job']['deletion_state']=='not_requested'
    assert azure.deletes==0


@pytest.mark.parametrize('extra',[{'ocr_text':'FORGED'}, {'result_id':str(uuid4())},
                                  {'candidates':[]}, {'user_id':str(uuid4())}])
def test_public_parse_rejects_client_ocr_and_candidates(api,extra):
    request,(user,pid,_,_)=api
    response=request('POST',f'/tracking/documents/sessions/{pid}/parse',json=extra,
                     headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==422 and 'FORGED' not in response.text


def test_public_parse_returns_only_safe_review_values(api,monkeypatch):
    request,setup=api
    user,pid,repo,service,azure,_=prepared(setup)
    monkeypatch.setattr('app.documents.routes.ParsingService',lambda repository:service)
    response=request('POST',f'/tracking/documents/sessions/{pid}/parse',json={},
                     headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==202,response.text
    assert response.json()['state']=='awaiting_review' and response.headers['cache-control']=='no-store'
    for forbidden in ['PERSONA_','DIRECCION_','CUENTA_','analyzeResult','result_id','parse_token']:
        assert forbidden not in response.text


def test_lost_commit_ack_is_recovered_without_refetch_or_lost_cleanup(setup,monkeypatch):
    user,pid,repo,service,azure,_=prepared(setup)
    real=repo.lifecycle
    def uncertain(*args,**kwargs):
        result=real(*args,**kwargs)
        if args[3]=='result':raise DocumentError('persistence_unavailable')
        return result
    monkeypatch.setattr(repo,'lifecycle',uncertain)
    with pytest.raises(DocumentError,match='persistence_unavailable'):service.consume(user,pid)
    assert repo.read(user,pid)['process']['state']=='awaiting_review'
    assert service.ocr._step(user,pid,'read')['job']['deletion_state']=='delete_pending'
    assert azure.deletes==0
    calls=azure.polls
    monkeypatch.setattr(repo,'lifecycle',real)
    assert service.consume(user,pid)['state']=='awaiting_review'
    assert azure.polls==calls and azure.deletes==1
