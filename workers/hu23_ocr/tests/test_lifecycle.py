"""Linux integration: stopping the actual worker while a synthetic job is active."""
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, build_opener, ProxyHandler
from uuid import uuid4

import pytest
from workers.hu23_ocr.synthetic import fixtures

pytestmark = pytest.mark.skipif(sys.platform != 'linux' or not shutil.which('tesseract'), reason='Linux and Tesseract required')


@pytest.mark.parametrize('scenario', ['download', 'tesseract', 'rotations', 'queued'])
def test_shutdown_reaps_active_group_and_allows_retry(tmp_path, scenario):
    from workers.hu23_ocr import server
    root = Path(server.__file__).resolve().parents[2]
    name = 'payslip_rotated_scan' if scenario == 'rotations' else 'payslip_scan'
    data = next(data for label, _, _, data in fixtures() if label == name)
    entered, release = threading.Event(), threading.Event()
    class Storage(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            entered.set()
            if scenario in ('download', 'queued'):
                release.wait(15)
            try:
                self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            except OSError: pass
    storage = ThreadingHTTPServer(('127.0.0.1', 0), Storage)
    threading.Thread(target=storage.serve_forever, daemon=True).start()
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); port=s.getsockname()[1]
    origin=f'http://127.0.0.1:{storage.server_port}'; token='synthetic-worker-test-token-at-least-32-chars'
    tmp=tmp_path/'temp'; tmp.mkdir()
    marker=tmp_path/'ocr-starts'
    wrapper=tmp_path/'tesseract-wrapper'
    wrapper.write_text('#!/bin/sh\nif [ "$1" != "--version" ]; then echo start >> "'+str(marker)+'"; fi\nexec '+shutil.which('tesseract')+' "$@"\n')
    wrapper.chmod(0o700)
    env={**os.environ, 'TMPDIR':str(tmp), 'HU23_LOCAL_OCR_TOKEN':token, 'HU23_OCR_STORAGE_ORIGIN':origin,
         'HU23_LOCAL_OCR_PORT':str(port), 'HU23_TESSERACT_BIN':str(wrapper)}
    def start():
        p=subprocess.Popen([sys.executable, '-m', 'workers.hu23_ocr.server'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.1): return p
            except OSError: time.sleep(.05)
        raise AssertionError('worker did not start')
    source=origin+f'/storage/v1/object/sign/hu23-document-temporary/{uuid4()}/{uuid4()}/{uuid4()}.pdf?token=synthetic'
    payload=json.dumps({'source_url':source,'document_type':'liquidacion_sueldo','reference_date':'2026-10-25'}).encode()
    def request():
        try:
            req=Request(f'http://127.0.0.1:{port}/v1/parse',data=payload,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with build_opener(ProxyHandler({})).open(req,timeout=20) as r: return json.loads(r.read())
        except Exception: return None
    worker=start()
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures=[pool.submit(request) for _ in range(4 if scenario == 'queued' else 1)]
            assert entered.wait(10)
            if scenario in ('tesseract','rotations'):
                deadline=time.monotonic()+20
                required=2 if scenario=='rotations' else 1
                active_ocr=False
                while time.monotonic()<deadline:
                    count=len(marker.read_text().splitlines()) if marker.exists() else 0
                    children=Path(f'/proc/{worker.pid}/task/{worker.pid}/children').read_text().split()
                    for child in children:
                        try:
                            descendants=Path(f'/proc/{child}/task/{child}/children').read_text().split()
                            active_ocr=any(b'tesseract' in Path(f'/proc/{pid}/cmdline').read_bytes()
                                           and b'stdin' in Path(f'/proc/{pid}/cmdline').read_bytes() for pid in descendants)
                        except OSError: pass
                    if count>=required and active_ocr: break
                    time.sleep(.005)
                assert count>=required and active_ocr
            children=Path(f'/proc/{worker.pid}/task/{worker.pid}/children').read_text().split()
            assert len(children)==1
            pgid=int(children[0])
            os.kill(worker.pid,signal.SIGTERM); worker.wait(timeout=5)
            release.set()
            assert all(f.result(timeout=15) is None for f in futures)
            with pytest.raises(ProcessLookupError): os.killpg(pgid,0)
        assert not list(tmp.iterdir())
        worker=start()
        response=request()
        assert response['result']['candidates'][0]['value']==1200000
    finally:
        release.set()
        if worker.poll() is None: worker.terminate(); worker.wait(timeout=5)
        storage.shutdown();storage.server_close()
