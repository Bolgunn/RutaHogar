import json
from types import SimpleNamespace

import httpx
import pytest

from app.documents.contracts import DocumentError
from app.documents.local_ocr import LocalOcrClient, configured_provider
from app.documents.cleanup import DocumentCleanupService
from app.documents.storage import TemporaryStorage
from app.documents.ocr import OcrService

RESULT = {'document_type': 'liquidacion_sueldo', 'parser_version': 'deterministic-v1',
          'normalizer_version': 'clp-calendar-v1', 'candidates': [
              {'field': 'ingreso_mensual', 'value': 1200000.0, 'detection': 'detected', 'page': 1}]}


@pytest.fixture
def local_config(monkeypatch):
    monkeypatch.setenv('HU23_LOCAL_OCR_URL', 'http://127.0.0.1:8011')
    monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN', 'synthetic-test-only-token-32-characters')


def test_azure_is_default_invalid_provider_fails_closed(monkeypatch):
    monkeypatch.delenv('HU23_OCR_PROVIDER', raising=False)
    assert configured_provider() == 'azure'
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'other')
    with pytest.raises(DocumentError): configured_provider()


def test_provider_consent_race_aborts_before_any_io(monkeypatch):
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'azure')
    repo = SimpleNamespace(rpc=lambda *args, **kwargs: pytest.fail('mismatched consent performed I/O'))
    with pytest.raises(DocumentError, match='ocr_provider_mismatch'):
        OcrService(repo).start('owner', 'process', expected_provider='local')


def test_cleanup_is_pinned_even_if_configuration_is_invalid(monkeypatch):
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'invalid')
    repo = SimpleNamespace(rpc=lambda *args, **kwargs: {'job': {'provider': 'local'}})
    assert OcrService(repo)._provider('owner', 'process', cleanup=True) == 'local'


@pytest.mark.parametrize('url', ['http://remote.invalid', 'https://name:secret@worker.invalid',
    'https://worker.invalid/path', 'https://worker.invalid?token=secret'])
def test_worker_configuration_rejects_unsafe_transport(local_config, monkeypatch, url):
    monkeypatch.setenv('HU23_LOCAL_OCR_URL', url)
    with pytest.raises(DocumentError, match='local_ocr_unavailable'): LocalOcrClient()


@pytest.mark.parametrize('change', [None, {'extra': 'raw OCR'}, {'result': {**RESULT, 'content': 'raw OCR'}},
    {'result': {**RESULT, 'document_type': 'certificado_ahorro'}}, {'method': 'unknown'}, {'elapsed_ms': '1'}])
def test_client_only_accepts_minimal_shared_contract(local_config, change):
    body = {'result': RESULT, 'method': 'embedded_text', 'elapsed_ms': 10}
    if change: body.update(change)
    def respond(request):
        assert request.headers['Authorization'].startswith('Bearer synthetic-test-only')
        return httpx.Response(200, json=body)
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        client = LocalOcrClient(client=http)
        if change:
            with pytest.raises(DocumentError, match='local_ocr_unavailable'):
                client.parse('http://not-logged', 'liquidacion_sueldo', '2026-10-25')
        else:
            assert client.parse('http://not-logged', 'liquidacion_sueldo', '2026-10-25').candidates[0].value == 1200000


@pytest.mark.parametrize('status', [302, 401, 429, 500])
def test_failure_is_recoverable_redacted_and_never_calls_azure(local_config, status, monkeypatch):
    monkeypatch.setattr('app.documents.azure.AzureOcrClient', lambda **kw: pytest.fail('implicit Azure fallback'))
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, text='SECRET URL OCR'))) as http:
        with pytest.raises(DocumentError, match='^local_ocr_unavailable$'):
            LocalOcrClient(client=http).parse('http://secret', 'liquidacion_sueldo', '2026-10-25')


@pytest.mark.parametrize('rotation,attempts,valid', [(90, 2, True), (0, 0, True),
    (45, 2, False), (True, 2, False), (90, 9, False), (90, True, False)])
def test_worker_rotation_metadata_is_bounded_and_not_persisted(local_config, rotation, attempts, valid):
    body = {'result': RESULT, 'method': 'tesseract', 'elapsed_ms': 10, 'rotation': rotation, 'ocr_attempts': attempts}
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as http:
        client = LocalOcrClient(client=http)
        if valid:
            result = client.parse('http://synthetic', 'liquidacion_sueldo', '2026-10-25')
            assert 'rotation' not in result.model_dump()
        else:
            with pytest.raises(DocumentError, match='local_ocr_unavailable'):
                client.parse('http://synthetic', 'liquidacion_sueldo', '2026-10-25')


def test_rotation_log_contains_only_technical_metadata(local_config, caplog):
    body = {'result': RESULT, 'method': 'tesseract', 'elapsed_ms': 10, 'rotation': 90, 'ocr_attempts': 2}
    with caplog.at_level('INFO', logger='app.documents.local_ocr'):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as http:
            LocalOcrClient(client=http).parse('https://private.invalid/?token=sensitive', 'liquidacion_sueldo', '2026-10-25')
    assert 'rotation=90' in caplog.text and 'ocr_attempts=2' in caplog.text
    assert 'sensitive' not in caplog.text and '1200000' not in caplog.text


def test_cleanup_of_local_job_never_initializes_azure(monkeypatch):
    monkeypatch.setattr('app.documents.cleanup.AzureOcrClient', lambda **kw: pytest.fail('local cleanup called Azure'))
    repo = SimpleNamespace(rpc=lambda *args, **kwargs: pytest.fail('local cleanup did I/O'))
    assert DocumentCleanupService(repo)._delete_azure({'provider': 'local'}) == {'outcome': 'deleted'}


def test_local_worker_can_use_loopback_signed_read_without_public_tunnel(monkeypatch):
    monkeypatch.delenv('HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN', raising=False)
    path = 'owner/process/opaque.pdf'
    def respond(request):
        return httpx.Response(200, json={'signedURL': '/object/sign/hu23-document-temporary/' + path + '?token=synthetic'})
    with httpx.Client(base_url='http://127.0.0.1:54321', transport=httpx.MockTransport(respond)) as http:
        repo = SimpleNamespace(tracking=SimpleNamespace(url='http://127.0.0.1:54321', key='synthetic', client=http))
        assert TemporaryStorage(repo).signed_read(path, local_worker=True).startswith('http://127.0.0.1:54321/')
        with pytest.raises(DocumentError, match='storage_unavailable'):
            TemporaryStorage(repo).signed_read(path)

@pytest.mark.parametrize('suffix', ['\r', '\n', ' ', '\t'])
def test_worker_token_with_invisible_whitespace_is_rejected(local_config, monkeypatch, suffix):
    monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN', 'synthetic-test-only-token-32-characters' + suffix)
    with pytest.raises(DocumentError, match='local_ocr_unavailable'):
        LocalOcrClient()
