"""Real HU23 SQL and HTTP worker recovery, using synthetic local-only Storage."""
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

import pytest
from app.documents.contracts import CreateProcess, DocumentError
from app.documents.local_ocr import LocalOcrService
from app.documents.service import DocumentService
from app.documents.upload import UploadService
from test_local_ocr_persistence import Storage
from test_persistence import setup, admit_upload, seed, sql, lit, pytestmark
from test_review import command as confirm_command
from test_score_update import service as score_service, command as score_command


@pytest.mark.parametrize('scenario', ['download', 'tesseract', 'rotations', 'queued', 'timeout', 'extreme_noise'])
def test_real_worker_interruption_retry_and_fencing(setup, monkeypatch, tmp_path, scenario):
    python=os.getenv('HU23_WORKER_TEST_PYTHON')
    if not python or not shutil.which('tesseract'): pytest.skip('requires isolated worker and Tesseract')
    root=Path(__file__).resolve().parents[3]
    env={**os.environ,'PYTHONPATH':str(root/'backend')+os.pathsep+str(root)}
    name='payslip_rotated_scan' if scenario=='rotations' else 'payslip_scan'
    if scenario=='extreme_noise':
        gen='''import base64,io,random,pymupdf
from PIL import Image,ImageDraw,ImageFont
r=random.Random(2301); blobs=[]; font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48)
for i in range(2):
 im=Image.frombytes('L',(1600,2200),r.randbytes(1600*2200)); d=ImageDraw.Draw(im)
 d.rectangle((50,60,1550,600),fill=255);d.text((100,100),'LOCAL DEMO - SIN DATOS REALES',font=font,fill=0)
 d.text((100,200),'Liquido a pagar: $1.200.000' if i else 'PORTADA DE PRUEBA',font=font,fill=0)
 o=io.BytesIO();im.save(o,format='JPEG',quality=84);blobs.append(o.getvalue());im.close()
with pymupdf.open() as pdf:
 for blob in blobs:
  p=pdf.new_page(width=576,height=792);p.insert_image(p.rect,stream=blob)
 data=pdf.tobytes(deflate=True)
 assert len(data)<4000000
 print(base64.b64encode(data).decode())'''
    else:
        gen=('import base64;from workers.hu23_ocr.synthetic import fixtures;'
             f'print(base64.b64encode(next(d for n,k,e,d in fixtures() if n=={name!r})).decode())')
    pdf=base64.b64decode(subprocess.check_output([os.getenv('HU23_FIXTURE_TEST_PYTHON',python),'-c',gen],cwd=root,env=env))
    entered=threading.Event();release=threading.Event()
    class SyntheticStorage(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            entered.set()
            if scenario in ('download','queued'): release.wait(20)
            try:
                self.send_response(200);self.send_header('Content-Length',str(len(pdf)));self.end_headers();self.wfile.write(pdf)
            except OSError:pass
    storage=ThreadingHTTPServer(('127.0.0.1',0),SyntheticStorage)
    threading.Thread(target=storage.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{storage.server_port}'
    class ReadStorage(Storage):
        def signed_read(self,path,*,local_worker=False):
            assert local_worker
            return origin+'/storage/v1/object/sign/hu23-document-temporary/'+path+'?token=synthetic'
    user,pid,repo,docs=setup
    jobs=[(user,pid,repo,docs)]
    if scenario=='queued':
        for _ in range(3):
            u=seed();d=DocumentService(repo);p=d.create(u,CreateProcess(document_type='liquidacion_sueldo'))['id']
            jobs.append((u,p,repo,d))
    for u,p,r,d in jobs: admit_upload(u,p,r)
    before={u:r.load_tracking(u) for u,p,r,d in jobs}
    tmp=tmp_path/'worker-temp';tmp.mkdir(); marker=tmp_path/'ocr-marker'; wrapper=tmp_path/'tesseract'
    real=shutil.which('tesseract')
    if scenario=='timeout':
        wrapper.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then echo "tesseract 5.0"; exit 0; fi\nexec sleep 20\n')
    else:
        wrapper.write_text('#!/bin/sh\nif [ "$1" != "--version" ]; then echo x >> "'+str(marker)+'"; fi\nexec '+real+' "$@"\n')
    wrapper.chmod(0o700)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    token='synthetic-worker-integration-token-32-chars'
    env.update(TMPDIR=str(tmp),HU23_LOCAL_OCR_TOKEN=token,HU23_OCR_STORAGE_ORIGIN=origin,HU23_LOCAL_OCR_PORT=str(port),HU23_TESSERACT_BIN=str(wrapper))
    monkeypatch.setenv('HU23_OCR_PROVIDER','local');monkeypatch.setenv('HU23_LOCAL_OCR_URL',f'http://127.0.0.1:{port}');monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN',token)
    def forbid_azure(*args,**kwargs): raise AssertionError('unexpected Azure fallback')
    monkeypatch.setattr('app.documents.azure.AzureOcrClient.__init__',forbid_azure)
    def start_worker():
        w=subprocess.Popen([python,'-m','workers.hu23_ocr.server'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.1):return w
            except OSError:time.sleep(.05)
        pytest.fail('worker did not start')
    def run(item):
        u,p,r,d=item
        try:return LocalOcrService(r,ReadStorage()).start(u,p)
        except DocumentError as e:return str(e)
    worker=start_worker(); group=None
    try:
        with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
            futures=[pool.submit(run,j) for j in jobs]
            assert entered.wait(15)
            if scenario in ('tesseract','rotations'):
                deadline=time.monotonic()+20;needed=2 if scenario=='rotations' else 1; active=False
                while time.monotonic()<deadline:
                    count=len(marker.read_text().splitlines()) if marker.exists() else 0
                    children=Path(f'/proc/{worker.pid}/task/{worker.pid}/children').read_text().split()
                    for child in children:
                        try:
                            descendants=Path(f'/proc/{child}/task/{child}/children').read_text().split()
                            active=any(b'tesseract' in Path(f'/proc/{x}/cmdline').read_bytes() and b'stdin' in Path(f'/proc/{x}/cmdline').read_bytes() for x in descendants)
                        except OSError:pass
                    if count>=needed and active:break
                    time.sleep(.005)
                assert count>=needed and active
            if scenario not in ('timeout','extreme_noise'):
                if scenario=='queued':
                    deadline=time.monotonic()+15
                    while time.monotonic()<deadline:
                        if all(sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(p)}')=='1' for u,p,r,d in jobs):break
                        time.sleep(.1)
                    else:pytest.fail('jobs were not claimed')
                child=Path(f'/proc/{worker.pid}/task/{worker.pid}/children').read_text().split();assert len(child)==1;group=int(child[0])
            old_tokens={p:sql(f'SELECT lease_token FROM document_ocr_jobs WHERE process_id={lit(p)}') for u,p,r,d in jobs}
            if scenario not in ('timeout','extreme_noise'):
                worker.terminate();worker.wait(timeout=5);release.set()
            results=[f.result(timeout=55) for f in futures]
            assert all(x=='local_ocr_unavailable' for x in results)
        if group:
            with pytest.raises(ProcessLookupError): os.killpg(group,0)
        assert not list(tmp.iterdir())
        if worker.poll() is None:worker.terminate();worker.wait(timeout=5)
        for u,p,r,d in jobs:
            record=json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(p)}'))
            assert record['job_state']=='retry_wait' and record['provider']=='local'
            assert d.read(u,p)['state']=='processing'
            assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(p)}')=='0'
            assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(p)}')=='0'
            assert r.load_tracking(u)==before[u]
            sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(p)}")
            svc=LocalOcrService(r,ReadStorage()); claim=svc._step(u,p,'claim'); new_token=claim['job']['lease_token']
            with pytest.raises(DocumentError,match='stale_review'):svc._step(u,p,'prepare',old_tokens[p])
            svc._step(u,p,'retry',new_token)
            sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(p)}")
        release.set();env['HU23_TESSERACT_BIN']=real;worker=start_worker()
        if scenario=='extreme_noise':
            assert run(jobs[0])=='local_ocr_unavailable'
            record=json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)}'))
            assert record['job_state']=='retry_wait' and record['provider']=='local'
            assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)}')=='0'
            assert repo.load_tracking(user)==before[user]
            return
        for item in jobs:
            u,p,r,d=item; result=run(item)
            assert isinstance(result,dict) and result['process']['state']=='awaiting_review'
            assert run(item)['process']['state']=='awaiting_review'
            assert sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(p)}')=='1'
            assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(p)}')=='1'
            assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(p)}')=='0'
            assert r.load_tracking(u)==before[u]
        if scenario=='download':
            view=docs.read(user,pid); row=view['candidates'][0]
            assert (row['declared_value'],row['detected_value'],row['comparison'])==(1000000,1200000,'difference')
            confirmed=UploadService(repo,ReadStorage()).confirm(user,pid,confirm_command(view,{'ingreso_mensual':'accept_detected'}))
            assert confirmed['state']=='confirmed'
            assert repo.load_tracking(user)['evaluations']==before[user]['evaluations']
            assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(pid)}')=='1'
            scores=score_service(repo); state=scores.status(user); result=scores.update(user,score_command(state))
            assert result['evaluation_id'] and len(repo.load_tracking(user)['evaluations'])==len(before[user]['evaluations'])+1
    finally:
        release.set()
        if worker.poll() is None:worker.terminate();worker.wait(timeout=5)
        storage.shutdown();storage.server_close()
