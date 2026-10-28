"""Private loopback HTTP boundary; no request/access logging or document persistence."""
import hmac
import json
import os
import signal
import subprocess
import sys
import time
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer

from app.documents.contracts import DocumentType
from .engine import source_url


class ServerStopping(BaseException):
    pass


def stop_child(child):
    """Terminate only this request's process group, then reap its leader."""
    if os.name == 'posix':
        try:
            os.killpg(child.pid, signal.SIGTERM)
            # Keep the group leader unreaped during the grace period so its PID
            # cannot be reused before the final group signal.
            time.sleep(0.2)
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    else:
        child.kill()
    child.communicate()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass

    def log_error(self, *args):
        pass

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/health':
            self.reply(404, {'error': 'not_found'})
            return
        self.reply(200, {'status': 'ok'})

    def do_POST(self):
        token = os.environ.get('HU23_LOCAL_OCR_TOKEN', '')
        supplied = self.headers.get('Authorization', '')
        if len(token) < 32 or not hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode()):
            self.reply(401, {'error': 'unauthorized'})
            return
        if self.path != '/v1/parse':
            self.reply(404, {'error': 'not_found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192 or self.headers.get('Transfer-Encoding'):
                raise ValueError
            request = json.loads(self.rfile.read(length))
            if set(request) != {'source_url', 'document_type', 'reference_date'}:
                raise ValueError
            DocumentType(request['document_type'])
            date.fromisoformat(request['reference_date'])
            source_url(request['source_url'], os.environ['HU23_OCR_STORAGE_ORIGIN'])
        except Exception:
            self.reply(422, {'error': 'invalid_request'})
            return
        try:
            self.server.spawning = True
            try:
                child = subprocess.Popen([sys.executable, '-m', 'workers.hu23_ocr.task'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    start_new_session=os.name == 'posix')
            except BaseException:
                self.server.spawning = False
                raise
            try:
                self.server.spawning = False
                if getattr(self.server, 'stopping', False):
                    raise ServerStopping
                try:
                    output, _ = child.communicate(json.dumps(request).encode(), timeout=45)
                except subprocess.TimeoutExpired:
                    raise
                if child.returncode or len(output) > 4096:
                    raise ValueError
            except BaseException:
                self.server.cleaning = True
                try:
                    stop_child(child)
                finally:
                    self.server.cleaning = False
                if getattr(self.server, 'stopping', False):
                    raise ServerStopping
                raise
            payload = json.loads(output)
            # The child emits the shared candidate contract, never OCR/layout.
            self.reply(200, payload)
        except (ValueError, subprocess.SubprocessError, OSError):
            self.reply(503, {'error': 'local_processing_failed'})


class QuietServer(HTTPServer):
    def handle_error(self, *args):
        pass


def main():
    token = os.getenv('HU23_LOCAL_OCR_TOKEN', '')
    if len(token) < 32 or token != token.strip() or not os.getenv('HU23_OCR_STORAGE_ORIGIN'):
        raise SystemExit('Set HU23_LOCAL_OCR_TOKEN (32+ characters) and HU23_OCR_STORAGE_ORIGIN.')
    port = int(os.getenv('HU23_LOCAL_OCR_PORT', '8011'))
    # Deliberately one request at a time; put a secured private proxy in front for a VM.
    with QuietServer((os.getenv('HU23_LOCAL_OCR_BIND', '127.0.0.1'), port), Handler) as server:
        server.spawning = False
        server.cleaning = False
        server.stopping = False
        def stop(signum, frame):
            if server.stopping:
                return
            server.stopping = True
            if not server.spawning and not server.cleaning:
                raise ServerStopping
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, stop)
        print('HU23 OCR worker listening on loopback; request logging disabled.', flush=True)
        try:
            server.serve_forever()
        except ServerStopping:
            pass


if __name__ == '__main__':
    main()
