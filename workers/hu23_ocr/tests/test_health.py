import pytest
from urllib.request import urlopen
import threading
from workers.hu23_ocr.server import Handler, QuietServer


def test_health_contains_only_status():
    server=QuietServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with urlopen(f'http://127.0.0.1:{server.server_port}/health',timeout=2) as response:
            assert response.status == 200 and response.read() == b'{"status": "ok"}'
    finally:
        server.shutdown();server.server_close()


def test_host_docker_origin_requires_exact_match():
    from uuid import uuid4
    from workers.hu23_ocr.engine import source_url, WorkerError
    path='/storage/v1/object/sign/hu23-document-temporary/'+str(uuid4())+'/'+str(uuid4())+'/'+str(uuid4())+'.pdf?token=synthetic'
    assert source_url('http://host.docker.internal:55321'+path, 'http://host.docker.internal:55321')[1] == 'pdf'
    with pytest.raises(WorkerError): source_url('http://other.invalid:55321'+path, 'http://host.docker.internal:55321')
    with pytest.raises(WorkerError): source_url('http://other.invalid:55321'+path, 'http://other.invalid:55321')
import pytest

@pytest.mark.parametrize('suffix', ['\r', '\n', ' ', '\t'])
def test_worker_refuses_token_with_invisible_whitespace(monkeypatch, suffix):
    from workers.hu23_ocr.server import main
    monkeypatch.setenv('HU23_LOCAL_OCR_TOKEN', 'synthetic-test-token-32-characters' + suffix)
    monkeypatch.setenv('HU23_OCR_STORAGE_ORIGIN', 'http://127.0.0.1:54321')
    with pytest.raises(SystemExit):
        main()
