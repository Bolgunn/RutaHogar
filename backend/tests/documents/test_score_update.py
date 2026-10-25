"""T6 explicit scoring against real PostgreSQL. Market data is synthetic, engine is real."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
from threading import Barrier
from uuid import uuid4

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tracking'))
from test_service import market_snapshot
from app.documents.contracts import DocumentError, UpdateValidatedScore, CreateProcess
from app.documents.score_update import DocumentScoreService
from app.documents.service import DocumentService
from app.documents.upload import UploadService
from app.tracking.contracts import TrackingError
from app.tracking.scoring_adapter import score_snapshot
from app.tracking.service import TrackingService
from app.scoring import SCORING_VERSION
from test_parsing import prepared
from test_review import command as confirm_command
from test_persistence import setup, api, sql, lit, seed, pytestmark


def confirmed(setup,value='$1.200.000',decision='accept_detected'):
    user,pid,repo,parser,azure,storage=prepared(setup)
    azure.source={'content':'Líquido a pagar: '+value,'pages':[{'pageNumber':1}]}
    view=parser.consume(user,pid)
    result=UploadService(repo,storage).confirm(user,pid,confirm_command(view,{'ingreso_mensual':decision}))
    return user,pid,repo,storage,result


def service(repo,**kwargs):
    return DocumentScoreService(repo,market_resolver=lambda:market_snapshot(),**kwargs)


def command(status):
    return UpdateValidatedScore(request_id=uuid4(),expected_revision=status['revision'],validation_token=status['validation_token'])


def test_confirmation_does_not_score_and_explicit_action_creates_one_versioned_evaluation(setup):
    user,pid,repo,storage,review=confirmed(setup)
    calls=[]
    def scorer(snapshot):
        calls.append(deepcopy(snapshot))
        return score_snapshot(snapshot,market_snapshot=market_snapshot())
    scores=service(repo,scorer=scorer)
    before=repo.load_tracking(user)
    state=scores.status(user)
    assert calls==[] and review['state']=='confirmed'
    assert state['pending'] and state['fields']==['ingreso_mensual'] and not state['cleanup_required']
    cmd=command(state)
    result=scores.update(user,cmd)
    after=repo.load_tracking(user)
    assert len(calls)==1 and calls[0]['ingreso_mensual']==1200000
    assert len(after['evaluations'])==len(before['evaluations'])+1
    assert after['evaluations'][:len(before['evaluations'])]==before['evaluations']
    assert after['events'][:len(before['events'])]==before['events']
    assert after['plan']==before['plan']
    created=next(row for row in after['evaluations'] if row['id']==result['evaluation_id'])
    assert created['financial_data']['input']['ingreso_mensual']==1200000
    assert created['financial_data']['result']['algorithm_version']==SCORING_VERSION==result['algorithm_version']
    detail=created['financial_data']['provenance']['hu23_document_validation']
    assert detail['evidence']==[{'process_id':pid,'field':'ingreso_mensual'}]
    assert detail['reason']=='hu23_datos_validados'
    assert not scores.status(user)['pending']
    assert scores.update(user,cmd)==result and len(calls)==1
    # A second browser tab with a different nonce consumes the SAME cohort, not a second evaluation.
    assert scores.update(user,command(state))==result and len(calls)==1
    assert repo.load_tracking(user)==after
    with pytest.raises(DocumentError,match='no_score_pending'):
        scores.update(user,UpdateValidatedScore(request_id=uuid4(),expected_revision=after['revision'],validation_token=uuid4()))
    with pytest.raises(DocumentError,match='idempotency_conflict'):
        scores.update(user,cmd.model_copy(update={'validation_token':uuid4()}))
    assert len(calls)==1


def test_confirmed_match_is_a_new_validation_but_kept_difference_is_not(setup):
    user,pid,repo,_,review=confirmed(setup,'$1.000.000','keep_declared')
    assert review['tracking_event_id'] is None
    scores=service(repo)
    assert scores.status(user)['pending']
    scores.update(user,command(scores.status(user)))
    assert not scores.status(user)['pending']


def test_no_pending_evidence_cannot_score(setup):
    user,pid,repo,_=setup
    scores=service(repo)
    before=repo.load_tracking(user)
    assert not scores.status(user)['pending']
    with pytest.raises(DocumentError,match='no_score_pending'):
        scores.update(user,UpdateValidatedScore(request_id=uuid4(),expected_revision=before['revision'],validation_token=uuid4()))
    assert repo.load_tracking(user)==before


def test_kept_difference_has_no_pending_validated_data(setup):
    user,pid,repo,_,_=confirmed(setup,'$1.200.000','keep_declared')
    scores=service(repo)
    assert not scores.status(user)['pending']


@pytest.mark.parametrize('kind',['scorer','market'])
def test_failure_preserves_pending_and_intent_is_safely_retried(setup,kind):
    user,pid,repo,_,_=confirmed(setup)
    def fail(*a,**k):
        if kind=='market':raise TrackingError('market_data_unavailable')
        raise RuntimeError('SYNTHETIC SENSITIVE INPUT MUST NOT ESCAPE')
    failed=DocumentScoreService(repo,scorer=fail if kind=='scorer' else None,
                               market_resolver=fail if kind=='market' else lambda:market_snapshot())
    before=repo.load_tracking(user)
    cmd=command(failed.status(user))
    with pytest.raises((DocumentError,TrackingError),match='score_update_unavailable|market_data_unavailable'):
        failed.update(user,cmd)
    assert failed.status(user)['pending'] and repo.load_tracking(user)==before
    assert sql(f'SELECT count(*) FROM document_score_requests WHERE user_id={lit(user)} AND completed_at IS NULL;')=='1'
    good=service(repo)
    good.update(user,cmd)
    assert not good.status(user)['pending']


def test_concurrent_clicks_create_one_evaluation(setup):
    user,pid,repo,_,_=confirmed(setup)
    barrier=Barrier(2)
    def scorer(snapshot):
        barrier.wait(timeout=20)
        return score_snapshot(snapshot,market_snapshot=market_snapshot())
    scores=service(repo,scorer=scorer)
    state=scores.status(user);commands=[command(state),command(state)]
    before=repo.load_tracking(user)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda cmd:scores.update(user,cmd),commands))
    assert results[0]['evaluation_id']==results[1]['evaluation_id']
    assert len(repo.load_tracking(user)['evaluations'])==len(before['evaluations'])+1
    assert not scores.status(user)['pending']


def test_failed_database_commit_rolls_back_evaluation_and_pending_consumption(setup):
    user,pid,repo,_,_=confirmed(setup)
    scores=service(repo);cmd=command(scores.status(user));before=repo.load_tracking(user)
    sql("CREATE FUNCTION test_hu23_reject_score() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic score rejection'; END $$; "
        "CREATE TRIGGER test_hu23_reject_score BEFORE INSERT ON tracking_events FOR EACH ROW EXECUTE FUNCTION test_hu23_reject_score();")
    try:
        with pytest.raises(DocumentError,match='score_update_unavailable'):scores.update(user,cmd)
        assert scores.status(user)['pending'] and repo.load_tracking(user)==before
        assert sql(f'SELECT count(*) FROM document_score_requests WHERE user_id={lit(user)} AND completed_at IS NOT NULL;')=='0'
    finally:
        sql('DROP TRIGGER test_hu23_reject_score ON tracking_events; DROP FUNCTION test_hu23_reject_score();')
    scores.update(user,cmd)
    assert not scores.status(user)['pending']


def test_new_match_confirmation_during_scoring_cannot_be_lost(setup):
    user,pid,repo,_,_=confirmed(setup)
    def confirm_again(snapshot):
        docs=DocumentService(repo)
        created=docs.create(user,CreateProcess(document_type='liquidacion_sueldo'))
        _,_,_,parser,azure,storage=prepared((user,created['id'],repo,docs))
        azure.source={'content':'Líquido a pagar: $1.200.000','pages':[{'pageNumber':1}]}
        view=parser.consume(user,created['id'])
        UploadService(repo,storage).confirm(user,created['id'],confirm_command(view,{'ingreso_mensual':'keep_declared'}))
        return score_snapshot(snapshot,market_snapshot=market_snapshot())
    scores=service(repo,scorer=confirm_again);old=command(scores.status(user));before=repo.load_tracking(user)
    with pytest.raises(DocumentError,match='stale_score_state'):scores.update(user,old)
    assert len(repo.load_tracking(user)['evaluations'])==len(before['evaluations'])
    fresh=service(repo);assert fresh.status(user)['pending']
    with pytest.raises(DocumentError,match='stale_score_state'):fresh.update(user,old)
    fresh.update(user,command(fresh.status(user)))
    assert not fresh.status(user)['pending']


def test_normal_hu13_evaluation_already_incorporates_the_confirmed_data(setup):
    user,pid,repo,_,_=confirmed(setup)
    scores=service(repo)
    assert scores.status(user)['pending']
    class Normal:
        def load(self,user):return repo.load_tracking(user)
        def commit(self,user,cmd,revision,records):
            return repo.rpc('hu13_commit',{'p_user_id':user,'p_command':cmd,'p_expected_revision':revision,'p_records':records})
    bundle=repo.load_tracking(user)
    normal=TrackingService(Normal(),market_snapshot_resolver=lambda:market_snapshot())
    result=normal.execute(user,{'event_id':str(uuid4()),'event_kind':'data_update',
        'effective_at':datetime.now(timezone.utc).isoformat(),'reason':'normal HU13',
        'previous_event_id':bundle['revision'],'patch':{'deuda_mensual':210000}})
    assert result['evaluation'] and not scores.status(user)['pending']


def test_owner_isolation_and_no_client_snapshot_or_user_override(api,monkeypatch):
    request,context=api
    user,pid,repo,_,_=confirmed(context)
    scores=service(repo)
    monkeypatch.setattr('app.documents.routes.DocumentScoreService',lambda repository:scores)
    headers={'Authorization':f'Bearer {user}'}
    response=request('GET','/tracking/documents/score/status',headers=headers)
    assert response.status_code==200 and response.json()['pending']
    cmd=command(scores.status(user)).model_dump(mode='json')
    for extra in ({'user_id':str(uuid4())},{'snapshot':{'ingreso_mensual':999999}},{'evaluation_id':str(uuid4())}):
        bad=request('POST','/tracking/documents/score/update',json={**cmd,**extra},headers=headers)
        assert bad.status_code==422
    actor=seed('ejecutivo')
    denied=request('GET','/tracking/documents/score/status',headers={'Authorization':f'Bearer {actor}'})
    assert denied.status_code==404
    for actor in (seed(),seed('ejecutivo')):
        with pytest.raises((DocumentError,TrackingError)):scores.update(actor,UpdateValidatedScore.model_validate(cmd))
    result=request('POST','/tracking/documents/score/update',json=cmd,headers=headers)
    assert result.status_code==200,result.text
    assert set(result.json())=={'evaluation_id','score','classification','algorithm_version'}
    assert result.headers['cache-control']=='no-store'
    assert request('POST','/tracking/documents/score/update',json=cmd,headers=headers).json()==result.json()
    assert sql(f'SELECT count(*) FROM document_score_requests WHERE user_id={lit(user)};')=='1'


def test_original_deletion_is_retried_before_scoring_and_failure_keeps_pending(setup):
    user,pid,repo,parser,azure,storage=prepared(setup)
    view=parser.consume(user,pid)
    storage.fail=True
    closed=UploadService(repo,storage).confirm(user,pid,confirm_command(view,{'ingreso_mensual':'accept_detected'}))
    assert closed['deletion_state']=='retry_required'
    calls=[]
    def scorer(snapshot):
        calls.append(snapshot)
        return score_snapshot(snapshot,market_snapshot=market_snapshot())
    scores=service(repo,scorer=scorer,storage=storage)
    state=scores.status(user);assert state['pending'] and state['cleanup_required']
    cmd=command(state)
    with pytest.raises(DocumentError,match='document_cleanup_pending'):scores.update(user,cmd)
    assert scores.status(user)['pending'] and calls==[]
    storage.fail=False
    scores.update(user,cmd)
    assert len(calls)==1 and not scores.status(user)['pending']
    assert repo.read(user,pid)['process']['deletion_state']=='deleted'


def test_later_kept_difference_does_not_erase_an_earlier_unscored_update(setup):
    user,pid,repo,_,_=confirmed(setup)
    docs=DocumentService(repo)
    created=docs.create(user,CreateProcess(document_type='liquidacion_sueldo'))
    _,_,_,parser,azure,storage=prepared((user,created['id'],repo,docs))
    azure.source={'content':'Líquido a pagar: $1.400.000','pages':[{'pageNumber':1}]}
    view=parser.consume(user,created['id'])
    UploadService(repo,storage).confirm(user,created['id'],confirm_command(view,{'ingreso_mensual':'keep_declared'}))
    scores=service(repo)
    assert scores.status(user)['pending']
    result=scores.update(user,command(scores.status(user)))
    evaluation=next(row for row in repo.load_tracking(user)['evaluations'] if row['id']==result['evaluation_id'])
    assert evaluation['financial_data']['input']['ingreso_mensual']==1200000
    assert evaluation['financial_data']['provenance']['hu23_document_validation']['evidence']==[{'process_id':pid,'field':'ingreso_mensual'}]


def test_later_historical_evaluation_does_not_consume_current_unscored_data(setup):
    from datetime import timedelta
    user,pid,repo,_,_=confirmed(setup)
    class Normal:
        def load(self,user):return repo.load_tracking(user)
        def commit(self,user,cmd,revision,records):
            return repo.rpc('hu13_commit',{'p_user_id':user,'p_command':cmd,'p_expected_revision':revision,'p_records':records})
    bundle=repo.load_tracking(user)
    normal=TrackingService(Normal(),market_snapshot_resolver=lambda:market_snapshot())
    old=normal.execute(user,{'event_id':str(uuid4()),'event_kind':'evaluation',
        'effective_at':(datetime.now(timezone.utc)-timedelta(minutes=30)).isoformat(),
        'reason':'historical evaluation','previous_event_id':bundle['revision'],'patch':{}})
    assert old['evaluation']['snapshot']['ingreso_mensual']==1000000
    scores=service(repo)
    assert scores.status(user)['pending']
    result=scores.update(user,command(scores.status(user)))
    new=next(row for row in repo.load_tracking(user)['evaluations'] if row['id']==result['evaluation_id'])
    assert new['financial_data']['input']['ingreso_mensual']==1200000
    assert not scores.status(user)['pending']
