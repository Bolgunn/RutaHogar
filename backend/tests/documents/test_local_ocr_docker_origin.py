import pytest
from app.documents.contracts import DocumentError
from app.documents.storage import ocr_read_origin


def test_docker_storage_origin_is_only_explicit_loopback(monkeypatch):
    monkeypatch.setenv('HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN', 'http://host.docker.internal:55321')
    assert ocr_read_origin('http://127.0.0.1:55321', local_worker=True).hostname == 'host.docker.internal'
    for base in ('https://project.supabase.co', 'http://localhost:54321'):
        with pytest.raises(DocumentError): ocr_read_origin(base, local_worker=True)
    monkeypatch.setenv('VERCEL_ENV', 'production')
    with pytest.raises(DocumentError): ocr_read_origin('http://localhost:55321', local_worker=True)


@pytest.mark.parametrize('origin', ['http://evil.invalid:55321', 'http://host.docker.internal:1234',
    'https://host.docker.internal:55321', 'http://host.docker.internal:55321/path',
    'http://name@host.docker.internal:55321'])
def test_docker_origin_rejects_unsafe_values(monkeypatch, origin):
    monkeypatch.setenv('HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN', origin)
    with pytest.raises(DocumentError): ocr_read_origin('http://127.0.0.1:55321', local_worker=True)
