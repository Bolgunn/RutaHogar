#!/usr/bin/env python3
"""Isolated HU30 vertical E2E. Never loads dotenv or targets the hosted project.
Requires Docker images postgres:16-alpine, supabase/gotrue:v2.177.0,
postgrest/postgrest:v12.2.12, python:3.13-slim, Node 22 and local Chromium.
Uses the same accommodated core fixture as test-hu30-persistence.py; not a full
historical migration/bootstrap deployment test. All resources are disposable.
Optional HU30_EDGE_RUNTIME=/absolute/path/to/edge-runtime runs native Deno;
the installed SDK is bundled offline and the std serve import uses Deno.serve.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
NODE = os.environ.get('HU30_NODE') or str(Path.home()/'.nvm/versions/node'/('v'+(ROOT/'.nvmrc').read_text().strip())/'bin/node')
NAME = 'hu30-e2e-' + uuid4().hex[:10]


def docker(*args, **kw):
    return subprocess.run(['docker', *args], text=True, capture_output=True, check=True, **kw)


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def jwt(secret, role):
    def part(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    message = part({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + part({'role': role, 'iss': 'supabase', 'exp': int(time.time()) + 7200})
    return (message + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), message, hashlib.sha256).digest()).rstrip(b'=')).decode()


MAIL = r'''
import socketserver,threading,json,email,email.policy
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
messages=[]
class SMTP(socketserver.StreamRequestHandler):
 def handle(self):
  self.wfile.write(b'220 hu30 test SMTP\r\n');data=[];collect=False;recipient=''
  while True:
   line=self.rfile.readline()
   if not line:return
   if collect:
    if line==b'.\r\n':
     message=email.message_from_bytes(b''.join(data),policy=email.policy.default)
     texts=[p.get_content() for p in message.walk() if p.get_content_type() in ('text/plain','text/html')]
     messages.append({'to':[recipient], 'text':'\n'.join(texts), 'kind':'auth'})
     collect=False;data=[];self.wfile.write(b'250 accepted\r\n')
    else:data.append(line)
   elif line.upper().startswith((b'EHLO',b'HELO')):self.wfile.write(b'250 hu30\r\n')
   elif line.upper().startswith(b'RCPT'):recipient=line.decode().split(':',1)[1].strip(' <>\r\n');self.wfile.write(b'250 ok\r\n')
   elif line.upper().startswith(b'DATA'):collect=True;self.wfile.write(b'354 data\r\n')
   elif line.upper().startswith(b'QUIT'):self.wfile.write(b'221 bye\r\n');return
   else:self.wfile.write(b'250 ok\r\n')
class API(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(messages).encode())
 def do_POST(self):
  messages.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))));self.send_response(200);self.end_headers();self.wfile.write(b'{}')
threading.Thread(target=socketserver.ThreadingTCPServer(('0.0.0.0',2525),SMTP).serve_forever,daemon=True).start()
ThreadingHTTPServer(('0.0.0.0',8080),API).serve_forever()
'''


def main():
    containers, processes, logs = [], [], []
    secret = uuid4().hex + uuid4().hex
    config = {'gateway_port': port(), 'backend_port': port(), 'edge_port': port(), 'vite_port': port(),
              'auth_port': port(), 'rest_port': port(), 'mail_port': port(), 'projection_time': None}
    config.update(url='http://127.0.0.1:' + str(config['gateway_port']),
                  mail='http://127.0.0.1:' + str(config['mail_port']),
                  anon_key=jwt(secret, 'anon'), service_key=jwt(secret, 'service_role'), jwt_secret=secret)
    docker('network', 'create', NAME)
    with tempfile.TemporaryDirectory(prefix=NAME+'-') as directory:
        temp = Path(directory)
        config_path = temp / 'config.json'
        config_path.write_text(json.dumps(config)); config_path.chmod(0o600)
        def start_container(suffix, image, env=None, publish=None, args=None):
            name = NAME + '-' + suffix
            command = ['run', '-d', '--name', name, '--network', NAME, '--network-alias', suffix]
            for key, value in (env or {}).items(): command += ['-e', key + '=' + str(value)]
            for inside, outside in (publish or {}).items(): command += ['-p', f'127.0.0.1:{outside}:{inside}']
            docker(*command, image, *(args or [])); containers.append(name)
        def sql(source):
            try:
                return docker('exec', '-i', NAME+'-db', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', input=source).stdout
            except subprocess.CalledProcessError as error:
                raise RuntimeError(error.stderr) from None
        def wait(url):
            for _ in range(100):
                try:
                    with urlopen(url, timeout=1) as response:
                        if response.status < 400:return
                except Exception:time.sleep(.2)
            raise RuntimeError('Local service did not start: '+url)
        def process(command, env, name, cwd=ROOT):
            log = open('/tmp/hu30-t9a-'+name+'.log', 'w'); logs.append(log)
            child = subprocess.Popen(command, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
            processes.append(child)
        gateway = None
        try:
            start_container('db','postgres:16-alpine', {'POSTGRES_HOST_AUTH_METHOD':'trust'})
            for _ in range(100):
                try:docker('exec',NAME+'-db','pg_isready','-h','127.0.0.1','-U','postgres');break
                except subprocess.CalledProcessError:time.sleep(.2)
            sql('create role anon; create role authenticated; create role service_role bypassrls; create schema auth;')
            start_container('mail','python:3.13-slim', publish={8080:config['mail_port']}, args=['python','-u','-c',MAIL])
            start_container('auth','supabase/gotrue:v2.177.0', {
                'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://postgres@db:5432/postgres?search_path=auth',
                'GOTRUE_API_HOST':'0.0.0.0','PORT':9999,'GOTRUE_API_PORT':9999,
                'API_EXTERNAL_URL':config['url']+'/auth/v1','GOTRUE_SITE_URL':f"http://127.0.0.1:{config['vite_port']}",
                'GOTRUE_URI_ALLOW_LIST':f"http://127.0.0.1:{config['vite_port']}/**",
                'GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_SECRET':secret,'GOTRUE_JWT_EXP':3600,'GOTRUE_JWT_ADMIN_ROLES':'service_role',
                'GOTRUE_MAILER_URLPATHS_CONFIRMATION':'/auth/v1/verify','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'false',
                'GOTRUE_SMTP_HOST':'mail','GOTRUE_SMTP_PORT':2525,'GOTRUE_SMTP_ADMIN_EMAIL':'noreply@hu30.invalid',
                'GOTRUE_SMTP_SENDER_NAME':'RutaHogar test','GOTRUE_SMTP_MAX_FREQUENCY':'1s','GOTRUE_RATE_LIMIT_EMAIL_SENT':1000,
            }, publish={9999:config['auth_port']})
            wait(f"http://127.0.0.1:{config['auth_port']}/health")
            core = (ROOT/'supabase/schema.sql').read_text().split('-- HU30 T3 — accumulated persistence and authorization state')[0]
            a=core.index('create extension if not exists vector;');b=core.index('-- HU18',a);core=core[:a]+core[b:]
            marker='DROP TRIGGER IF EXISTS trg_check_housing_plan_progress'
            core=core.replace(marker,'alter table public.evaluations add column if not exists housing_plan jsonb;\n'+marker)
            sql("""grant usage on schema public,auth to anon,authenticated,service_role;
              grant execute on function auth.uid() to anon,authenticated,service_role;
              alter default privileges in schema public grant all on tables to service_role;
              create publication supabase_realtime;
              set check_function_bodies=off;"""+core+'\nset check_function_bodies=on;')
            sql((ROOT/'supabase/migrations/20260922000000_add_name_fields_to_profiles.sql').read_text())
            sql((ROOT/'supabase/migrations/20260827090000_proyectos_campos_comerciales.sql').read_text())
            sql((ROOT/'supabase/migrations/20261008150000_lead_contacts_email.sql').read_text())
            for migration in sorted((ROOT/'supabase/migrations').glob('2026102*hu30*.sql')):sql(migration.read_text())
            # Supabase normally supplies public-schema table ACLs; RLS still scopes every actor.
            sql('grant all on all tables in schema public to anon,authenticated; grant usage,select on all sequences in schema public to anon,authenticated;')
            start_container('rest','postgrest/postgrest:v12.2.12', {
                'PGRST_DB_URI':'postgres://postgres@db:5432/postgres','PGRST_DB_SCHEMAS':'public',
                'PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':secret,'PGRST_SERVER_PORT':3000,
            },publish={3000:config['rest_port']})
            class NoRedirect(HTTPRedirectHandler):
                def redirect_request(self, *args): return None
            proxy_open = build_opener(NoRedirect()).open
            class Gateway(BaseHTTPRequestHandler):
                def log_message(self,*args):pass
                def do_OPTIONS(self):self.proxy()
                def do_GET(self):self.proxy()
                def do_POST(self):self.proxy()
                def do_PATCH(self):self.proxy()
                def do_DELETE(self):self.proxy()
                def proxy(self):
                    if self.path=='/__test/time':
                        value=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
                        config['projection_time']=value['time'];config_path.write_text(json.dumps(config))
                        self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
                    routes=[('/auth/v1',config['auth_port']),('/rest/v1',config['rest_port']),('/functions/v1',config['edge_port'])]
                    for prefix,target in routes:
                        if self.path.startswith(prefix):break
                    else:self.send_error(404);return
                    body=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
                    headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length','connection','accept-encoding')}
                    request=Request(f'http://127.0.0.1:{target}'+self.path[len(prefix):],data=body,headers=headers,method=self.command)
                    try:response=proxy_open(request,timeout=40)
                    except __import__('urllib.error',fromlist=['HTTPError']).HTTPError as error:response=error
                    with response:
                        self.send_response(response.status)
                        for k,v in response.headers.items():
                            if k.lower() not in ('content-length','transfer-encoding','connection','access-control-allow-origin'):self.send_header(k,v)
                        # Preserve the function's real CORS decision (including no ACAO on denial).
                        allow_origin=response.headers.get('Access-Control-Allow-Origin')
                        if prefix!='/functions/v1':allow_origin=allow_origin or '*'
                        if allow_origin:self.send_header('Access-Control-Allow-Origin',allow_origin)
                        if prefix!='/functions/v1':
                            self.send_header('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version')
                            self.send_header('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
                        self.end_headers();
                        try:self.wfile.write(response.read())
                        except (BrokenPipeError,ConnectionResetError):pass
            gateway=ThreadingHTTPServer(('127.0.0.1',config['gateway_port']),Gateway)
            threading.Thread(target=gateway.serve_forever,daemon=True).start()
            wait(config['url']+'/auth/v1/health');wait(config['mail'])
            env={**os.environ,'SUPABASE_URL':config['url'],'SUPABASE_SECRET_KEY':config['service_key'],
                 'SUPABASE_SERVICE_ROLE_KEY':config['service_key'],'SUPABASE_ANON_KEY':config['anon_key'],
                 'APP_PUBLIC_URL':f"http://127.0.0.1:{config['vite_port']}",'RESEND_API_KEY':'local-capture-only',
                 'CO_DEBTOR_FROM_EMAIL':'test@hu30.invalid','CO_DEBTOR_INVITATION_TTL_DAYS':'7','HU30_TEST_MAIL_URL':config['mail'],'HU30_E2E_CONFIG':str(config_path),'HU30_BACKEND_PORT':str(config['backend_port']),
                 'CRM_MOCK_API_KEY':secret,'VITE_CRM_MOCK_API_KEY':secret,'VITE_SUPABASE_URL':config['url'],'VITE_SUPABASE_PUBLISHABLE_KEY':config['anon_key'],
                 'VITE_API_URL':f"http://127.0.0.1:{config['backend_port']}",'RUTAHOGAR_ALLOWED_ORIGINS':f"http://127.0.0.1:{config['vite_port']}",'PYTHONDONTWRITEBYTECODE':'1','BCCH_API_KEY_TOKEN':'','GROQ_API_KEY':''}
            edge=temp/'edge';shutil.copytree(ROOT/'supabase/functions/co-debtor-consent',edge)
            runtime=os.environ.get('HU30_EDGE_RUNTIME')
            sdk=ROOT/'frontend/node_modules/@supabase/supabase-js/dist/index.mjs'
            assert json.loads((sdk.parent.parent/'package.json').read_text())['version']=='2.106.2', 'Local SDK differs from the pinned Edge dependency'
            adapter=ROOT/'scripts/hu30-e2e/edge-transport.mjs'
            if runtime:
                # Offline ESM bundle of the installed SDK, no fake Auth/RPC implementation.
                bundle=temp/'bundle-sdk.mjs';sdk_output=temp/'sdk.mjs'
                bundle.write_text("import {rolldown} from "+json.dumps(str(ROOT/'frontend/node_modules/rolldown/dist/index.mjs'))+";const bundle=await rolldown({input:"+json.dumps(str(sdk))+",platform:'browser'});await bundle.write({file:"+json.dumps(str(sdk_output))+",format:'esm'});await bundle.close();")
                subprocess.run([NODE,str(bundle)],env=env,check=True,timeout=60)
                sdk=sdk_output;adapter=ROOT/'scripts/hu30-e2e/edge-native.mjs'
            local_adapter=edge/'edge-adapter.mjs';shutil.copyfile(adapter,local_adapter);adapter='./edge-adapter.mjs'
            if runtime:
                local_sdk=edge/'sdk.mjs';shutil.copyfile(sdk,local_sdk);sdk='./sdk.mjs'
            main=edge/'index.ts'
            main.write_text(main.read_text().replace('"https://deno.land/std@0.168.0/http/server.ts"',json.dumps(str(adapter))).replace('"https://esm.sh/@supabase/supabase-js@2.106.2"',json.dumps(str(sdk))))
            if runtime:
                process([runtime,'start','--main-service',str(edge),'--port',str(config['edge_port'])],env,'edge')
            else:
                process([NODE,'--experimental-strip-types',str(main)],env,'edge')
            process([str(ROOT/'backend/.venv/bin/python'),str(ROOT/'scripts/hu30-e2e/backend.py')],env,'api')
            vite_config=temp/'vite.config.mjs'
            vite_config.write_text("import fs from 'node:fs'; import base from "+json.dumps(str(ROOT/'frontend/vite.config.js'))+"; export default {...base,server:{...base.server,hmr:false},plugins:[{name:'hu30-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(['/__session'].includes(new URL(req.url,'http://local').pathname)){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync("+json.dumps(str(temp/'fixture.html'))+"));}else next();});}}]};")
            process([NODE,'node_modules/vite/bin/vite.js','--config',str(vite_config),'--host','127.0.0.1','--port',str(config['vite_port'])],env,'vite',ROOT/'frontend')
            wait(f"http://127.0.0.1:{config['backend_port']}/docs");wait(f"http://127.0.0.1:{config['vite_port']}")
            config['container']=NAME+'-db';config_path.write_text(json.dumps(config))
            print('Local real Auth + PostgREST + PostgreSQL + production services ready; Edge='+('native Deno' if runtime else 'Node adapter'),flush=True)
            subprocess.run([NODE,str(ROOT/'scripts/hu30-e2e/browser.mjs')],env=env,check=True,timeout=240)
        finally:
            for child in reversed(processes):child.terminate()
            for child in reversed(processes):
                try:child.wait(timeout=10)
                except subprocess.TimeoutExpired:child.kill();child.wait()
            for log in logs:log.close()
            if gateway:gateway.shutdown()
            for name in reversed(containers):subprocess.run(['docker','rm','-f',name],capture_output=True)
            subprocess.run(['docker','network','rm',NAME],capture_output=True)

if __name__=='__main__':main()
