"""Only metadata references and deletion. Never download original bytes to FastAPI."""
import httpx

from .config import TEMPORARY_BUCKET
from .contracts import DocumentError


class TemporaryStorage:
    def __init__(self, repository):
        self.repository = repository

    def delete(self, path, *, timeout=None):
        transport = getattr(self.repository, 'tracking', None)
        if transport is None:
            raise DocumentError('storage_unavailable')
        headers = {'apikey': transport.key}
        if not transport.key.startswith('sb_secret_'):
            headers['Authorization'] = f'Bearer {transport.key}'
        from ..tracking.repository import _shared_client
        client = transport.client or _shared_client(transport.url)
        try:
            response = client.request('DELETE', f'/storage/v1/object/{TEMPORARY_BUCKET}',
                                      headers=headers, json={'prefixes': [path]},
                                      **({} if timeout is None else {'timeout': timeout}))
        except httpx.HTTPError:
            raise DocumentError('storage_unavailable') from None
        # Missing the expected object is an idempotent success. No other error is swallowed.
        if response.status_code not in (200, 204, 404):
            raise DocumentError('storage_unavailable')

    def signed_read(self, path):
        """Internal only: issue a five-minute read capability for the reserved object."""
        from urllib.parse import quote, urlsplit
        from .azure import SIGNED_READ_SECONDS
        transport = getattr(self.repository, 'tracking', None)
        if transport is None:
            raise DocumentError('storage_unavailable')
        headers = {'apikey': transport.key}
        if not transport.key.startswith('sb_secret_'):
            headers['Authorization'] = f'Bearer {transport.key}'
        from ..tracking.repository import _shared_client
        client = transport.client or _shared_client(transport.url)
        object_path = f'{TEMPORARY_BUCKET}/{quote(path, safe="/")}'
        try:
            response = client.request('POST', '/storage/v1/object/sign/' + object_path,
                headers=headers, json={'expiresIn': SIGNED_READ_SECONDS}, follow_redirects=False)
            signed = response.json().get('signedURL') if response.status_code == 200 else None
            url = transport.url + '/storage/v1' + signed if isinstance(signed, str) and signed.startswith('/object/sign/') else signed
            parsed, base = urlsplit(url or ''), urlsplit(transport.url)
            if (parsed.scheme != 'https' or (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc)
                    or parsed.path != '/storage/v1/object/sign/' + object_path or not parsed.query or parsed.fragment):
                raise ValueError
            return url
        except (httpx.HTTPError, ValueError, TypeError):
            raise DocumentError('storage_unavailable') from None
