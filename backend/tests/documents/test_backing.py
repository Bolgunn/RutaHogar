"""E4 metadata projection: PostgreSQL evidence + the real commercial authorization service."""
import json
from uuid import uuid4

import httpx
import pytest

from app.documents.backing import BACKING_FIELDS, DocumentBackingService
from app.documents.contracts import CreateProcess, DocumentError, CancelProcess
from app.documents.service import DocumentService
from app.documents.upload import UploadService
from app.tracking.contracts import TrackingError
from app.tracking.repository import TrackingRepository
from test_persistence import setup, api, seed, sql, lit, pytestmark
from test_parsing import prepared
from test_review import command
from test_score_update import confirmed


def by_field(projection):
    return {row['field']:row for row in projection['fields']}


def confirm_another(user,repo,kind='liquidacion_sueldo',name='payslip',decision='keep_declared',source=None):
    docs=DocumentService(repo)
    created=docs.create(user,CreateProcess(document_type=kind))
    _,pid,_,parser,azure,storage=prepared((user,created['id'],repo,docs),name,kind)
    if source is not None:azure.source=source
    view=parser.consume(user,pid)
    choices={row['field']:decision for row in view['candidates']}
    return UploadService(repo,storage).confirm(user,pid,command(view,choices)),pid


def staff_transport(monkeypatch,actors,allow,seen):
    monkeypatch.setenv('SUPABASE_URL','https://authorization.synthetic.invalid')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-key')
    monkeypatch.delenv('SUPABASE_SECRET_KEY',raising=False)
    def respond(request):
        if request.url.path=='/auth/v1/user':
            token=request.headers['Authorization'].removeprefix('Bearer ')
            return httpx.Response(200,json={'id':token})
        if request.url.path=='/rest/v1/profiles':
            actor=request.url.params['id'].removeprefix('eq.')
            seen.append(('actor',actor))
            return httpx.Response(200,json=[actors[actor]])
        if request.url.path=='/rest/v1/rpc/lead_belongs_to_inmobiliaria':
            payload=json.loads(request.content);seen.append(('scope',payload))
            return httpx.Response(200,json=payload['p_lead'] in allow.get(payload['p_inmobiliaria'],set()))
        raise AssertionError('unexpected authorization transport')
    return TrackingRepository(httpx.Client(base_url='https://authorization.synthetic.invalid',transport=httpx.MockTransport(respond)))


def test_legacy_profile_without_hu13_is_sin_respaldo_without_reading_finances(api,monkeypatch):
    request,(_,_,repo,_)=api
    legacy=str(uuid4())
    sql(f"INSERT INTO auth.users(id,email) VALUES({lit(legacy)},{lit(legacy+'@example.invalid')});"
        f"INSERT INTO profiles(id,role) VALUES({lit(legacy)},'usuario');"
        f"INSERT INTO evaluations(user_id,score,classification,financial_data) VALUES({lit(legacy)},45,'Bajo','{{}}');")
    monkeypatch.setattr(repo,'load_tracking',lambda *_:(_ for _ in ()).throw(AssertionError('legacy must not adopt/read finances')))
    response=request('GET','/tracking/documents/backing',headers={'Authorization':f'Bearer {legacy}'})
    assert response.status_code==200,response.text
    assert {row['field'] for row in response.json()['fields']}==set(BACKING_FIELDS)
    assert all(row['status']=='sin_respaldo' and row['confirmed_on'] is None for row in response.json()['fields'])
    assert sql(f'SELECT count(*) FROM tracking_plans WHERE user_id={lit(legacy)};')=='0'


def test_owner_states_and_no_scorer_or_mutation(setup,monkeypatch):
    user,pid,repo,_,review=confirmed(setup,'$1.000.000','keep_declared')
    before=repo.load_tracking(user)
    def forbidden(*a,**k):raise AssertionError('E4 invoked scoring')
    monkeypatch.setattr('app.tracking.service.TrackingService.execute',forbidden)
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    projection=DocumentBackingService(repo).owner(user)
    fields=by_field(projection)
    assert fields['ingreso_mensual']['status']=='respaldado'
    assert fields['ingreso_mensual']['confirmed_on'] is not None
    assert all(fields[field]['status']=='sin_respaldo' for field in BACKING_FIELDS[1:])
    assert repo.load_tracking(user)==before
    assert all(set(row)=={'field','status','confirmed_on'} for row in projection['fields'])


def test_latest_confirmed_evidence_wins_without_destroying_prior_evidence(setup):
    user,first,repo,_,_=confirmed(setup,'$1.000.000','keep_declared')
    view,second=confirm_another(user,repo,source={'content':'Líquido a pagar: $2.000.000','pages':[{'pageNumber':1}]})
    assert view['evidence'][0]['current_backing']=='con_diferencia'
    projection=DocumentBackingService(repo).owner(user)
    assert by_field(projection)['ingreso_mensual']['status']=='con_diferencia'
    assert sql(f"SELECT count(*) FROM document_field_evidence WHERE user_id={lit(user)} AND field='ingreso_mensual';")=='2'
    # Accepting a later value changes current backing, not the older comparison.
    confirm_another(user,repo,decision='accept_detected',source={'content':'Líquido a pagar: $2.000.000','pages':[{'pageNumber':1}]})
    assert by_field(DocumentBackingService(repo).owner(user))['ingreso_mensual']['status']=='respaldado'
    assert sql(f"SELECT comparison||':'||backing_at_confirmation FROM document_field_evidence WHERE process_id={lit(second)};")=='difference:con_diferencia'
    assert sql(f"SELECT count(*) FROM document_field_evidence WHERE user_id={lit(user)};")=='3'


def test_pending_ambiguous_failed_or_cancelled_attempt_does_not_replace_valid_evidence(setup):
    user,pid,repo,_,_=confirmed(setup,'$1.000.000','keep_declared')
    before=DocumentBackingService(repo).owner(user)
    docs=DocumentService(repo);created=docs.create(user,CreateProcess(document_type='liquidacion_sueldo'))
    _,other,_,parser,azure,storage=prepared((user,created['id'],repo,docs))
    azure.source={'content':'Total haberes: $9999999','pages':[{'pageNumber':1}]}
    review=parser.consume(user,other)
    assert DocumentBackingService(repo).owner(user)==before
    UploadService(repo,storage).confirm(user,other,command(review))
    assert DocumentBackingService(repo).owner(user)==before
    cancelled=docs.create(user,CreateProcess(document_type='liquidacion_sueldo'))
    docs.cancel(user,cancelled['id'],CancelProcess(expected_revision=cancelled['revision']))
    assert DocumentBackingService(repo).owner(user)==before


def test_projection_includes_all_four_approved_financial_fields(setup):
    user,pid,repo,_,_=confirmed(setup)
    confirm_another(user,repo,'certificado_ahorro','savings',decision='accept_detected')
    confirm_another(user,repo,'documento_laboral','employment',decision='accept_detected')
    projection=DocumentBackingService(repo).owner(user)
    assert all(row['status']=='respaldado' for row in projection['fields'])
    assert len(projection['fields'])==4


def test_financial_change_invalidates_latest_backing_without_falling_back_to_old_source(setup):
    user,pid,repo,_,_=confirmed(setup,'$1.000.000','keep_declared')
    # A legitimate HU13 correction via its normal flow produces the changed snapshot.
    from test_score_update import market_snapshot
    from app.tracking.service import TrackingService
    from datetime import datetime,timezone
    class Normal:
        def load(self,user):return repo.load_tracking(user)
        def commit(self,user,cmd,revision,records):
            return repo.rpc('hu13_commit',{'p_user_id':user,'p_command':cmd,'p_expected_revision':revision,'p_records':records})
    bundle=repo.load_tracking(user)
    TrackingService(Normal(),market_snapshot_resolver=lambda:market_snapshot()).execute(user,{
        'event_id':str(uuid4()),'event_kind':'data_update','effective_at':datetime.now(timezone.utc).isoformat(),
        'reason':'normal financial update','previous_event_id':bundle['revision'],'patch':{'ingreso_mensual':1300000}})
    row=by_field(DocumentBackingService(repo).owner(user))['ingreso_mensual']
    assert row['status']=='sin_respaldo' and row['confirmed_on'] is None


def test_owner_cannot_select_another_subject_or_use_commercial_endpoint(api):
    request,context=api
    user,pid,repo,_,_=confirmed(context)
    other=seed()
    response=request('GET',f'/tracking/documents/backing?user_id={user}',headers={'Authorization':f'Bearer {other}'})
    assert response.status_code==200
    assert all(row['status']=='sin_respaldo' for row in response.json()['fields'])
    assert sql(f"SELECT count(*) FROM document_field_evidence WHERE user_id={lit(user)};",role='authenticated',owner=other)=='0'


def test_staff_uses_real_commercial_authorization_before_any_document_read(api,monkeypatch):
    request,context=api
    user,pid,repo,_,_=confirmed(context)
    allowed=seed('ejecutivo');outside=seed('ejecutivo');no_scope=seed('ejecutivo');ordinary=seed()
    actors={
      allowed:{'id':allowed,'role':'ejecutivo','inmobiliaria_id':'tenant-a'},
      outside:{'id':outside,'role':'ejecutivo','inmobiliaria_id':'tenant-b'},
      no_scope:{'id':no_scope,'role':'ejecutivo','inmobiliaria_id':None},
      ordinary:{'id':ordinary,'role':'usuario','inmobiliaria_id':'tenant-a'},
    }
    seen=[];repo.tracking=staff_transport(monkeypatch,actors,{'tenant-a':{user},'tenant-b':set()},seen)
    real=repo.rpc;reads=[]
    def read(name,payload):
        reads.append((name,payload));return real(name,payload)
    monkeypatch.setattr(repo,'rpc',read)
    path=f'/tracking/documents/staff/leads/{user}/backing'
    assert request('GET',path).status_code==401
    for actor in (outside,no_scope,ordinary):
        response=request('GET',path,headers={'Authorization':f'Bearer {actor}'})
        assert response.status_code==403,response.text
    assert reads==[] # No HU23 metadata/financial read occurred before authorization.
    response=request('GET',path,headers={'Authorization':f'Bearer {allowed}'})
    assert response.status_code==200,response.text
    assert response.headers['cache-control']=='no-store'
    assert sql(f'SELECT count(*) FROM document_field_evidence WHERE user_id={lit(user)};',role='authenticated',owner=allowed)=='0'
    with pytest.raises(RuntimeError,match='permission denied'):
        sql(f'SELECT hu23_backing_evidence({lit(user)},false);',role='authenticated',owner=allowed)
    assert ('scope',{'p_lead':user,'p_inmobiliaria':'tenant-a'}) in seen
    assert set(response.json())=={'fields'}
    for row in response.json()['fields']:assert set(row)=={'field','status','confirmed_on'}
    for forbidden in ('1200000','1000000','signed','storage','path','ocr','process_id','source_event','decision','parser','document_type','PERSONA_'):
        assert forbidden not in response.text
    # The actor cannot bypass the commercial path using the owner endpoint.
    assert request('GET','/tracking/documents/backing',headers={'Authorization':f'Bearer {allowed}'}).status_code==404


@pytest.mark.parametrize('role,tenant,allowed',[
    ('admin',None,True),('admin','tenant-b',False),
    ('admin_inmobiliario','tenant-a',True),('admin_inmobiliario',None,False),
])
def test_existing_admin_scope_is_reused_without_expansion(setup,monkeypatch,role,tenant,allowed):
    user,_,repo,_=setup
    actor=seed(role)
    seen=[];repo.tracking=staff_transport(monkeypatch,{actor:{'id':actor,'role':role,'inmobiliaria_id':tenant}},
                                     {'tenant-a':{user},'tenant-b':set()},seen)
    service=DocumentBackingService(repo)
    if allowed:
        assert all(row['status']=='sin_respaldo' for row in service.staff(actor,user)['fields'])
    else:
        with pytest.raises(TrackingError,match='owner_mismatch'):service.staff(actor,user)
