"""No network: scheduler transport must never echo secrets or unexpected response data."""
import importlib.util
import io
import json
from pathlib import Path
from urllib.error import HTTPError, URLError

import pytest

spec=importlib.util.spec_from_file_location('hu23_cleanup_runner',Path(__file__).resolve().parents[3]/'scripts/run-hu23-cleanup.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
URL='https://synthetic.invalid/tracking/documents/cleanup'
SECRET='synthetic-secret'


def report(**kwargs):
    return {'busy':False,'storage_deleted':1,'azure_deleted':1,'failed':0,'retried':0,**kwargs}


class Response(io.BytesIO):
    status=200


class Opener:
    def __init__(self, body): self.body=body;self.requests=[]
    def open(self, request, timeout):
        self.requests.append(request)
        assert timeout==55 and request.get_method()=='POST'
        assert request.get_header('Authorization')=='Bearer '+SECRET
        return Response(self.body)


def test_scheduler_reports_only_typed_aggregate_allowlist():
    opener=Opener(json.dumps(report(storage_path='PRIVATE',ocr='PRIVATE',key='PRIVATE')).encode())
    assert runner.invoke(URL,SECRET,opener=opener)==report()
    assert opener.requests[0].full_url==URL


@pytest.mark.parametrize('endpoint',[URL.replace('https:','http:'),URL+'?key=PRIVATE',URL+'#PRIVATE',
    URL.replace('synthetic.invalid','secret@synthetic.invalid'),URL.replace('cleanup','other'),'',URL+'\n',URL.replace('.invalid','.invalid:80')])
def test_scheduler_rejects_unsafe_endpoint(endpoint):
    with pytest.raises(runner.CleanupInvocationError,match='invalid_configuration'):
        runner.invoke(endpoint,SECRET)


def test_scheduler_does_not_follow_redirect_with_bearer():
    handler=runner.NoRedirect()
    assert handler.redirect_request(None,None,302,'redirect',{},'https://attacker.invalid') is None


@pytest.mark.parametrize('body',[b'PRIVATE',b'[]',b'{}',b'x'*65537,
    json.dumps(report(storage_deleted='PRIVATE')).encode(),json.dumps(report(failed=True)).encode()])
def test_scheduler_invalid_body_is_redacted(body):
    with pytest.raises(runner.CleanupInvocationError,match='invalid_response') as caught:
        runner.invoke(URL,SECRET,opener=Opener(body))
    assert 'PRIVATE' not in str(caught.value)


def test_scheduler_bounds_retries_and_never_prints_http_error_body():
    messages=[];sleeps=[]
    class Failed:
        def open(self, *args, **kwargs):
            raise HTTPError(URL,503,'PRIVATE',{},io.BytesIO(b'PRIVATE'))
    def call(*args):return runner.invoke(*args,opener=Failed())
    assert runner.run(URL,SECRET,call=call,sleep=sleeps.append,emit=messages.append)==1
    assert sleeps==[5,10,20] and 'PRIVATE' not in str(messages) and SECRET not in str(messages)


def test_scheduler_drains_bounded_batches_and_allows_replay():
    values=iter([report(batch_full=True),report()]);messages=[]
    assert runner.run(URL,SECRET,call=lambda *args:next(values),sleep=lambda _:None,emit=messages.append)==0
    assert len(messages)==2


@pytest.mark.parametrize('field',['overdue_originals','unresolved_submissions'])
def test_scheduler_alerts_on_unresolved_retention(field):
    assert runner.run(URL,SECRET,call=lambda *args:report(**{field:1}),emit=lambda _:None)==1


def test_scheduler_fails_if_obligations_remain_in_backoff():
    assert runner.run(URL,SECRET,call=lambda *args:report(pending_originals=1),sleep=lambda _:None,emit=lambda _:None)==1
