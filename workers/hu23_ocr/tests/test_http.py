import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from uuid import uuid4

import httpx

from workers.hu23_ocr.server import Handler, QuietServer
from workers.hu23_ocr.synthetic import fixtures


def test_real_worker_http_download_child_parser_and_redaction(monkeypatch):
    _, _, _, pdf = next(fixtures())
    token = 'synthetic-only-authentication-token-32-chars'
    path = f'/storage/v1/object/sign/hu23-document-temporary/{uuid4()}/{uuid4()}/{uuid4()}.pdf?token=synthetic'
    class Storage(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            assert self.path == path
            if getattr(self.server, 'redirect', False):
                self.send_response(302); self.send_header('Location', 'http://outside.invalid/?token=synthetic'); self.end_headers()
                return
            self.send_response(200); self.send_header('Content-Length', str(len(pdf))); self.end_headers(); self.wfile.write(pdf)
    storage = HTTPServer(('127.0.0.1', 0), Storage)
    worker = QuietServer(('127.0.0.1', 0), Handler)
    monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN', token)
    origin = f'http://127.0.0.1:{storage.server_port}'
    monkeypatch.setenv('HU23_OCR_STORAGE_ORIGIN', origin)
    for server in (storage, worker): threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f'http://127.0.0.1:{worker.server_port}/v1/parse'
        with httpx.Client(trust_env=False, timeout=30) as client:
            assert client.post(url, json={}).status_code == 401
            headers = {'Authorization': 'Bearer ' + token}
            payload = {'source_url': origin + path, 'document_type': 'liquidacion_sueldo', 'reference_date': '2026-10-25'}
            response = client.post(url, headers=headers, json=payload)
            assert response.status_code == 200
            assert response.json()['result']['candidates'][0]['value'] == 1200000
            assert response.headers['Cache-Control'] == 'no-store'
            assert not any(text in response.text for text in ['PERSONA_', 'DIRECCION_', 'token=', 'content', 'pages'])
            storage.redirect = True
            failure = client.post(url, headers=headers, json=payload)
            assert failure.status_code == 503 and failure.json() == {'error': 'local_processing_failed'}
            payload['source_url'] = 'http://evil.invalid/secret'
            assert client.post(url, headers=headers, json=payload).status_code == 422
    finally:
        for server in (worker, storage): server.shutdown(); server.server_close()
