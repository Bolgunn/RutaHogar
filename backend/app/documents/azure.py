"""Untrusted OCR transport only. No financial interpretation or database access."""
import json
import os
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Literal, Protocol
from urllib.parse import urlsplit, parse_qs
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

API_VERSION = '2024-11-30'
MODEL = 'prebuilt-layout'
ROOT = f'/documentintelligence/documentModels/{MODEL}'
HTTP_TIMEOUT = 8.0
MAX_RESPONSE_BYTES = 4_000_000
SIGNED_READ_SECONDS = 300


class OcrError(Exception):
    """Only fixed technical codes; never include URLs, keys or provider messages."""
    def __init__(self, code, *, retry_after=2):
        super().__init__(code)
        self.code, self.retry_after = code, retry_after


class Recognition(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    status: Literal['notStarted', 'running', 'succeeded', 'failed']
    # Raw layout stays in memory only. Financial parsing/validation belongs to T4.
    analyzeResult: dict | None = None

    def require_layout(self):
        value = self.analyzeResult
        if self.status == 'succeeded' and (not isinstance(value, dict)
                or value.get('modelId') != MODEL or value.get('apiVersion') != API_VERSION
                or not isinstance(value.get('content'), str)
                or not isinstance(value.get('pages'), list)
                or not 1 <= len(value['pages']) <= 2):
            raise OcrError('invalid_response')
        return self


class Started(BaseModel):
    result_id: UUID
    retry_after: int = Field(ge=2)


class DocumentOcrClient(Protocol):
    def begin(self, source_url: str) -> Started: ...
    def poll(self, result_id: str) -> tuple[Recognition, int]: ...
    def delete(self, result_id: str) -> None: ...


def retry_seconds(value, now=None):
    """Support seconds and HTTP-date; never poll before the provider asks."""
    now = now or datetime.now(timezone.utc)
    try:
        seconds = int(value)
    except (ValueError, TypeError):
        try:
            seconds = int((parsedate_to_datetime(value) - now).total_seconds()) + 1
        except (ValueError, TypeError, OverflowError):
            seconds = 2
    return max(2, min(seconds, 86400))


class AzureOcrClient:
    def __init__(self, *, endpoint=None, key=None, client=None, timeout=HTTP_TIMEOUT):
        self.endpoint = (endpoint or os.getenv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', '')).rstrip('/')
        self._key = key or os.getenv('AZURE_DOCUMENT_INTELLIGENCE_KEY', '')
        try:
            parsed = urlsplit(self.endpoint)
        except ValueError:
            raise OcrError('ocr_unavailable') from None
        if (not self._key or parsed.scheme != 'https' or not parsed.hostname or parsed.username
                or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise OcrError('ocr_unavailable')
        self.client = client
        self.timeout = timeout
        # Endpoint is trusted server configuration; locations returned by Azure are not.
        self._origin = (parsed.scheme, parsed.netloc)

    def _request(self, method, path, payload=None):
        def send(client):
            started = time.monotonic()
            with client.stream(method, self.endpoint + path, params={'api-version': API_VERSION},
                    headers={'Ocp-Apim-Subscription-Key': self._key}, json=payload,
                    timeout=self.timeout, follow_redirects=False) as response:
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_RESPONSE_BYTES or time.monotonic() - started > self.timeout:
                        raise OcrError('submission_unknown' if method == 'POST' else 'invalid_response')
                return response.status_code, response.headers, bytes(data)
        try:
            if self.client is not None:
                return send(self.client)
            with httpx.Client() as client:
                return send(client)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
            raise OcrError('transient') from None
        except httpx.HTTPError:
            # POST may have been accepted. Repeating it could create a second analysis.
            raise OcrError('submission_unknown' if method == 'POST' else 'transient') from None

    def begin(self, source_url):
        status, headers, _ = self._request('POST', ROOT + ':analyze', {'urlSource': source_url})
        delay = retry_seconds(headers.get('Retry-After'))
        if status == 429:
            raise OcrError('transient', retry_after=delay)
        if status >= 500:
            raise OcrError('submission_unknown')
        if status != 202:
            raise OcrError('provider_failed')
        prefix = ROOT + '/analyzeResults/'
        try:
            location = urlsplit(headers.get('Operation-Location', ''))
            if ((location.scheme, location.netloc) != self._origin or location.fragment
                    or not location.path.startswith(prefix)
                    or parse_qs(location.query) != {'api-version': [API_VERSION]}):
                raise ValueError
            result_id = UUID(location.path[len(prefix):])
        except (ValueError, TypeError):
            # Accepted without a safely recoverable identifier; never follow this URL.
            raise OcrError('submission_unknown') from None
        return Started(result_id=result_id, retry_after=delay)

    def poll(self, result_id):
        identifier = str(UUID(str(result_id)))
        status, headers, body = self._request('GET', ROOT + '/analyzeResults/' + identifier)
        delay = retry_seconds(headers.get('Retry-After'))
        if status == 429 or status >= 500:
            raise OcrError('transient', retry_after=delay)
        if status != 200:
            raise OcrError('provider_failed')
        try:
            result = Recognition.model_validate(json.loads(body)).require_layout()
        except (ValueError, ValidationError, TypeError):
            raise OcrError('invalid_response') from None
        return result, delay

    def delete(self, result_id):
        identifier = str(UUID(str(result_id)))
        status, headers, _ = self._request('DELETE', ROOT + '/analyzeResults/' + identifier)
        if status in (204, 410):
            return
        raise OcrError('not_found' if status == 404 else 'transient', retry_after=retry_seconds(headers.get('Retry-After')))

    def probe(self, result_id):
        """Cleanup reconciliation only: acknowledge absence or inspect status, not layout."""
        identifier = str(UUID(str(result_id)))
        status, headers, body = self._request('GET', ROOT + '/analyzeResults/' + identifier)
        delay = retry_seconds(headers.get('Retry-After'))
        if status in (404, 410):
            return None, delay
        if status == 429 or status >= 500:
            raise OcrError('transient', retry_after=delay)
        if status != 200:
            raise OcrError('provider_failed')
        try:
            recognition = Recognition.model_validate(json.loads(body))
        except (ValueError, TypeError, ValidationError):
            raise OcrError('invalid_response') from None
        return recognition.status, delay
