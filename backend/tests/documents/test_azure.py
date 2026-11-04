"""Synthetic HTTP fixtures only. No credentials or external calls."""
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

from app.documents.azure import AzureOcrClient, OcrError, ROOT, API_VERSION, MODEL, retry_seconds
from app.documents.storage import TemporaryStorage

ENDPOINT='https://ocr.synthetic.invalid'
RESULT=str(uuid4())
LOCATION=f'{ENDPOINT}{ROOT}/analyzeResults/{RESULT}?api-version={API_VERSION}'


def client(handler):
    return AzureOcrClient(endpoint=ENDPOINT,key='synthetic-key',
        client=httpx.Client(transport=httpx.MockTransport(handler)))


def layout():
    return {'status':'succeeded','analyzeResult':{'apiVersion':API_VERSION,'modelId':MODEL,
        'content':'SYNTHETIC OCR NOT FOR PERSISTENCE','pages':[{'pageNumber':1}]}}


def test_azure_begin_poll_delete_are_separate_http_calls():
    calls=[]
    def respond(request):
        calls.append(request)
        assert request.headers['Ocp-Apim-Subscription-Key']=='synthetic-key'
        assert request.url.params['api-version']==API_VERSION
        if request.method=='POST':
            assert json.loads(request.content)=={'urlSource':'https://storage.synthetic.invalid/private?token=temporary'}
            return httpx.Response(202,headers={'Operation-Location':LOCATION,'Retry-After':'7'})
        if request.method=='GET':return httpx.Response(200,json=layout())
        return httpx.Response(204)
    azure=client(respond)
    started=azure.begin('https://storage.synthetic.invalid/private?token=temporary')
    assert str(started.result_id)==RESULT and started.retry_after==7
    assert len(calls)==1 # No poll loop in submit.
    assert azure.poll(RESULT)[0].analyzeResult['content'].startswith('SYNTHETIC')
    azure.delete(RESULT)
    assert [r.method for r in calls]==['POST','GET','DELETE']


@pytest.mark.parametrize('location',[
    'https://attacker.invalid/result', 'http://ocr.synthetic.invalid/anything',
    LOCATION.replace(MODEL,'arbitrary-model'), LOCATION.replace(RESULT,'../../secret'),
    LOCATION+'&unexpected=1',
])
def test_operation_location_is_not_followed_or_persisted(location):
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(202,headers={'Operation-Location':location})
    with pytest.raises(OcrError,match='^submission_unknown$'):
        client(respond).begin('https://storage.synthetic.invalid/temporary')
    assert len(calls)==1


@pytest.mark.parametrize('method,status,code',[
    ('begin',429,'transient'),('begin',503,'submission_unknown'),
    ('begin',400,'provider_failed'),('poll',429,'transient'),('poll',503,'transient'),
    ('poll',404,'provider_failed'),('delete',503,'transient'),('delete',404,'not_found'),
])
def test_status_errors_are_sanitized_and_retry_after_is_preserved(method,status,code):
    azure=client(lambda _:httpx.Response(status,headers={'Retry-After':'19'},json={'message':'sensitive provider details'}))
    with pytest.raises(OcrError) as caught:
        getattr(azure,method)(RESULT if method!='begin' else 'https://source.invalid')
    assert str(caught.value)==code
    if code=='transient':assert caught.value.retry_after==19


@pytest.mark.parametrize('method,exception,code',[
    ('begin',httpx.ReadTimeout,'submission_unknown'),
    ('begin',httpx.ConnectTimeout,'transient'),
    ('poll',httpx.ReadTimeout,'transient'),
    ('delete',httpx.ReadTimeout,'transient'),
])
def test_timeout_semantics_prevent_duplicate_submissions(method,exception,code):
    def respond(request):raise exception('never expose signed URL or key',request=request)
    with pytest.raises(OcrError,match=f'^{code}$'):
        getattr(client(respond),method)(RESULT if method!='begin' else 'https://source.invalid')


@pytest.mark.parametrize('body',[{}, {'status':'succeeded'}, {'status':'unexpected'},
    {'status':'succeeded','analyzeResult':{'apiVersion':API_VERSION,'modelId':MODEL,'content':'x','pages':[{}, {}, {}]}}])
def test_untrusted_azure_response_must_have_valid_envelope(body):
    with pytest.raises(OcrError,match='^invalid_response$'):
        client(lambda _:httpx.Response(200,json=body)).poll(RESULT)


def test_retry_after_supports_http_date_and_minimum_interval():
    now=datetime(2026,10,25,12,tzinfo=timezone.utc)
    assert retry_seconds('Sun, 25 Oct 2026 12:00:30 GMT',now)==31
    assert retry_seconds(None,now)==2
    assert retry_seconds('0',now)==2


def test_signed_read_is_server_only_exact_and_short():
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'signedURL':'/object/sign/hu23-document-temporary/owner/process/object.pdf?token=synthetic'})
    with httpx.Client(base_url='https://storage.synthetic.invalid',transport=httpx.MockTransport(respond)) as http:
        repo=SimpleNamespace(tracking=SimpleNamespace(url='https://storage.synthetic.invalid',key='server-test-key',client=http))
        url=TemporaryStorage(repo).signed_read('owner/process/object.pdf')
    assert url.startswith('https://storage.synthetic.invalid/storage/v1/object/sign/')
    assert calls[0].method=='POST' and json.loads(calls[0].content)=={'expiresIn':300}


def test_signed_read_rejects_provider_url_to_other_host():
    with httpx.Client(base_url='https://storage.synthetic.invalid',transport=httpx.MockTransport(
            lambda _:httpx.Response(200,json={'signedURL':'https://attacker.invalid/secret'}))) as http:
        repo=SimpleNamespace(tracking=SimpleNamespace(url='https://storage.synthetic.invalid',key='server-test-key',client=http))
        from app.documents.contracts import DocumentError
        with pytest.raises(DocumentError,match='^storage_unavailable$'):
            TemporaryStorage(repo).signed_read('owner/process/object.pdf')


def test_provider_diagnostics_keep_only_safe_codes():
    from app.documents.azure import provider_error
    error=provider_error('provider_failed',400,json.dumps({'error':{'code':'InvalidRequest',
        'innererror':{'code':'InvalidContentSource','message':'SENSITIVE SIGNED URL AND KEY'}}}).encode())
    assert error.status==400 and error.provider_code=='InvalidContentSource'
    assert str(error)=='provider_failed' and error.reason=='azure_http_error'
    assert 'SENSITIVE' not in repr(vars(error))
    assert provider_error('provider_failed',400,b'{"error":{"code":{}}}').provider_code=='other'


@pytest.mark.parametrize('exception,reason', [(httpx.ConnectError,'azure_unreachable'),
    (httpx.ConnectTimeout,'azure_connect_timeout'),(httpx.ReadTimeout,'azure_timeout')])
def test_transport_diagnostics_distinguish_unreachable_and_timeouts(exception,reason):
    def respond(request):raise exception('SENSITIVE URL',request=request)
    with pytest.raises(OcrError) as caught:client(respond).begin('https://source.invalid')
    assert caught.value.reason==reason
    assert 'SENSITIVE' not in str(caught.value)


def test_oversized_ocr_response_is_rejected_without_returning_raw_text():
    from app.documents.azure import MAX_RESPONSE_BYTES
    with pytest.raises(OcrError,match='^invalid_response$'):
        client(lambda _:httpx.Response(200,content=b'x'*(MAX_RESPONSE_BYTES+1))).poll(RESULT)


@pytest.mark.parametrize('status',[404,410])
def test_cleanup_probe_accepts_confirmed_operation_absence(status):
    azure=client(lambda request:httpx.Response(status))
    assert azure.probe(RESULT)[0] is None


@pytest.mark.parametrize('state',['running','notStarted','succeeded','failed'])
def test_cleanup_probe_reads_only_status_without_requiring_layout(state):
    azure=client(lambda request:httpx.Response(200,json={'status':state,'analyzeResult':{'content':'DISCARDED OCR'}}))
    assert azure.probe(RESULT)[0]==state


@pytest.mark.parametrize('status',[429,503])
def test_cleanup_probe_respects_provider_backpressure(status):
    azure=client(lambda request:httpx.Response(status,headers={'Retry-After':'3600'}))
    with pytest.raises(OcrError) as caught:azure.probe(RESULT)
    assert caught.value.retry_after==3600 and caught.value.code=='transient'
