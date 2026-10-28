"""Disposable PostgreSQL fencing/idempotency with the real shared parser, no cloud."""
import json
from datetime import date

import pytest

from app.documents.contracts import DocumentError
from app.documents.local_ocr import LocalOcrService
from app.documents.ocr import OcrService
from app.documents.parsers import parse_document
from test_persistence import setup, admit_upload, sql, lit, pytestmark
from test_upload import FakeStorage
from test_persistence import api


class Storage(FakeStorage):
    def signed_read(self, path, *, local_worker=False):
        assert local_worker
        return 'http://127.0.0.1/synthetic-only'


class Client:
    def __init__(self): self.calls = 0; self.callback = None; self.fail = False
    def parse(self, *args):
        self.calls += 1
        if self.callback: self.callback()
        if self.fail: raise DocumentError('local_ocr_unavailable')
        return parse_document('liquidacion_sueldo', {'content': '', 'pages': [{'pageNumber': 1,
            'lines': [{'content': 'Liquido a pagar: $1.200.000'}]}]}, date(2026, 10, 25))


def test_local_goes_to_review_once_preserves_declared_and_scores(setup):
    user, pid, repo, docs = setup
    admit_upload(user, pid, repo)
    client = Client()
    service = LocalOcrService(repo, Storage(), client=client)
    before = repo.load_tracking(user)
    assert service.start(user, pid)['process']['state'] == 'awaiting_review'
    row = docs.read(user, pid)['candidates'][0]
    assert row['declared_value'] == 1000000 and row['detected_value'] == 1200000 and row['comparison'] == 'difference'
    service.start(user, pid)
    assert client.calls == 1 and repo.load_tracking(user) == before
    job = json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)}'))
    assert job['provider'] == 'local' and job['deletion_state'] == 'deleted'
    assert 'Liquido' not in json.dumps(job) and 'token=' not in json.dumps(job)


def test_worker_failure_retry_and_crash_recovery_keep_same_job(setup):
    user, pid, repo, docs = setup
    admit_upload(user, pid, repo)
    client = Client(); client.fail = True
    service = LocalOcrService(repo, Storage(), client=client)
    with pytest.raises(DocumentError, match='local_ocr_unavailable'): service.start(user, pid)
    assert docs.read(user, pid)['state'] == 'processing'
    service.start(user, pid)
    assert client.calls == 1
    sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)}")
    client.fail = False
    assert service.start(user, pid)['process']['state'] == 'awaiting_review'
    assert sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(pid)}') == '1'


def test_concurrent_claim_and_expired_lease_fence_stale_result(setup):
    user, pid, repo, _ = setup
    admit_upload(user, pid, repo)
    service = LocalOcrService(repo, Storage(), client=Client())
    first = service._step(user, pid, 'claim')
    assert first['claimed'] and not service._step(user, pid, 'claim')['claimed']
    sql(f"UPDATE document_ocr_jobs SET lease_until=now()-interval '1 second' WHERE process_id={lit(pid)}")
    second = service._step(user, pid, 'claim')
    assert second['claimed'] and first['job']['lease_token'] != second['job']['lease_token']
    with pytest.raises(DocumentError, match='stale_review'):
        service._step(user, pid, 'prepare', first['job']['lease_token'])


def test_provider_switch_is_explicit_and_cleanup_remains_pinned(setup, monkeypatch):
    user, pid, repo, _ = setup
    admit_upload(user, pid, repo)
    LocalOcrService(repo, Storage(), client=Client()).start(user, pid)
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'azure')
    with pytest.raises(DocumentError, match='ocr_provider_mismatch'):
        OcrService(repo, storage=Storage()).start(user, pid)
    OcrService(repo, storage=Storage()).try_cleanup(user, pid)


def test_cron_cleanup_keeps_local_provider_after_configuration_switch(setup, monkeypatch):
    from app.documents.cleanup import DocumentCleanupService
    from test_cleanup import Storage as CleanupStorage, TargetRepository
    user, pid, repo, _ = setup
    admit_upload(user, pid, repo)
    LocalOcrService(repo, Storage(), client=Client())._step(user, pid, 'claim')
    process = repo.read(user, pid)['process']
    repo.lifecycle(user, pid, process['revision'], 'cancel')
    sql(f"UPDATE document_ocr_jobs SET lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)}")
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'azure')
    class ForbiddenAzure:
        def delete(self, *args): pytest.fail('local result sent to Azure cleanup')
        def probe(self, *args): pytest.fail('local result probed in Azure')
    report = DocumentCleanupService(TargetRepository(repo, [pid]), storage=CleanupStorage(), azure=ForbiddenAzure()).run()
    assert report['azure_deleted'] == 1 and report['storage_deleted'] == 1


@pytest.mark.parametrize('fixture_name', ['payslip_embedded', 'payslip_scan'])
def test_real_pdf_worker_http_to_persisted_review(setup, api, monkeypatch, fixture_name):
    """Real worker/Tesseract + API + SQL, with synthetic-only signed Storage HTTP."""
    import base64
    import os
    from pathlib import Path
    import socket
    import subprocess
    import threading
    import time
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import httpx
    request, _ = api
    python = os.getenv('HU23_WORKER_TEST_PYTHON')
    if not python:
        pytest.skip('set HU23_WORKER_TEST_PYTHON to the separate worker venv interpreter')
    user, pid, repo, docs = setup
    admit_upload(user, pid, repo)
    root = Path(__file__).resolve().parents[3]
    env = {**os.environ, 'PYTHONPATH': str(root / 'backend') + os.pathsep + str(root)}
    command = ('import base64;from workers.hu23_ocr.synthetic import fixtures;'
               f'print(base64.b64encode(next(data for name,kind,ext,data in fixtures() if name=={fixture_name!r})).decode())')
    fixture_python = os.getenv('HU23_FIXTURE_TEST_PYTHON', python)
    pdf = base64.b64decode(subprocess.check_output([fixture_python, '-c', command], cwd=root, env=env))
    path = repo.read(user, pid)['process']['storage_path']
    signed_path = '/storage/v1/object/sign/hu23-document-temporary/' + path + '?token=synthetic'
    class SyntheticStorage(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            assert self.path == signed_path
            self.send_response(200); self.send_header('Content-Length', str(len(pdf))); self.end_headers(); self.wfile.write(pdf)
    storage = HTTPServer(('127.0.0.1', 0), SyntheticStorage)
    threading.Thread(target=storage.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{storage.server_port}'
    class ReadStorage(Storage):
        def signed_read(self, path, *, local_worker=False): return origin + signed_path
    monkeypatch.setattr('app.documents.ocr.TemporaryStorage', lambda repo: ReadStorage())
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    token = 'synthetic-worker-integration-token-32-chars'
    env.update(HU23_LOCAL_OCR_TOKEN=token, HU23_OCR_STORAGE_ORIGIN=origin, HU23_LOCAL_OCR_PORT=str(port))
    monkeypatch.setenv('HU23_OCR_PROVIDER', 'local')
    monkeypatch.setenv('HU23_LOCAL_OCR_URL', f'http://127.0.0.1:{port}')
    monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN', token)
    worker = subprocess.Popen([python, '-m', 'workers.hu23_ocr.server'], cwd=root, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1): break
            except OSError: time.sleep(.05)
        else: pytest.fail('worker failed to start')
        headers = {'Authorization': 'Bearer ' + user}
        response = request('POST', f'/tracking/documents/sessions/{pid}/ocr/start', headers=headers,
                       json={'consent_external_processing': True, 'expected_provider': 'local'})
        assert response.status_code == 202 and response.json()['state'] == 'awaiting_review'
        assert response.json()['provider'] == 'local'
        row = docs.read(user, pid)['candidates'][0]
        assert (row['declared_value'], row['detected_value'], row['comparison']) == (1000000, 1200000, 'difference')
        again = request('POST', f'/tracking/documents/sessions/{pid}/ocr/start', headers=headers,
                    json={'consent_external_processing': True, 'expected_provider': 'local'})
        assert again.json()['state'] == 'awaiting_review'
        assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)}') == '1'
    finally:
        worker.terminate(); worker.wait(timeout=10)
        storage.shutdown(); storage.server_close()
