"""Server Storage port sends deletion only, with sanitized failures."""
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError

from app.documents.contracts import AuthorizeUpload, DocumentError
from app.documents.storage import TemporaryStorage


@pytest.mark.parametrize('status', [200, 204, 404, 403, 500])
def test_storage_deletion_uses_privileged_transport_without_reading_binary(status):
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(status, text='provider detail must not escape')
    with httpx.Client(base_url='https://storage.invalid', transport=httpx.MockTransport(respond)) as client:
        repository = SimpleNamespace(tracking=SimpleNamespace(client=client, key='server-only-test-key'))
        storage = TemporaryStorage(repository)
        if status in (200, 204, 404):
            storage.delete('owner/process/uuid.pdf')
        else:
            with pytest.raises(DocumentError, match='^storage_unavailable$'):
                storage.delete('owner/process/uuid.pdf')
    assert len(calls) == 1
    request = calls[0]
    assert request.method == 'DELETE'
    assert request.url.path == '/storage/v1/object/hu23-document-temporary'
    assert request.headers['Authorization'] == 'Bearer server-only-test-key'
    assert request.content == b'{"prefixes":["owner/process/uuid.pdf"]}'


@pytest.mark.parametrize('change', [
    {'extension': '../file.pdf'}, {'extension': 'exe'},
    {'client_pages': 3}, {'client_pages': True},
    {'extension': 'jpg', 'content_type': 'image/jpeg', 'client_pages': 2},
    {'extension': 'png', 'content_type': 'application/pdf'},
    {'path': 'owner/process/file.pdf'}, {'user_id': 'forged'},
])
def test_upload_admission_contract_rejects_invalid_or_authoritative_client_fields(change):
    data = dict(expected_revision=0, extension='pdf', content_type='application/pdf', client_pages=1)
    with pytest.raises(ValidationError):
        AuthorizeUpload(**{**data, **change})
