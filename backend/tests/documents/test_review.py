"""Explicit owner decisions using T4 candidates and real PostgreSQL/HU13."""
from uuid import uuid4
import pytest

from app.documents.contracts import CancelProcess, ConfirmProcess, DocumentError
from app.documents.service import DocumentService
from app.documents.tracking_adapter import current_declaration
from app.documents.upload import UploadService
from test_parsing import prepared
from test_persistence import setup, api, sql, lit, seed, pytestmark


def command(view, choices=None):
    return ConfirmProcess(request_id=uuid4(),expected_revision=view['revision'],confirmed=True,
        decisions=[{'field':row['field'],'decision':(choices or {}).get(row['field'],'keep_declared')}
                   for row in view['candidates'] if row['detection']=='detected' and row['comparison']!='insufficient'])


@pytest.mark.parametrize('value,decision,backing,events',[
    ('$1.000.000','keep_declared','respaldado',0),
    ('$1.200.000','accept_detected','respaldado',1),
    ('$1.200.000','keep_declared','con_diferencia',0),
])
def test_review_confirmation_preserves_history_and_never_scores(setup,monkeypatch,value,decision,backing,events):
    user,pid,repo,parser,azure,storage=prepared(setup)
    azure.source={'content':'Líquido a pagar: '+value,'pages':[{'pageNumber':1}]}
    view=parser.consume(user,pid)
    before=repo.load_tracking(user)
    def forbidden(*a,**k):raise AssertionError('confirmation invoked scorer/market/general execute')
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.score_snapshot',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.resolve_tracking_market_snapshot',forbidden)
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    real=repo.confirm;captured=[]
    def capture(*args):
        captured.append(args[-1]);return real(*args)
    monkeypatch.setattr(repo,'confirm',capture)
    uploads=UploadService(repo,storage)
    confirmed=uploads.confirm(user,pid,command(view,{'ingreso_mensual':decision}))
    after=repo.load_tracking(user)
    assert len(after['events'])==len(before['events'])+events
    assert after['evaluations']==before['evaluations'] and after['plan']==before['plan']
    assert after['events'][:len(before['events'])]==before['events']
    assert confirmed['candidates']==[] and confirmed['deletion_state']=='deleted'
    assert confirmed['evidence'][0]['current_backing']==backing
    assert confirmed['evidence'][0]['comparison']==('match' if events==0 and value=='$1.000.000' else 'difference')
    assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)};')=='0'
    if events:
        assert captured[0]['records']['evaluations']==[]
        assert captured[0]['records']['events'][0]['evaluation_id'] is None
        assert after['events'][-1]['evaluation_id'] is None
        assert current_declaration(after,user)['ingreso_mensual']==1200000
    else:
        assert captured[0] is None
        assert current_declaration(after,user)['ingreso_mensual']==1000000


def test_multiple_employment_decisions_are_complete_and_applied_per_field(setup):
    user,pid,repo,parser,azure,storage=prepared(setup,'employment','documento_laboral')
    azure.source['pages'][0]['lines'][2]['content']='Tipo de contrato: plazo fijo'
    view=parser.consume(user,pid)
    service=DocumentService(repo)
    full=command(view,{'tipo_contrato':'keep_declared','continuidad_laboral':'accept_detected'})
    partial=full.model_copy(update={'decisions':full.decisions[:1]})
    with pytest.raises(DocumentError,match='invalid_decision'):service.confirm(user,pid,partial)
    assert service.read(user,pid)['state']=='awaiting_review'
    confirmed=service.confirm(user,pid,full)
    evidence={row['field']:row for row in confirmed['evidence']}
    assert evidence['tipo_contrato']['current_backing']=='con_diferencia'
    assert evidence['continuidad_laboral']['current_backing']=='respaldado'
    assert repo.load_tracking(user)['events'][-1]['patch']=={'continuidad_laboral':'entre_1_y_3_anios'}
    assert confirmed['deletion_state']=='delete_pending' # Durable before any Storage I/O.


@pytest.mark.parametrize('source,detection',[
    ('Líquido a pagar: $1234567\nLíquido a pagar: $2345678','ambiguous'),
    ('Total haberes: $3456789','not_detected'),
])
def test_unresolved_candidates_have_no_invented_decision_or_valid_evidence(setup,source,detection):
    user,pid,repo,parser,azure,storage=prepared(setup)
    azure.source={'content':source,'pages':[{'pageNumber':1}]}
    view=parser.consume(user,pid)
    assert view['candidates'][0]['detection']==detection
    before=repo.load_tracking(user)
    service=DocumentService(repo)
    for action in ('accept_detected','keep_declared'):
        forged=ConfirmProcess(request_id=uuid4(),expected_revision=view['revision'],confirmed=True,
                              decisions=[{'field':'ingreso_mensual','decision':action}])
        with pytest.raises(DocumentError,match='invalid_decision'):service.confirm(user,pid,forged)
        with pytest.raises(DocumentError,match='invalid_decision'):
            repo.confirm(user,pid,forged.model_dump(mode='json'),None)
    closed=UploadService(repo,storage).confirm(user,pid,command(view))
    assert closed['state']=='confirmed' and closed['evidence']==[] and closed['candidates']==[]
    assert closed['tracking_event_id'] is None and repo.load_tracking(user)==before
    assert repo.read(user,pid)['process']['confirm_request']['decisions']==[]


def test_mixed_detected_and_ambiguous_laboral_needs_only_real_decision(setup):
    user,pid,repo,parser,azure,storage=prepared(setup,'employment','documento_laboral')
    azure.source={'content':'Tipo de contrato: plazo fijo\nFecha de ingreso: imposible','pages':[{'pageNumber':1}]}
    view=parser.consume(user,pid)
    choices={'tipo_contrato':'accept_detected'}
    confirmation=command(view,choices)
    assert len(confirmation.decisions)==1
    confirmed=DocumentService(repo).confirm(user,pid,confirmation)
    assert [row['field'] for row in confirmed['evidence']]==['tipo_contrato']
    assert repo.load_tracking(user)['events'][-1]['patch']=={'tipo_contrato':'plazo_fijo'}


def test_compatible_replay_does_not_duplicate_and_incompatible_replay_is_rejected(setup):
    user,pid,repo,parser,_,storage=prepared(setup)
    view=parser.consume(user,pid)
    cmd=command(view,{'ingreso_mensual':'accept_detected'})
    service=UploadService(repo,storage)
    first=service.confirm(user,pid,cmd)
    after=repo.load_tracking(user)
    assert service.confirm(user,pid,cmd)==first
    assert repo.load_tracking(user)==after
    other=command(view,{'ingreso_mensual':'keep_declared'})
    with pytest.raises(DocumentError,match='idempotency_conflict'):service.confirm(user,pid,other)
    assert repo.load_tracking(user)==after


def test_cancellation_blocks_confirmation_and_removes_candidates(setup):
    user,pid,repo,parser,_,storage=prepared(setup)
    view=parser.consume(user,pid)
    before=repo.load_tracking(user)
    uploads=UploadService(repo,storage)
    closed=uploads.cancel(user,pid,CancelProcess(expected_revision=view['revision']))
    assert closed['state']=='cancelled' and closed['candidates']==[]
    with pytest.raises(DocumentError,match='invalid_transition'):
        uploads.confirm(user,pid,command(view,{'ingreso_mensual':'accept_detected'}))
    assert repo.load_tracking(user)==before


def test_confirm_is_atomic_if_hu13_commit_fails(setup):
    user,pid,repo,parser,_,_=prepared(setup)
    view=parser.consume(user,pid)
    service=DocumentService(repo)
    # Real SQL constraint failure inside the same HU13 transaction, not a mocked RPC.
    sql("CREATE FUNCTION test_hu23_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event rejection'; END $$; "
        "CREATE TRIGGER test_hu23_reject_event BEFORE INSERT ON tracking_events FOR EACH ROW EXECUTE FUNCTION test_hu23_reject_event();")
    try:
        before=repo.load_tracking(user)
        with pytest.raises(RuntimeError,match='synthetic event rejection'):
            service.confirm(user,pid,command(view,{'ingreso_mensual':'accept_detected'}))
        unchanged=service.read(user,pid)
        assert unchanged['state']=='awaiting_review' and unchanged['evidence']==[]
        assert unchanged['candidates']==view['candidates'] and unchanged['deletion_state']=='not_requested'
        assert repo.load_tracking(user)==before
    finally:
        sql('DROP TRIGGER test_hu23_reject_event ON tracking_events; DROP FUNCTION test_hu23_reject_event();')


def test_owner_http_confirm_cancel_and_replay_do_not_expose_original(api,monkeypatch):
    request,context=api
    user,pid,repo,parser,_,storage=prepared(context)
    view=parser.consume(user,pid)
    monkeypatch.setattr('app.documents.upload.TemporaryStorage',lambda repository:storage)
    headers={'Authorization':f'Bearer {user}'}
    cmd=command(view,{'ingreso_mensual':'accept_detected'}).model_dump(mode='json')
    other=seed()
    for action in ('confirm','cancel'):
        response=request('POST',f'/tracking/documents/sessions/{pid}/{action}',json=cmd if action=='confirm' else {'expected_revision':view['revision']},
                         headers={'Authorization':f'Bearer {other}'})
        assert response.status_code==404
    response=request('POST',f'/tracking/documents/sessions/{pid}/confirm',json=cmd,headers=headers)
    assert response.status_code==200,response.text
    assert response.json()['evidence'][0]['current_backing']=='respaldado'
    replay=request('POST',f'/tracking/documents/sessions/{pid}/confirm',json=cmd,headers=headers)
    assert replay.status_code==200 and replay.json()==response.json()
    assert response.json()['candidates']==[] and response.headers['cache-control']=='no-store'
    for forbidden in ('storage_path','signedURL','analyzeResult','PERSONA_'):
        assert forbidden not in response.text


def test_confirmed_data_survives_storage_failure_and_compatible_retry_finishes_cleanup(setup):
    user,pid,repo,parser,_,storage=prepared(setup)
    view=parser.consume(user,pid)
    cmd=command(view,{'ingreso_mensual':'accept_detected'})
    storage.fail=True
    uploads=UploadService(repo,storage)
    first=uploads.confirm(user,pid,cmd)
    assert first['state']=='confirmed' and first['deletion_state']=='retry_required'
    assert first['candidates']==[] and first['evidence'][0]['current_backing']=='respaldado'
    saved=repo.load_tracking(user)
    storage.fail=False
    replay=uploads.confirm(user,pid,cmd)
    assert replay['deletion_state']=='deleted' and repo.load_tracking(user)==saved
