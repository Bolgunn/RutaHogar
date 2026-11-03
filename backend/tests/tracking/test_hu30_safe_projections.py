from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest

from app.tracking.co_debtor import FINANCIAL_FIELDS
from app.tracking.co_debtor_projection import project_evaluation
from app.tracking.co_debtor_access import project_row
from app.tracking.contracts import TrackingError
from app.tracking.owner_reads import OwnerReadService
from app.tracking.repository import TrackingRepository
from app.tracking.staff import StaffLeadService
from test_service import command, service, valid_snapshot
from test_bipersonal_evaluation import modern_facts
from test_staff_co_debtor_projection import LEAD_ID, OUTSIDE_LEAD_ID

NOW = datetime(2026, 10, 22, tzinfo=timezone.utc)


def fixture(debt=0, savings=100000000):
    memory, tracking = service()
    memory.co_debtor_consent = modern_facts(deuda_mensual_complementario=debt)
    tracking.execute(LEAD_ID, command({**valid_snapshot(), 'complemento_renta': True, 'relacion_complementario': 'conyuge',
        **{f: memory.co_debtor_consent['co_debtor_confirmed'][f] for f in FINANCIAL_FIELDS}, 'ahorro_disponible': savings}))
    row = {**memory.bundle['evaluations'][0], 'user_id': LEAD_ID, 'created_at': '2026-10-01T00:00:00Z'}
    revision = {**memory.co_debtor_consent['co_debtor_confirmed'], 'confirmed_at': '2026-09-01T00:00:00Z'}
    old = {**revision, 'id': 'v1', 'revision_number': 1, 'accepted_relation_event_id': 'relation-1'}
    item = {'id': 'participation', 'lead_id': LEAD_ID, 'status': 'confirmed', 'participant_user_id': 'participant',
            'created_at': '2026-08-01T00:00:00Z', 'recipient_email': 'private@test.invalid', 'recipient_rut': '12345678-5',
            'co_debtor_confirmations': [revision, old], 'co_debtor_consent_events': [
                {'id': 'relation-1', 'relation_revision': 1, 'relation_value': 'pareja_conviviente'},
                {'id': 'relation-2', 'relation_revision': 2, 'relation_value': 'conyuge'}]}
    return row, item


def closed(item, status, at):
    item['status'] = status
    item['co_debtor_consent_events'].append({'event_type': status, 'occurred_at': at.isoformat()})


class Repository:
    def __init__(self, row=None, item=None):
        row, item = (row, item) if row else fixture()
        self.rows, self.invitations = [row], [item]
        self.tenant = 'tenant-1'
        self.other_calls = []
    def staff_actor(self, token):
        return {'id': 'staff', 'role': token if token in {'admin', 'admin_inmobiliario', 'usuario'} else 'ejecutivo',
                'inmobiliaria_id': None if token == 'admin' else self.tenant}
    def staff_can_access(self, actor, lead):
        return lead == LEAD_ID and (actor['inmobiliaria_id'] == 'tenant-1' or actor['role'] == 'admin')
    def staff_evaluations(self, actor):
        return deepcopy(self.rows) if self.staff_can_access(actor, LEAD_ID) else []
    def staff_contacts(self, ids):
        return {}
    def staff_lead_evaluations(self, lead):
        return deepcopy(self.rows)
    def co_debtor_rows(self, ids):
        return deepcopy(self.invitations)
    def owner_evaluations(self, user):
        return deepcopy(self.rows)
    def owner_annotations(self, user):
        return []
    def staff_history(self, user):
        return [{'id': 'history', 'evaluation_id': row['id'], 'user_id': row['user_id'], 'snapshot': deepcopy(row['financial_data']),
                 'score': row['financial_data']['result']['score'], 'created_at': row['created_at']} for row in self.rows]
    def other_active_participations(self, items):
        self.other_calls.append(deepcopy(items))
        return {item['id']: True for item in items}


def test_owner_replacement_reads_current_declared_relation_without_unredacting_history():
    row, item = fixture()
    row['financial_data']['provenance'] = {'co_debtor_consent': {'complement_source': 'lead_declared'}}
    row['financial_data']['result']['bipersonal_summary']['evaluation_type'] = 'declared_complement'
    reads = OwnerReadService(Repository(row, item), LEAD_ID, NOW)
    assert list(reads.invitations_view())[0]['declared_relation'] == 'conyuge'
    assert 'relacion_complementario' not in reads.evaluations()['items'][0]['financial_data']['input']
    closed(item, 'revoked', NOW - timedelta(days=31))
    reads = OwnerReadService(Repository(row, item), LEAD_ID, NOW)
    assert 'declared_relation' not in list(reads.invitations_view())[0]


@pytest.mark.parametrize('debt,savings,sign', [(0,100000000,1),(0,1000000,0),(1800000,100000000,-1)])
def test_owner_and_staff_use_persisted_contribution_without_scoring(debt, savings, sign):
    row, item = fixture(debt, savings)
    repo = Repository(row, item)
    before = deepcopy((row,item))
    owner = OwnerReadService(repo, LEAD_ID, NOW).evaluations()['items'][0]['co_debtor']
    staff = StaffLeadService(repo, clock=lambda: NOW).lead_detail('ejecutivo', LEAD_ID)['co_debtor']
    for view in (owner, staff):
        assert view['evaluation_type'] == 'bipersonal_confirmed'
        assert view['used_revision'] == {'id':'confirmed-v2','revision_number':2}
        assert view['bipersonal_summary'] == row['financial_data']['result']['bipersonal_summary']
        delta = view['capacity']['delta']['purchase_capacity_uf']
        assert (delta > 0) - (delta < 0) == sign
        assert view['relation']['value'] == 'conyuge'
        assert view['relation']['initial_accepted_value'] == 'pareja_conviviente'
        assert view['relation']['modified_after_acceptance']
        assert view['co_debtor']['income'] == 1500000
        assert view['co_debtor']['debt'] == debt
    assert 'has_other_active_participations' not in owner
    assert staff['has_other_active_participations'] is True
    assert (row,item) == before


def test_current_revision_is_not_substituted_into_commercial_historical_financials():
    row,item=fixture()
    item['co_debtor_confirmations'].append({**item['co_debtor_confirmations'][0], 'id':'v3','revision_number':3,'ingreso_mensual_complementario':9900000})
    repo=Repository(row,item)
    owner=OwnerReadService(repo,LEAD_ID,NOW).evaluations()['items'][0]['co_debtor']
    staff=StaffLeadService(repo,clock=lambda:NOW).lead_detail('ejecutivo',LEAD_ID)['co_debtor']
    assert owner['update_required'] and owner['current_revision']['id']=='v3'
    assert staff['used_revision']['id']=='confirmed-v2' and staff['co_debtor']['income']==1500000
    assert '9900000' not in str(staff)
    assert 'current_revision' not in staff


def test_matching_confirmation_is_labelled_without_upgrading_the_old_evaluation():
    row,item=fixture()
    row['financial_data']['provenance']={'co_debtor_consent':{'complement_source':'lead_declared'}}
    row['financial_data']['result']['bipersonal_summary']['evaluation_type']='declared_complement'
    view=project_evaluation(row['financial_data'],[item],NOW,owner=True)
    assert view['evaluation_type']=='declared_complement'
    assert view['matching_confirmed_later'] and not view['update_required']
    assert view['message']=='Antecedentes coincidentes confirmados posteriormente'
    assert view['used_revision'] is None and view['bipersonal_summary'] is None


@pytest.mark.parametrize('status',['revoked','replaced'])
@pytest.mark.parametrize('days,visible',[(29,True),(30,False),(31,False)])
def test_historical_cutoff_applies_identically_to_list_detail_history_owner_and_tracking(status,days,visible):
    row,item=fixture()
    closed(item,status,NOW-timedelta(days=days))
    repo=Repository(row,item)
    staff=StaffLeadService(repo,clock=lambda:NOW)
    owner=OwnerReadService(repo,LEAD_ID,NOW)
    views=[staff.evaluations('ejecutivo')['items'][0]['co_debtor'],staff.lead_detail('ejecutivo',LEAD_ID)['co_debtor'],
           owner.evaluations()['items'][0]['co_debtor'],owner.history()['items'][0]['co_debtor']]
    tracking=owner.tracking_view({'current_evaluation_id':row['id'],'current_evaluation':row['financial_data']['result'],
                                 'latest_effective_snapshot':row['financial_data']['input']})
    views.append(tracking['co_debtor'])
    for view in views:
        assert view['evaluation_type']=='bipersonal_confirmed'
        assert (view['visibility']=='visible') is visible
        assert view['historical_visible_until']==(NOW-timedelta(days=days)+timedelta(days=30)).isoformat()
        assert view['warnings']
        assert view['co_debtor'] is not None if visible else view['co_debtor'] is None
        assert not view.get('update_required')
    if not visible:
        serialized=str({'staff':staff.lead_detail('ejecutivo',LEAD_ID),'owner':owner.evaluations(),'tracking':tracking,'invitations':list(owner.invitations_view())})
        for secret in ('1500000','private@test.invalid','12345678-5','pareja_conviviente'):
            assert secret not in serialized
        assert not repo.other_calls
    assert row['financial_data']['result']['bipersonal_summary']['evaluation_type']=='bipersonal_confirmed'


def test_later_revocation_does_not_restart_replacement_cutoff():
    row,item=fixture()
    closed(item,'replaced',NOW-timedelta(days=31))
    closed(item,'revoked',NOW-timedelta(days=1))
    view=project_evaluation(row['financial_data'],[item],NOW)
    assert view['visibility']=='hidden'
    assert view['historical_visible_until']==(NOW-timedelta(days=1)).isoformat()
    assert view['warnings'][0]=='historical_participation_replaced'


def test_missing_closure_time_hides_immediately_without_fabricated_grace():
    row,item=fixture()
    item['status']='revoked'
    view=project_evaluation(row['financial_data'],[item],NOW)
    assert view['visibility']=='hidden' and view['historical_visible_until'] is None


@pytest.mark.parametrize('kind',['individual','declared_complement','unverifiable_origin'])
def test_classification_is_server_resolved_for_nonverified_and_legacy(kind):
    row,item=fixture()
    if kind=='individual':
        row['financial_data']={'input':{'ingreso_mensual':1000000,'complemento_renta':False},'result':{'score':50}}
    elif kind=='declared_complement':
        row['financial_data']['provenance']={'co_debtor_consent':{'complement_source':'lead_declared'}}
    else:
        row['financial_data'].pop('provenance')
    original=deepcopy(row)
    view=project_evaluation(row['financial_data'],[item],NOW,owner=True)
    assert view['evaluation_type']==kind
    assert view['bipersonal_summary'] is None and view['capacity'] is None
    assert row==original


def test_other_lead_and_other_tenant_are_denied_before_financial_reads():
    repo=Repository()
    assert OwnerReadService(repo,OUTSIDE_LEAD_ID,NOW).evaluations()['items']==[]
    assert OwnerReadService(repo,OUTSIDE_LEAD_ID,NOW).history()['items']==[]
    assert list(OwnerReadService(repo,OUTSIDE_LEAD_ID,NOW).invitations_view())==[]
    repo.tenant='tenant-2'
    staff=StaffLeadService(repo,clock=lambda:NOW)
    assert staff.evaluations('ejecutivo')['items']==[]
    with pytest.raises(TrackingError,match='owner_mismatch'):
        staff.lead_detail('ejecutivo',LEAD_ID)
    assert not repo.other_calls


@pytest.mark.parametrize('role',['ejecutivo','admin_inmobiliario','admin'])
def test_existing_authorized_roles_keep_the_same_contract(role):
    repo=Repository()
    assert StaffLeadService(repo,clock=lambda:NOW).lead_detail(role,LEAD_ID)['co_debtor']['used_revision']['id']=='confirmed-v2'
    with pytest.raises(TrackingError):
        StaffLeadService(repo).lead_detail('usuario',LEAD_ID)


def test_other_participations_query_returns_only_a_boolean_and_no_third_party_finances():
    repo=object.__new__(TrackingRepository)
    source={'id':'mine','lead_id':LEAD_ID,'participant_user_id':'actor'}
    other={'id':'private-id','lead_id':OUTSIDE_LEAD_ID,'participant_user_id':'actor',
           'co_debtor_confirmations':[{'id':'private-revision','participant_user_id':'actor','accepted_relation_event_id':'r','confirmed_at':'2026-09-01T00:00:00Z'}],
           'co_debtor_consent_events':[]}
    calls=[]
    repo.request=lambda method,path: calls.append(parse_qs(urlsplit(path).query)) or [other]
    assert repo.other_active_participations([source])=={'mine':True}
    assert 'ingreso' not in str(calls) and 'recipient' not in str(calls)
    other['co_debtor_consent_events']=[{'event_type':'revoked','occurred_at':NOW.isoformat()}]
    assert repo.other_active_participations([source])=={'mine':False}
    other['co_debtor_consent_events']=[];other['id']='mine';other['lead_id']=LEAD_ID
    assert repo.other_active_participations([source])=={'mine':False}


def test_redaction_removes_derived_numbers_nested_narratives_and_future_result_fields():
    row,item=fixture()
    closed(item,'revoked',NOW-timedelta(days=31))
    result=row['financial_data']['result']
    result.update(new_derived_field=123456789,component_scores={'capacidad_pago':99},shap_top_factors=[{'income':1500000}],
                  executive_summary_deterministic='Co-deudor 1500000',housing_benefits={'income':1500000})
    row['events']=[{'details':'1500000'}]
    redacted=project_row(row,[item],NOW)
    serialized=str(redacted)
    for secret in ('123456789','1500000','capacidad_pago','shap_top_factors','housing_benefits','ingreso_total','deuda_total','bipersonal_summary'):
        assert secret not in serialized
    assert redacted['financial_data']['result']['score']==result['score']
    assert result['new_derived_field']==123456789


def test_risks_are_existing_codes_and_general_debt_is_not_attributed_to_the_co_debtor():
    row,item=fixture()
    row['financial_data']['result']['blockers']=[{'code':'carga_total_alta','severity':'high','description':'private'},
        {'code':'complemento_debil','severity':'medium'}, {'code':'invented','description':'unknown'}]
    risks=project_evaluation(row['financial_data'],[item],NOW)['risks']
    assert risks==[{'code':'carga_total_alta','severity':'high','scope':'evaluation'},
                  {'code':'complemento_debil','severity':'medium','scope':'co_debtor'}]


def test_a_new_participation_never_restores_visibility_of_a_closed_snapshot():
    row,item=fixture()
    closed(item,'revoked',NOW-timedelta(days=31))
    replacement=deepcopy(item);replacement.update(id='replacement',status='confirmed',created_at='2026-10-21T00:00:00Z')
    replacement['co_debtor_confirmations']=[{**c,'id':'new-'+c['id']} for c in replacement['co_debtor_confirmations']]
    replacement['co_debtor_consent_events']=[e for e in replacement['co_debtor_consent_events'] if 'relation_revision' in e]
    view=project_evaluation(row['financial_data'],[item,replacement],NOW,owner=True)
    assert view['visibility']=='hidden' and view['used_revision']['id']=='confirmed-v2'
    assert view['current_participation']['id']=='replacement'


def test_reading_projections_never_calls_financial_engine_or_ai(monkeypatch):
    repo=Repository()
    def forbidden(*args,**kwargs):
        raise AssertionError('Read projection attempted financial/AI calculation')
    monkeypatch.setattr('app.scoring.calculate_score',forbidden)
    monkeypatch.setattr('app.scoring_engine.purchase_capacity.capacity_limits',forbidden)
    monkeypatch.setattr('app.ai.generate_user_explanation',forbidden)
    OwnerReadService(repo,LEAD_ID,NOW).evaluations()
    StaffLeadService(repo,clock=lambda:NOW).lead_detail('ejecutivo',LEAD_ID)


def test_boolean_batch_does_not_truncate_other_participations_at_default_rest_page_size():
    repo=object.__new__(TrackingRepository)
    calls=[]
    actor={'id':'mine','lead_id':LEAD_ID,'participant_user_id':'actor'}
    other={'id':'last','lead_id':OUTSIDE_LEAD_ID,'participant_user_id':'actor',
           'co_debtor_confirmations':[{'participant_user_id':'actor','accepted_relation_event_id':'r'}], 'co_debtor_consent_events':[]}
    def request(method,path):
        params=parse_qs(urlsplit(path).query);calls.append(params)
        return [dict(other,id='mine',lead_id=LEAD_ID)]*1000 if params['offset']==['0'] else [other]
    repo.request=request
    assert repo.other_active_participations([actor])=={'mine':True}
    assert len(calls)==2 and calls[-1]['offset']==['1000']


def test_tracking_result_aliases_are_also_redacted_after_cutoff():
    row,item=fixture();closed(item,'revoked',NOW-timedelta(days=31))
    row['financial_data']['result']['future_derived_field']=987654321
    owner=OwnerReadService(Repository(row,item),LEAD_ID,NOW)
    output=owner.tracking_view({'current_evaluation_id':row['id'],'current_evaluation':row['financial_data']['result'],
        'active_line':[{'evaluation_id':row['id'],'evaluation':row['financial_data']['result']}]})
    assert '987654321' not in str(output)
    assert output['co_debtor']['evaluation_type']=='bipersonal_confirmed'


@pytest.mark.parametrize('snapshot',[
    {'input':{'complemento_renta':False,'complemento_ingreso_mensual':1500000}},
    {'input_snapshot':{'complemento_deuda_mensual':123456}},
    {'result':{'bipersonal_summary':{'evaluation_type':'bipersonal_confirmed'}}},
    {'provenance':{'co_debtor_consent':{'complement_source':'co_debtor_confirmed'}}},
])
def test_legacy_partial_aliases_are_not_misclassified_as_individual_or_exposed(snapshot):
    row={'user_id':LEAD_ID,'financial_data':snapshot}
    output=project_row(row,[],NOW,owner=True)
    view=project_evaluation(snapshot,[],NOW,owner=True)
    assert output['co_debtor_visibility']=='hidden'
    assert view['evaluation_type']=='unverifiable_origin'
    assert view['capacity'] is None
    assert '1500000' not in str(output) and '123456' not in str(output)


def test_unknown_revocation_time_warns_revocation_and_never_offers_future_incorporation():
    row,item=fixture()
    item['co_debtor_consent_events'].append({'event_type':'revoked'})
    view=project_evaluation(row['financial_data'],[item],NOW,owner=True)
    assert view['visibility']=='hidden'
    assert view['warnings'][0]=='historical_consent_revoked'
    assert 'closure_time_unknown' in view['warnings']
    assert not view['update_required'] and view['current_revision'] is None


def test_unknown_summary_version_is_not_recalculated_or_interpreted_as_a_known_contribution():
    row,item=fixture()
    row['financial_data']['result']['bipersonal_summary']['version']='unknown-future-format'
    view=project_evaluation(row['financial_data'],[item],NOW)
    assert view['evaluation_type']=='bipersonal_confirmed'
    assert view['bipersonal_summary'] is None and view['capacity'] is None


def test_batched_queries_bound_uri_size_without_a_request_per_lead():
    from uuid import UUID
    repo=object.__new__(TrackingRepository)
    ids=[str(UUID(int=n+1)) for n in range(101)]
    calls=[]
    repo.request=lambda method,path: calls.append(path) or []
    assert repo.co_debtor_rows(ids)==[]
    assert len(calls)==2 and max(map(len,calls))<8000
    calls.clear()
    assert not any(repo.other_active_participations([{'id':key,'lead_id':key,'participant_user_id':key} for key in ids]).values())
    assert len(calls)==2 and max(map(len,calls))<8000


def test_other_participations_names_the_invitation_foreign_keys_after_revision_linking():
    repo = object.__new__(TrackingRepository)
    queries = []
    repo.request = lambda method, path: queries.append(parse_qs(urlsplit(path).query)) or []
    assert repo.other_active_participations([{'id': 'mine', 'participant_user_id': 'actor'}]) == {'mine': False}
    selection = queries[0]['select'][0]
    assert 'co_debtor_confirmations!co_debtor_confirmations_invitation_id_fkey(' in selection
    assert 'co_debtor_consent_events!co_debtor_consent_events_invitation_id_fkey(' in selection


def test_postgrest_multiple_choices_is_a_persistence_error_not_a_collection(monkeypatch):
    import httpx
    from app.tracking.contracts import TrackingError
    monkeypatch.setenv('SUPABASE_URL', 'http://local.invalid')
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'local-test-only')
    client = httpx.Client(base_url="http://local.invalid", transport=httpx.MockTransport(lambda request: httpx.Response(
        300, json={'code': 'PGRST201', 'message': 'Ambiguous relationship'})))
    with client:
        repo = TrackingRepository(client=client)
        with pytest.raises(TrackingError) as failure:
            repo.request('GET', '/rest/v1/co_debtor_invitations')
        assert failure.value.code == 'persistence_unavailable'
