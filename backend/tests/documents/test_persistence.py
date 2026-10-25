"""Real PostgreSQL integration. Set HU23_TEST_PSQL to a local psql executable.
Only a Unix socket under /tmp is accepted; no Supabase or TCP connection.
"""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import httpx
import pytest

from app.documents.contracts import CancelProcess, ConfirmProcess, CreateProcess, DocumentError, StructuredResult
from app.documents.repository import DocumentRepository
from app.documents.routes import repository as dependency
from app.documents.service import DocumentService
from app.main import app
from app.tracking.scoring_adapter import complete_snapshot

PSQL=os.environ.get('HU23_TEST_PSQL')
pytestmark=pytest.mark.skipif(not PSQL,reason='requires disposable local PostgreSQL fixture (HU23_TEST_PSQL)')


def sql(statement, role=None, owner=None):
    socket=os.environ.get('HU23_TEST_SOCKET','/tmp')
    assert socket.startswith('/tmp') and '://' not in socket
    prefix=''
    if role:
        assert role in ('authenticated','anon','service_role')
        prefix=f'SET ROLE {role};'
    if owner: prefix+=f"SELECT set_config('request.jwt.claim.sub','{owner}',false);"
    result=subprocess.run([PSQL,'-X','-qAt','-h',socket,'-p',os.environ.get('HU23_TEST_PORT','55423'),
                           '-U',os.environ.get('HU23_TEST_USER','icart'),'-d','postgres',
                           '-v','ON_ERROR_STOP=1','-c',prefix+statement],capture_output=True,text=True)
    if result.returncode:
        for code in ['not_found','invalid_transition','idempotency_conflict','invalid_decision','lineage_conflict',
                     'stale_review','already_closed','expired','invalid_update','tracking_baseline_required',
                     'stale_score_state','no_score_pending','score_update_disabled','document_cleanup_pending',
                         'upload_not_authorized','upload_not_verified','upload_not_deleted','upload_already_exists','upload_format_locked']:
            if code in result.stderr: raise DocumentError(code)
        raise RuntimeError(result.stderr)
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''


def lit(value):
    if value is None: return 'NULL'
    value=json.dumps(value) if isinstance(value,(dict,list)) else str(value)
    return "'"+value.replace("'","''")+"'"


class LocalRepository(DocumentRepository):
    def __init__(self): pass
    def authenticate(self,token): return token
    def load_tracking(self,user):
        return json.loads(sql(f'SELECT public.hu13_read({lit(user)}::uuid);',role='service_role'))
    def rpc(self,name,payload, *, timeout=None):
        args=','.join(key+' => '+lit(value) for key,value in payload.items())
        return json.loads(sql(f'SELECT public.{name}({args});',role='service_role'))


def seed(role='usuario'):
    user,plan,event,evaluation=[str(uuid4()) for _ in range(4)]
    snapshot=complete_snapshot({'ingreso_mensual':1000000,'deuda_mensual':200000,'edad':30,
        'ahorro_disponible':1000000,'plazo_credito_hipotecario':20,'tipo_contrato':'indefinido',
        'continuidad_laboral':'mas_3_anios','morosidad_actual':'no','consentimiento':True,
        'property_value_clp':100000000,'dividendo_estimado':300000})
    sql(f'''BEGIN;
    INSERT INTO auth.users(id,email) VALUES({lit(user)},'synthetic@example.invalid');
    INSERT INTO profiles(id,role) VALUES({lit(user)},{lit(role)});
    INSERT INTO evaluations(id,user_id,score,classification,financial_data) VALUES(
      {lit(evaluation)},{lit(user)},50,'Medio',{lit({'input':snapshot,'result':{'score':50,'classification':'Medio'}})});
    INSERT INTO scoring_history(evaluation_id,user_id,score,classification,snapshot,component_scores,algorithm_version,channel)
      VALUES({lit(evaluation)},{lit(user)},50,'Medio',{lit({'input':snapshot})},'{{}}','test-v1','web');
    INSERT INTO tracking_plans(id,user_id,baseline_evaluation_id,root_event_id,baseline_at,original_plan_snapshot,provenance)
      VALUES({lit(plan)},{lit(user)},{lit(evaluation)},{lit(event)},now()-interval '1 hour','{{}}','{{}}');
    INSERT INTO tracking_events(event_id,plan_id,user_id,event_kind,effective_at,reason,patch,recorded_complete_snapshot,evaluation_id,algorithm_version,provenance)
      VALUES({lit(event)},{lit(plan)},{lit(user)},'baseline',now()-interval '1 hour','test',
        {lit(snapshot)},{lit(snapshot)},{lit(evaluation)},'hu13-lineage-v1','{{}}');
    COMMIT;''')
    return user


@pytest.fixture
def setup():
    repo=LocalRepository()
    user=seed()
    service=DocumentService(repo)
    created=service.create(user,CreateProcess(document_type='liquidacion_sueldo'))
    return user,created['id'],repo,service


def admit_upload(user, pid, repo):
    authorized=repo.rpc('hu23_upload_authorize',{'p_user':user,'p_process':pid,'p_request':{
      'expected_revision':0,'extension':'pdf','content_type':'application/pdf','client_pages':1}})
    u=authorized['upload']
    sql(f"INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES({lit(u['bucket_id'])},{lit(u['storage_path'])},{lit(user)},'{{\"size\":123,\"mimetype\":\"application/pdf\"}}');")
    repo.rpc('hu23_upload_complete',{'p_user':user,'p_process':pid,'p_revision':0})


def remove_upload_object(pid):
    sql(f"DELETE FROM storage.objects WHERE bucket_id='hu23-document-temporary' AND name=(SELECT storage_path FROM document_uploads WHERE process_id={lit(pid)});")


def ready(setup,value=1200000,field='ingreso_mensual',kind='liquidacion_sueldo'):
    user,pid,repo,service=setup
    admit_upload(user,pid,repo)
    service.start_processing(user,pid,1)
    service.record_result(user,pid,2,StructuredResult.model_validate({'document_type':kind,'parser_version':'parser-v1',
        'normalizer_version':'normalizer-v1','candidates':[{'field':field,'value':value,'page':1}]}))


def confirm_cmd(decision='accept_detected',field='ingreso_mensual'):
    return ConfirmProcess(request_id=uuid4(),expected_revision=3,confirmed=True,
                          decisions=[{'field':field,'decision':decision}])


@pytest.mark.parametrize('value,decision,comparison,backing,events', [
    (1000000,'keep_declared','match','respaldado',1),
    (1200000,'accept_detected','difference','respaldado',2),
    (1200000,'keep_declared','difference','con_diferencia',1),
])
def test_confirmation_real_transaction_and_minimization(setup,monkeypatch,value,decision,comparison,backing,events):
    user,pid,repo,service=setup
    ready(setup,value)
    before=repo.load_tracking(user)
    def forbidden(*a,**k): raise AssertionError('scoring/market invoked')
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.score_snapshot',forbidden)
    monkeypatch.setattr('app.tracking.scoring_adapter.resolve_tracking_market_snapshot',forbidden)
    cmd=confirm_cmd(decision)
    response=service.confirm(user,pid,cmd)
    assert response['state']=='confirmed' and response['deletion_state']=='delete_pending'
    assert response['evidence'][0]['comparison']==comparison
    assert response['evidence'][0]['current_backing']==backing
    assert response['candidates']==[]
    after=repo.load_tracking(user)
    assert after['evaluations']==before['evaluations']
    assert after['events'][:1]==before['events']
    assert len(after['events'])==events
    if events==2:
        event=after['events'][-1]
        assert event['evaluation_id'] is None
        assert event['recorded_complete_snapshot']['ingreso_mensual']==value
        assert event['command_result']['evaluation_ids']==[]
    assert service.confirm(user,pid,cmd)==response
    with pytest.raises(DocumentError,match='idempotency_conflict'):
        service.confirm(user,pid,confirm_cmd('keep_declared'))
    raw=repo.read(user,pid)
    assert 'detected_value' not in json.dumps(raw['evidence'])
    assert value not in [v for e in raw['evidence'] for v in e.values()]
    assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)};')=='0'
    with pytest.raises(RuntimeError,match='immutable_history'):
        sql(f"UPDATE document_field_evidence SET comparison='match' WHERE process_id={lit(pid)};")


def test_cancellation_failure_and_cleanup_do_not_create_evidence(setup):
    user,pid,repo,service=setup
    ready(setup)
    before=repo.load_tracking(user)
    cancelled=service.cancel(user,pid,CancelProcess(expected_revision=3))
    assert service.cancel(user,pid,CancelProcess(expected_revision=3))==cancelled
    with pytest.raises(DocumentError,match='invalid_transition'):
        service.confirm(user,pid,confirm_cmd())
    assert repo.read(user,pid)['candidates']==[]
    service.mark_deletion(user,pid,4,'deleting')
    service.mark_deletion(user,pid,5,'retry_required')
    service.mark_deletion(user,pid,6,'deleting')
    remove_upload_object(pid)
    deleted=service.mark_deletion(user,pid,7,'deleted')
    assert deleted['process']['storage_path'] is None
    assert deleted['process']['deletion_attempts']==2
    assert repo.load_tracking(user)==before
    assert deleted['evidence']==[]


def test_fail_attempt_keeps_previous_evidence_and_source_facts(setup):
    user,pid,repo,service=setup
    ready(setup,1000000)
    service.confirm(user,pid,confirm_cmd())
    before=repo.load_tracking(user)
    second=service.create(user,CreateProcess(document_type='liquidacion_sueldo'))['id']
    service.fail(user,second,0,'unreadable_document')
    assert repo.read(user,second)['process']['state']=='processing_failed'
    assert repo.read(user,second)['evidence']==[]
    assert service.read(user,pid)['evidence'][0]['current_backing']=='respaldado'
    assert repo.load_tracking(user)==before


def test_owner_and_role_security_at_rpc_and_rls(setup):
    user,pid,repo,service=setup
    ready(setup)
    for other in [seed(),seed('ejecutivo'),seed('admin'),seed('admin_inmobiliario')]:
        for operation in [lambda: service.read(other,pid),lambda: service.confirm(other,pid,confirm_cmd()),
                          lambda: service.cancel(other,pid,CancelProcess(expected_revision=3))]:
            with pytest.raises(DocumentError,match='not_found'):operation()
        assert sql(f'SELECT count(*) FROM document_processes WHERE id={lit(pid)};',role='authenticated',owner=other)=='0'
        assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)};',role='authenticated',owner=other)=='0'
    assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)};',role='authenticated',owner=user)=='1'
    for role in ['authenticated','anon']:
        with pytest.raises(RuntimeError,match='permission denied'):
            sql(f"SELECT hu23_lifecycle({lit(user)},{lit(pid)},3,'result','{{}}');",role=role,owner=user)
    with pytest.raises(RuntimeError,match='permission denied'):
        sql(f"UPDATE document_candidates SET detected_value='1' WHERE process_id={lit(pid)};",role='authenticated',owner=user)
    with pytest.raises(RuntimeError,match='permission denied'):
        sql(f"INSERT INTO document_processes(id) VALUES({lit(str(uuid4()))});",role='authenticated',owner=user)


def test_no_undetected_or_outside_allowlist_confirmation(setup):
    user,pid,repo,service=setup
    ready(setup)
    for field in ['ahorro_disponible','tipo_contrato']:
        with pytest.raises(DocumentError,match='invalid_decision'):
            service.confirm(user,pid,confirm_cmd(field=field))
        forged=confirm_cmd(field=field).model_dump(mode='json')
        with pytest.raises(DocumentError,match='invalid_decision'):
            repo.confirm(user,pid,forged,None)
    before=repo.load_tracking(user)
    assert before['revision']==repo.read(user,pid)['process']['base_revision']


def test_database_constraints_and_ownership(setup):
    user,pid,repo,service=setup
    ready(setup)
    with pytest.raises(RuntimeError,match='check constraint'):
        sql(f"UPDATE document_candidates SET field='ahorro_disponible' WHERE process_id={lit(pid)};")
    with pytest.raises(RuntimeError,match='check constraint'):
        sql(f"UPDATE document_candidates SET detected_value='true' WHERE process_id={lit(pid)};")
    with pytest.raises(RuntimeError,match='foreign key constraint'):
        sql(f"UPDATE document_candidates SET user_id={lit(seed())} WHERE process_id={lit(pid)};")
    with pytest.raises(RuntimeError,match='check constraint'):
        sql(f"UPDATE document_processes SET expires_at=created_at+interval '25 hours' WHERE id={lit(pid)};")


def test_atomic_rollback_even_after_hu13_append(setup):
    user,pid,repo,service=setup
    ready(setup)
    before=repo.load_tracking(user)
    # Force evidence insertion to fail *after* hu13_commit. No partial event or closure may survive.
    sql("""CREATE FUNCTION public.hu23_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic_failure'; END $$;
      CREATE TRIGGER hu23_test_failure BEFORE INSERT ON document_field_evidence
      FOR EACH ROW EXECUTE FUNCTION public.hu23_test_failure();""")
    try:
        with pytest.raises(RuntimeError,match='synthetic_failure'):
            service.confirm(user,pid,confirm_cmd())
    finally:
        sql('DROP TRIGGER hu23_test_failure ON document_field_evidence; DROP FUNCTION public.hu23_test_failure();')
    assert repo.load_tracking(user)==before
    assert repo.read(user,pid)['process']['state']=='awaiting_review'
    assert len(repo.read(user,pid)['candidates'])==1


def test_invalid_lifecycle_and_stale_review(setup):
    user,pid,repo,service=setup
    with pytest.raises(DocumentError,match='invalid_transition'):
        service.start_processing(user,pid,0)
    ready(setup)
    with pytest.raises(DocumentError,match='stale_review'):
        service.confirm(user,pid,confirm_cmd().model_copy(update={'expected_revision':2}))
    with pytest.raises(DocumentError,match='invalid_transition'):
        service.mark_deletion(user,pid,3,'deleted')


def test_stale_financial_revision_writes_nothing(setup):
    user,pid,repo,service=setup
    ready(setup)
    # Another confirmed documentary session advances the shared HU13 revision.
    other=service.create(user,CreateProcess(document_type='liquidacion_sueldo'))['id']
    ready((user,other,repo,service),1300000)
    service.confirm(user,other,confirm_cmd())
    before=repo.load_tracking(user)
    with pytest.raises(DocumentError,match='lineage_conflict'):
        service.confirm(user,pid,confirm_cmd())
    assert repo.load_tracking(user)==before


@pytest.fixture
def api(setup,monkeypatch):
    async def inline(call,*args,**kwargs):return call(*args,**kwargs)
    monkeypatch.setattr('fastapi.dependencies.utils.run_in_threadpool',inline)
    monkeypatch.setattr('fastapi.routing.run_in_threadpool',inline)
    user,pid,repo,service=setup
    app.dependency_overrides[dependency]=lambda:repo
    def request(method,path,**kwargs):
        async def send():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                return await client.request(method,path,**kwargs)
        return asyncio.run(send())
    try:yield request,setup
    finally:app.dependency_overrides.clear()


def test_http_boundary_cannot_fabricate_ocr_or_owner(api):
    request,(user,pid,repo,service)=api
    path=f'/tracking/documents/sessions/{pid}'
    assert request('GET',path).status_code==401
    forged={'document_type':'liquidacion_sueldo','user_id':user,'ocr_text':'synthetic_secret'}
    response=request('POST','/tracking/documents/sessions',json=forged,headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==422 and 'synthetic_secret' not in response.text
    for suffix in ['result','ocr','cleanup','upload-complete']:
        assert request('POST',path+'/'+suffix,json=forged,headers={'Authorization':f'Bearer {user}'}).status_code in (404,405)
    other=seed()
    assert request('GET',path,headers={'Authorization':f'Bearer {other}'}).status_code==404
    response=request('GET',path,headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==200 and response.headers['cache-control']=='no-store'
    assert not {'storage_path','user_id','confirm_request'} & set(response.json())


def test_expiration_purges_candidates_and_never_updates_data(setup):
    user,pid,repo,service=setup
    ready(setup)
    before=repo.load_tracking(user)
    sql(f"UPDATE document_processes SET created_at=now()-interval '23 hours',expires_at=now()-interval '1 hour' WHERE id={lit(pid)};")
    assert service.read(user,pid)['candidates']==[]
    assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)};',role='authenticated',owner=user)=='0'
    with pytest.raises(DocumentError,match='expired'):
        service.confirm(user,pid,confirm_cmd())
    expired=service.expire(user,pid,3)
    assert expired['process']['state']=='expired' and expired['process']['deletion_state']=='delete_pending'
    assert expired['candidates']==[] and repo.load_tracking(user)==before


def test_unknown_candidate_has_no_financial_decision_or_valid_evidence(setup):
    user,pid,repo,service=setup
    admit_upload(user,pid,repo)
    service.start_processing(user,pid,1)
    service.record_result(user,pid,2,StructuredResult.model_validate({'document_type':'liquidacion_sueldo',
      'parser_version':'p-v1','normalizer_version':'n-v1','candidates':[{'field':'ingreso_mensual','detection':'ambiguous','page':1}]}))
    with pytest.raises(DocumentError,match='invalid_decision'):
        service.confirm(user,pid,confirm_cmd())
    with pytest.raises(DocumentError,match='invalid_decision'):
        service.confirm(user,pid,confirm_cmd('keep_declared'))
    response=service.confirm(user,pid,ConfirmProcess(request_id=uuid4(),expected_revision=3,confirmed=True,decisions=[]))
    assert response['evidence']==[] and response['tracking_event_id'] is None


def test_newer_source_value_invalidates_current_backing_without_rewriting_evidence(setup):
    user,pid,repo,service=setup
    ready(setup,1000000)
    first=service.confirm(user,pid,confirm_cmd())['evidence'][0]
    newer=service.create(user,CreateProcess(document_type='liquidacion_sueldo'))['id']
    ready((user,newer,repo,service),1500000)
    service.confirm(user,newer,confirm_cmd())
    prior=service.read(user,pid)['evidence'][0]
    assert prior['comparison']==first['comparison']=='match'
    assert prior['backing_at_confirmation']=='respaldado'
    assert prior['current_backing']=='sin_respaldo'


def test_concurrent_confirmations_commit_one_update(setup):
    from app.documents.tracking_adapter import prepare_update
    user,pid,repo,service=setup
    ready(setup)
    tracking=repo.load_tracking(user)
    statements=[]
    for _ in range(2):
        cmd=confirm_cmd().model_dump(mode='json')
        update=prepare_update(tracking,user,pid,str(uuid4()),{'ingreso_mensual':1200000},datetime.now(timezone.utc).isoformat())
        statements.append(f"SET ROLE service_role; SELECT public.hu23_confirm({lit(user)},{lit(pid)},{lit(cmd)},{lit(update)});")
    procs=[subprocess.Popen([PSQL,'-X','-qAt','-h',os.environ.get('HU23_TEST_SOCKET','/tmp'),
             '-p',os.environ.get('HU23_TEST_PORT','55423'),'-U',os.environ.get('HU23_TEST_USER','icart'),
             '-d','postgres','-v','ON_ERROR_STOP=1','-c',statement],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
           for statement in statements]
    outputs=[p.communicate(timeout=20) for p in procs]
    assert sorted(p.returncode for p in procs)==[0,1]
    assert any('idempotency_conflict' in err for _,err in outputs)
    assert len(repo.load_tracking(user)['events'])==2
    assert len(repo.load_tracking(user)['evaluations'])==1
    assert len(repo.read(user,pid)['evidence'])==1


def test_create_retry_is_stable_and_legacy_without_plan_is_explicit(setup):
    user,pid,repo,service=setup
    repeated=service.create(user,CreateProcess(document_type='liquidacion_sueldo',request_id=pid))
    assert repeated['id']==pid and repeated['revision']==0
    with pytest.raises(DocumentError,match='idempotency_conflict'):
        service.create(user,CreateProcess(document_type='certificado_ahorro',request_id=pid))
    orphan=str(uuid4())
    sql(f"INSERT INTO auth.users(id) VALUES({lit(orphan)}); INSERT INTO profiles(id,role) VALUES({lit(orphan)},'usuario');")
    with pytest.raises(DocumentError,match='tracking_baseline_required'):
        service.create(orphan,CreateProcess(document_type='liquidacion_sueldo'))


def test_deletion_acknowledgement_can_be_retried_with_original_revision(setup):
    user,pid,repo,service=setup
    service.cancel(user,pid,CancelProcess(expected_revision=0))
    service.mark_deletion(user,pid,1,'deleting')
    first=service.mark_deletion(user,pid,2,'deleted')
    assert service.mark_deletion(user,pid,2,'deleted')==first


@pytest.mark.parametrize('kind,candidates,decisions,expected', [
    ('certificado_ahorro',[{'field':'ahorro_disponible','value':0,'page':1}],
      [{'field':'ahorro_disponible','decision':'accept_detected'}],{'ahorro_disponible':0}),
    ('documento_laboral',[{'field':'tipo_contrato','value':'plazo_fijo','page':1},
                         {'field':'continuidad_laboral','value':'entre_6_y_12_meses','page':2}],
      [{'field':'tipo_contrato','decision':'accept_detected'},
       {'field':'continuidad_laboral','decision':'accept_detected'}],
      {'tipo_contrato':'plazo_fijo','continuidad_laboral':'entre_6_y_12_meses'}),
])
def test_each_supported_document_updates_only_its_allowed_fields(setup,kind,candidates,decisions,expected):
    user,_,repo,service=setup
    pid=service.create(user,CreateProcess(document_type=kind))['id']
    admit_upload(user,pid,repo)
    service.start_processing(user,pid,1)
    service.record_result(user,pid,2,StructuredResult(document_type=kind,parser_version='p-v1',normalizer_version='n-v1',candidates=candidates))
    before=repo.load_tracking(user)
    response=service.confirm(user,pid,ConfirmProcess(request_id=uuid4(),expected_revision=3,confirmed=True,decisions=decisions))
    after=repo.load_tracking(user)
    assert after['events'][-1]['patch']==expected
    assert after['evaluations']==before['evaluations']
    assert after['events'][-1]['evaluation_id'] is None
    assert all(e['current_backing']=='respaldado' for e in response['evidence'])


def test_http_confirm_output_is_typed_and_safe(api):
    request,setup=api
    user,pid,repo,service=setup
    ready(setup)
    response=request('POST',f'/tracking/documents/sessions/{pid}/confirm',json=confirm_cmd().model_dump(mode='json'),
                     headers={'Authorization':f'Bearer {user}'})
    assert response.status_code==200,response.text
    body=response.json()
    assert body['evidence'][0]['current_backing']=='respaldado'
    assert body['candidates']==[] and 'storage_path' not in body


def test_backing_uses_recorded_lineage_not_old_snapshot_of_a_correction(setup):
    user,_,repo,service=setup
    baseline=repo.load_tracking(user)
    root=baseline['events'][0]
    later,correction=str(uuid4()),str(uuid4())
    later_snapshot={**root['recorded_complete_snapshot'],'ingreso_mensual':2000000}
    corrected_snapshot={**root['recorded_complete_snapshot'],'ingreso_mensual':1500000}
    sql(f"""INSERT INTO tracking_events(event_id,plan_id,user_id,event_kind,effective_at,reason,patch,
        recorded_complete_snapshot,previous_event_id,algorithm_version,provenance)
      VALUES({lit(later)},{lit(root['plan_id'])},{lit(user)},'data_update',now()-interval '30 minutes','test',
        '{{"ingreso_mensual":2000000}}',{lit(later_snapshot)},{lit(root['event_id'])},'hu13-lineage-v1','{{}}');
      INSERT INTO tracking_events(event_id,plan_id,user_id,event_kind,effective_at,reason,patch,
        recorded_complete_snapshot,previous_event_id,correction_of_event_id,correction_effect,algorithm_version,provenance)
      VALUES({lit(correction)},{lit(root['plan_id'])},{lit(user)},'correction',{lit(root['effective_at'])},'test',
        {lit(corrected_snapshot)},{lit(corrected_snapshot)},{lit(later)},{lit(root['event_id'])},'replace','hu13-lineage-v1','{{}}');""")
    pid=service.create(user,CreateProcess(document_type='liquidacion_sueldo'))['id']
    ready((user,pid,repo,service),2000000)
    confirmed=service.confirm(user,pid,confirm_cmd())
    assert confirmed['evidence'][0]['comparison']=='match'
    assert confirmed['evidence'][0]['current_backing']=='respaldado'
    assert confirmed['tracking_event_id'] is None
