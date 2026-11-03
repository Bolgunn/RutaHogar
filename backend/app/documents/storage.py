"""Only metadata references and deletion. Never download original bytes to FastAPI."""
import logging
import os

import httpx

from .config import TEMPORARY_BUCKET
from .contracts import DocumentError

logger = logging.getLogger(__name__)


def ocr_read_origin(base_url, *, local_worker=False):
    """Hosted Supabase stays unchanged; local Docker may use an explicit host origin."""
    from urllib.parse import urlsplit

    if not local_worker:
        return None

    base = urlsplit(base_url)
    configured = os.getenv('HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN', '')
    if not configured:
        return None
    try:
        origin = urlsplit(configured)
        if (os.getenv('VERCEL_ENV') in {'production', 'preview'}
                or base.hostname not in ('127.0.0.1', 'localhost', '::1')
                or base.scheme != 'http' or origin.scheme != 'http'
                or origin.hostname != 'host.docker.internal' or origin.port != base.port
                or origin.username or origin.password or origin.path not in ('', '/')
                or origin.query or origin.fragment):
            raise ValueError
    except ValueError:
        raise DocumentError('local_ocr_public_origin_invalid') from None
    return origin

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

    def signed_read(self, path, *, local_worker=False):
        """Internal only: issue a five-minute read capability for the reserved object."""
        from urllib.parse import quote, urlsplit, urlunsplit
        from .azure import SIGNED_READ_SECONDS
        transport = getattr(self.repository, 'tracking', None)
        if transport is None:
            raise DocumentError('storage_unavailable')
        public_origin = ocr_read_origin(transport.url, local_worker=local_worker)
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
            if ((parsed.scheme != 'https' and public_origin is None and not (local_worker and base.hostname in ('127.0.0.1', 'localhost', '::1')))
                    or (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc)
                    or parsed.path != '/storage/v1/object/sign/' + object_path or not parsed.query or parsed.fragment):
                raise ValueError
            # Preserve the signed path and token exactly. No bytes pass through FastAPI.
            return urlunsplit((public_origin.scheme, public_origin.netloc, parsed.path, parsed.query, '')) if public_origin else url
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            logger.warning('hu23_storage reason=signed_read_failed')
            raise DocumentError('storage_unavailable') from None
