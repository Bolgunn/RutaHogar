"""Opt-in disposable Docker SIGTERM/SIGKILL against a persisted local HU23 job."""
import base64,json,os,shutil,socket,subprocess,threading,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
import pytest
from app.documents.contracts import DocumentError
from app.documents.local_ocr import LocalOcrService
from test_local_ocr_persistence import Storage
from test_persistence import setup,admit_upload,sql,lit,pytestmark

@pytest.mark.skipif(os.getenv('HU23_DOCKER_REAL_TEST')!='1' or not shutil.which('docker'),reason='opt-in Docker integration')
@pytest.mark.parametrize('mode',['term','kill'])
def test_docker_stop_retries_persisted_job(setup,monkeypatch,tmp_path,mode):
    root=Path(__file__).resolve().parents[3];worker_python=os.getenv('HU23_WORKER_TEST_PYTHON')
    fixture_python=os.getenv('HU23_FIXTURE_TEST_PYTHON')
    if not worker_python or not fixture_python: pytest.skip('worker and fixture venv required')
    env={**os.environ,'PYTHONPATH':str(root/'backend')+os.pathsep+str(root)}
    gen='from workers.hu23_ocr.synthetic import fixtures;import sys;sys.stdout.buffer.write(next(d for n,k,e,d in fixtures() if n=="payslip_rotated_scan"))'
    (tmp_path/'fixture.pdf').write_bytes(subprocess.check_output([fixture_python,'-c',gen],cwd=root,env=env))
    # Docker daemon must be able to read files from the disposable test directory.
    tmp_path.chmod(0o755)
    storage_script='''from http.server import BaseHTTPRequestHandler,HTTPServer
data=open('/test/fixture.pdf','rb').read()
class H(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
HTTPServer(('127.0.0.1',18021),H).serve_forever()
'''
    proxy_script='''import socket,threading
def copy(a,b):
 try:
  while True:
   d=a.recv(65536)
   if not d: break
   b.sendall(d)
 except OSError:pass
 finally:
  try:b.shutdown(socket.SHUT_WR)
  except OSError:pass
def serve(c):
 s=socket.create_connection(('127.0.0.1',18011));threading.Thread(target=copy,args=(c,s),daemon=True).start();copy(s,c);s.close();c.close()
l=socket.socket();l.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);l.bind(('0.0.0.0',18012));l.listen()
while True:
 c,_=l.accept();threading.Thread(target=serve,args=(c,),daemon=True).start()
'''
    freeze_script='''import os,signal
targets=[]
for n in os.listdir('/proc'):
 if not n.isdigit():continue
 try:
  c=open('/proc/'+n+'/cmdline','rb').read()
  if (b'workers.hu23_ocr.server' in c or (b'tesseract' in c and b'stdin' in c)) and int(n)!=os.getpid():targets.append(int(n))
 except OSError:pass
for p in targets:os.kill(p,signal.SIGSTOP)
assert len(targets)>=2
'''
    watch_script='''import os,signal,time
while True:
 for n in os.listdir('/proc'):
  if not n.isdigit():continue
  try:
   c=open('/proc/'+n+'/cmdline','rb').read()
   if b'tesseract' in c and b'stdin' in c and int(n)!=os.getpid():
    os.kill(int(n),signal.SIGSTOP);raise SystemExit(0)
  except OSError:pass
 time.sleep(.002)
'''
    for name,text in [('storage.py',storage_script),('proxy.py',proxy_script),('freeze.py',freeze_script),('watch.py',watch_script)]:(tmp_path/name).write_text(text)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    token='synthetic-worker-integration-token-32-chars';name='hu23-e2e-'+mode+'-'+uuid4().hex[:10]
    def docker(*args,check=True):
        p=subprocess.run(['docker',*args],capture_output=True,text=True)
        if check and p.returncode:raise RuntimeError('docker failed: '+p.stderr[-400:])
        return p
    def start(*, pause_ocr=False):
        docker('run','-d','--init','--cpus=1','--memory=1g','--memory-swap=1g','--stop-timeout=2',
            '--name',name,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--tmpfs','/tmp/hu23-worker','-p',f'127.0.0.1:{port}:18012',
            '-v',str(tmp_path)+':/test:ro',
            '-e','HU23_LOCAL_OCR_BIND=0.0.0.0','-e','HU23_LOCAL_OCR_TOKEN='+token,
            '-e','TMPDIR=/tmp/hu23-worker',
            '-e','HU23_OCR_STORAGE_ORIGIN=http://127.0.0.1:18021','-e','HU23_LOCAL_OCR_PORT=18011',
            '--entrypoint','python','rutahogar-hu23-ocr-local:dev','-m','workers.hu23_ocr.server')
        for script in ('storage.py','proxy.py'):
            docker('exec','-d',name,'python','/test/'+script)
        for _ in range(100):
            probe=docker('exec',name,'python','-c',"import socket; socket.create_connection(('127.0.0.1',18011),1).close(); socket.create_connection(('127.0.0.1',18021),1).close()",check=False)
            if probe.returncode==0:break
            time.sleep(.05)
        else:pytest.fail('container worker or storage not ready')
        if pause_ocr:docker('exec','-d',name,'python','/test/watch.py')
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.1):return
            except OSError:time.sleep(.05)
        pytest.fail('container did not expose test proxy')
    user,pid,repo,docs=setup;admit_upload(user,pid,repo);before=repo.load_tracking(user)
    class ReadStorage(Storage):
        def signed_read(self,path,*,local_worker=False):return 'http://127.0.0.1:18021/storage/v1/object/sign/hu23-document-temporary/'+path+'?token=synthetic'
    monkeypatch.setenv('HU23_OCR_PROVIDER','local');monkeypatch.setenv('HU23_LOCAL_OCR_URL',f'http://127.0.0.1:{port}');monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN',token)
    svc=LocalOcrService(repo,ReadStorage())
    def run():
        try:return svc.start(user,pid)
        except DocumentError as e:return str(e)
    try:
        start(pause_ocr=True)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(run);deadline=time.monotonic()+20
            while time.monotonic()<deadline:
                listing=docker('top',name,'-eo','pid,comm,args').stdout
                if 'tesseract stdin stdout' in listing:break
                time.sleep(.02)
            else:pytest.fail('no active OCR')
            ocr_pid=next(line.split()[0] for line in listing.splitlines() if 'tesseract stdin stdout' in line)
            group_probe="import json,sys; print(json.dumps([('/sys/fs/cgroup/'+c.split(',')[0]+p) for _,c,p in (x.strip().split(':',2) for x in open('/proc/'+sys.argv[1]+'/cgroup')) if c in ('memory','cpu,cpuacct','cpu')]))"
            host_args=['run','--rm','--pid=host','--cgroupns=host','--network=none','--entrypoint','python','rutahogar-hu23-ocr-local:dev']
            groups=json.loads(docker(*host_args,'-c',group_probe,ocr_pid).stdout)
            assert groups and all('/docker/' in group or '/docker-' in group for group in groups)
            old=sql(f'SELECT lease_token FROM document_ocr_jobs WHERE process_id={lit(pid)}')
            docker('exec',name,'python','-c',"import os; assert not os.listdir('/tmp/hu23-worker')")
            if mode=='kill':
                docker('exec',name,'python','/test/freeze.py')
                docker('stop','--time','1',name)
            else:docker('stop','--time','2',name)
            state=json.loads(docker('inspect',name).stdout)[0]['State']
            assert not state['Running'] and state['ExitCode']==(137 if mode=='kill' else 0)
            assert docker('top',name,check=False).returncode!=0
            # Docker Desktop runs in another Linux VM; inspect its PID namespace,
            # not the WSL client's unrelated /proc. This sidecar needs no privileges.
            docker(*host_args,'-c',"import os,sys; assert not os.path.exists('/proc/'+sys.argv[1])",ocr_pid)
            assert future.result(timeout=20)=='local_ocr_unavailable'
        record=json.loads(sql(f'SELECT to_jsonb(j) FROM document_ocr_jobs j WHERE process_id={lit(pid)}'))
        assert record['job_state']=='retry_wait' and record['provider']=='local'
        assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)}')=='0'
        assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(pid)}')=='0'
        assert repo.load_tracking(user)==before
        docker('rm',name);assert docker('inspect',name,check=False).returncode!=0
        check_groups="import json,os,sys,time; p=json.loads(sys.argv[1]); time.sleep(.2); assert all(not os.path.exists(x) for x in p)"
        docker(*host_args,'-c',check_groups,json.dumps(groups))
        sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)}")
        claim=svc._step(user,pid,'claim')
        with pytest.raises(DocumentError,match='stale_review'):svc._step(user,pid,'prepare',old)
        svc._step(user,pid,'retry',claim['job']['lease_token'])
        sql(f"UPDATE document_ocr_jobs SET next_attempt_at=now()-interval '1 second' WHERE process_id={lit(pid)}")
        start();result=run()
        assert result['process']['state']=='awaiting_review'
        assert sql(f'SELECT count(*) FROM document_candidates WHERE process_id={lit(pid)}')=='1'
        assert sql(f'SELECT count(*) FROM document_ocr_jobs WHERE process_id={lit(pid)}')=='1'
        assert sql(f'SELECT count(*) FROM document_field_evidence WHERE process_id={lit(pid)}')=='0'
        docker('exec',name,'python','-c',"import os; assert not os.listdir('/tmp/hu23-worker')")
        assert repo.load_tracking(user)==before
    finally:
        docker('rm','-f',name,check=False)
        for filename in ('fixture.pdf','storage.py','proxy.py','freeze.py','watch.py'):
            (tmp_path/filename).unlink(missing_ok=True)
