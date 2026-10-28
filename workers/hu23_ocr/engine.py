"""Memory-only extraction; the existing HU23 parser is the only financial interpreter."""
import os
import subprocess
import time
from datetime import date
from contextlib import closing
from .pdf_ops import open_document
from urllib.parse import urlsplit, parse_qs
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler, Request
from uuid import UUID

from app.documents.config import MAX_DOCUMENT_BYTES, MAX_PDF_PAGES, TEMPORARY_BUCKET
from app.documents.contracts import DocumentType
from app.documents.parsers import parse_document

MAX_TEXT = 200_000
MAX_PIXELS = 12_000_000


class WorkerError(ValueError):
    """Fixed technical codes only; no source, provider messages or extracted values."""


def source_url(value, origin):
    try:
        url, base = urlsplit(value), urlsplit(origin)
        if (base.scheme not in ('http', 'https') or not base.hostname or base.username or base.password
                or base.path not in ('', '/') or base.query or base.fragment
                or (base.scheme == 'http' and base.hostname not in ('localhost', '127.0.0.1', '::1', 'host.docker.internal'))
                or (url.scheme, url.netloc) != (base.scheme, base.netloc)
                or url.username or url.password or url.fragment):
            raise ValueError
        prefix = f'/storage/v1/object/sign/{TEMPORARY_BUCKET}/'
        if not url.path.startswith(prefix):
            raise ValueError
        owner, process, file = url.path[len(prefix):].split('/')
        UUID(owner); UUID(process)
        stem, extension = file.rsplit('.', 1)
        UUID(stem)
        query = parse_qs(url.query, strict_parsing=True)
        if extension not in ('pdf', 'jpg', 'jpeg', 'png') or set(query) != {'token'} or len(query['token']) != 1:
            raise ValueError
        return value, extension
    except (ValueError, TypeError, AttributeError):
        raise WorkerError('invalid_source') from None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise WorkerError('source_redirect')


def download(url, origin):
    url, extension = source_url(url, origin)
    data = bytearray()
    start = time.monotonic()
    try:
        # Ignore ambient HTTP proxies; only the explicitly configured Storage origin is reachable.
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(Request(url, headers={'Accept-Encoding': 'identity'}), timeout=8) as response:
            if response.status != 200:
                raise WorkerError('download_failed')
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_DOCUMENT_BYTES or time.monotonic() - start > 10:
                    raise WorkerError('document_limit')
        if not data:
            raise WorkerError('invalid_document')
        return bytes(data), extension
    except WorkerError:
        raise
    except Exception:
        raise WorkerError('download_failed') from None
    finally:
        data.clear()


def tesseract(image, *, timeout=15):
    command = os.getenv('HU23_TESSERACT_BIN', 'tesseract')
    env = {**os.environ, 'OMP_THREAD_LIMIT': '1'}
    try:
        version = subprocess.run([command, '--version'], capture_output=True, timeout=3, env=env)
        if not version.stdout.startswith(b'tesseract 5.'):
            raise WorkerError('tesseract_5_required')
        result = subprocess.run([command, 'stdin', 'stdout', '-l', 'spa', '--oem', '1', '--psm', '6'],
                                input=image, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=timeout, env=env)
        if result.returncode or len(result.stdout) > MAX_TEXT:
            raise WorkerError('tesseract_failed')
        return result.stdout.decode('utf-8', errors='strict')
    except WorkerError:
        raise
    except Exception:
        raise WorkerError('tesseract_unavailable') from None


def extract(data, extension, document_type, reference):
    started = time.perf_counter()
    pages, methods, scanned = [], [], []
    attempts = 0
    rotation = 0
    try:
        if not 0 < len(data) <= MAX_DOCUMENT_BYTES:
            raise WorkerError('document_limit')
        magic = data.startswith(b'%PDF-') if extension == 'pdf' else (
            data.startswith(b'\x89PNG\r\n\x1a\n') if extension == 'png' else data.startswith(b'\xff\xd8\xff'))
        if not magic:
            raise WorkerError('invalid_document')
        with closing(open_document(data, extension)) as document:
            if document.needs_pass or not 1 <= document.page_count <= MAX_PDF_PAGES:
                raise WorkerError('document_limit')
            if extension != 'pdf' and document.page_count != 1:
                raise WorkerError('document_limit')
            for index in range(document.page_count):
                embedded = document.text(index) if extension == 'pdf' else ''
                if len(embedded) > MAX_TEXT:
                    raise WorkerError('text_limit')
                # Per-page fallback prevents a text header from hiding a scanned body.
                large_image = document.large_image(index)
                usable = (sum(c.isalnum() for c in embedded) >= 40 and '\ufffd' not in embedded
                          and len(embedded.splitlines()) >= 2 and not large_image)
                if usable:
                    content, method = embedded, 'embedded_text'
                else:
                    page_width, page_height = document.size(index)
                    width, height = page_width * 200 / 72, page_height * 200 / 72
                    if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
                        raise WorkerError('pixel_limit')
                    content, method = tesseract(document.render(index, 0)), 'tesseract'
                    attempts += 1
                    scanned.append(index)
                if len(content) > MAX_TEXT:
                    raise WorkerError('text_limit')
                pages.append({'pageNumber': index + 1, 'lines': [{'content': line} for line in content.splitlines()],
                              'spans': [{'offset': 0, 'length': 0}]})
                methods.append(method)
            layout = {'content': '', 'pages': pages, 'stringIndexType': 'unicodeCodePoint'}
            result = parse_document(DocumentType(document_type), layout, date.fromisoformat(reference))
            original = {item.field: item for item in result.candidates}
            # Never use another orientation to turn an ambiguity into a chosen value.
            if scanned and not any(item.detection == 'ambiguous' for item in original.values()) and any(
                    item.detection == 'not_detected' for item in original.values()):
                # Keep pages that already supplied a value fixed while recovering
                # missing fields from other scanned pages. If every page is protected,
                # retry them together and still require the original values to match.
                protected = {item.page - 1 for item in original.values() if item.detection == 'detected'}
                retry_pages = [index for index in scanned if index not in protected] or scanned
                for angle in (90, 180, 270):
                    rotated = list(pages)
                    for index in retry_pages:
                        # Leave time for download, worker teardown and backend acknowledgement.
                        remaining = 30 - (time.perf_counter() - started)
                        if remaining <= 4:
                            raise WorkerError('processing_timeout')
                        content = tesseract(document.render(index, angle), timeout=min(15, remaining - 3))
                        attempts += 1
                        if len(content) > MAX_TEXT:
                            raise WorkerError('text_limit')
                        rotated[index] = {'pageNumber': index + 1,
                                          'lines': [{'content': line} for line in content.splitlines()],
                                          'spans': [{'offset': 0, 'length': 0}]}
                    candidate_result = parse_document(DocumentType(document_type),
                        {'content': '', 'pages': rotated, 'stringIndexType': 'unicodeCodePoint'}, date.fromisoformat(reference))
                    candidate = {item.field: item for item in candidate_result.candidates}
                    # Never replace an already-detected value or its page with a conflicting one.
                    if any(candidate[name].detection != 'detected' or candidate[name].value != item.value
                           or candidate[name].page != item.page for name, item in original.items()
                           if item.detection == 'detected'):
                        continue
                    ambiguous = {name for name, item in candidate.items()
                                 if original[name].detection == 'not_detected' and item.detection == 'ambiguous'}
                    if ambiguous:
                        result = result.model_copy(update={'candidates': [candidate[item.field]
                            if item.field in ambiguous else item for item in result.candidates]})
                        rotation = angle
                        break
                    if all(item.detection == 'detected' for item in candidate.values()):
                        result, rotation = candidate_result, angle
                        break
        return {'result': result.model_dump(mode='json'),
                'method': 'tesseract' if 'tesseract' in methods else 'embedded_text',
                'elapsed_ms': round((time.perf_counter() - started) * 1000),
                'rotation': rotation, 'ocr_attempts': attempts}
    except WorkerError:
        raise
    except Exception:
        raise WorkerError('invalid_document') from None
    finally:
        # No temporary files are created. The isolated request process exits afterwards.
        pages.clear()
