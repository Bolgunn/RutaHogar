"""Stateless worker port. Only allowlisted candidates cross this boundary."""
import os
import logging
from datetime import datetime
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from .contracts import ALLOWLISTS, DocumentError, StructuredResult
from .parsers import PARSER_VERSION
from .normalization import NORMALIZER_VERSION
from .service import DocumentService
from .upload import UploadService

logger = logging.getLogger(__name__)


def configured_provider():
    provider = os.getenv('HU23_OCR_PROVIDER', 'azure')
    if provider not in ('azure', 'local'):
        raise DocumentError('ocr_unavailable')
    return provider


class LocalOcrClient:
    def __init__(self, *, client=None):
        self.url = os.getenv('HU23_LOCAL_OCR_URL', '').rstrip('/')
        self.token = os.getenv('HU23_LOCAL_OCR_TOKEN', '')
        self.client = client
        try:
            url = urlsplit(self.url)
            if (url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password
                    or url.path not in ('', '/') or url.query or url.fragment or len(self.token) < 32
                    or self.token != self.token.strip()
                    or (url.scheme == 'http' and url.hostname not in ('localhost', '127.0.0.1', '::1'))):
                raise ValueError
            _ = url.port
        except ValueError:
            raise DocumentError('local_ocr_unavailable') from None

    def parse(self, source_url, document_type, reference_date):
        def send(client):
            with client.stream('POST', self.url + '/v1/parse',
                    headers={'Authorization': 'Bearer ' + self.token},
                    json={'source_url': source_url, 'document_type': document_type, 'reference_date': reference_date},
                    timeout=55, follow_redirects=False) as response:
                if response.status_code != 200:
                    raise DocumentError('local_ocr_unavailable')
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > 4096:
                        raise DocumentError('local_ocr_unavailable')
                import json
                payload = json.loads(data)
                if (set(payload) not in ({'result', 'method', 'elapsed_ms'},
                                         {'result', 'method', 'elapsed_ms', 'rotation', 'ocr_attempts'})
                        or payload['method'] not in ('embedded_text', 'tesseract')
                        or type(payload['elapsed_ms']) is not int or payload['elapsed_ms'] < 0
                        or ('rotation' in payload and (type(payload['rotation']) is not int
                            or payload['rotation'] not in (0, 90, 180, 270)
                            or type(payload['ocr_attempts']) is not int or not 0 <= payload['ocr_attempts'] <= 8))):
                    raise ValueError
                result = StructuredResult.model_validate(payload['result'])
                if (result.document_type.value != document_type or result.parser_version != PARSER_VERSION
                        or result.normalizer_version != NORMALIZER_VERSION
                        or {c.field for c in result.candidates} != ALLOWLISTS[result.document_type]):
                    raise ValueError
                logger.info('hu23_local_ocr method=%s rotation=%s ocr_attempts=%s elapsed_ms=%s',
                            payload['method'], payload.get('rotation', 'unknown'),
                            payload.get('ocr_attempts', 'unknown'), payload['elapsed_ms'])
                return result
        try:
            if self.client is not None:
                return send(self.client)
            with httpx.Client(trust_env=False) as client:
                return send(client)
        except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError):
            raise DocumentError('local_ocr_unavailable') from None


class LocalOcrService:
    def __init__(self, repository, storage, *, client=None):
        self.repository, self.storage = repository, storage
        self.client = client

    def _step(self, user, process_id, action, token=None):
        return self.repository.rpc('hu23_local_ocr', {'p_user': user, 'p_process': process_id,
                                                     'p_action': action, 'p_token': token})

    def start(self, user, process_id):
        client = self.client or LocalOcrClient()  # Configuration checked before claiming.
        claimed = self._step(user, process_id, 'claim')
        if not claimed.get('claimed'):
            return claimed
        process, job = claimed['process'], claimed['job']
        token = job['lease_token']
        try:
            path = process['storage_path']
            if not path or not path.startswith(f'{user}/{process_id}/'):
                raise DocumentError('storage_unavailable')
            reference = datetime.fromisoformat(process['created_at'].replace('Z', '+00:00')).date().isoformat()
            result = client.parse(self.storage.signed_read(path, local_worker=True), process['document_type'], reference)
            ready = self._step(user, process_id, 'prepare', token)
            if ready['process']['closed_at']:
                return ready
            DocumentService(self.repository).record_result(user, process_id, ready['process']['revision'],
                                                           result, parse_token=token)
            del result
        except DocumentError:
            # Stateless work can safely be repeated. Never fail-close/delete on a worker outage.
            self._step(user, process_id, 'retry', token)
            raise
        return self._step(user, process_id, 'cleanup')

    def cleanup(self, user, process_id):
        bundle = self._step(user, process_id, 'cleanup')
        if bundle['process']['closed_at']:
            UploadService(self.repository, self.storage).try_cleanup(user, process_id)
        return bundle
