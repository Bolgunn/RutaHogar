"""Compose must take the credential from its env_file, not a stale shell variable."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


def test_compose_uses_crlf_env_file_instead_of_shell_override(tmp_path):
    if not shutil.which('docker'):
        pytest.skip('Docker Compose not installed')
    compose = Path(__file__).resolve().parents[1] / 'compose.local.yml'
    (tmp_path / 'compose.local.yml').write_bytes(compose.read_bytes())
    (tmp_path / '.local').mkdir()
    (tmp_path / '.local/worker.env').write_bytes(
        b'HU23_LOCAL_OCR_TOKEN=synthetic-clean-token-at-least-32-chars\r\n'
        b'HU23_OCR_STORAGE_ORIGIN=http://127.0.0.1:54321\r\n')
    env = {**os.environ, 'HU23_LOCAL_OCR_TOKEN': 'synthetic-stale-shell-token-with-cr\r',
           'HU23_OCR_STORAGE_ORIGIN': 'http://other.invalid:1234'}
    result = subprocess.run(['docker', 'compose', '-f', str(tmp_path / 'compose.local.yml'),
                             'config', '--format', 'json'], env=env, capture_output=True, text=True)
    if result.returncode and 'not a docker command' in result.stderr:
        pytest.skip('Docker Compose not installed')
    assert result.returncode == 0, 'docker compose config failed'
    variables = json.loads(result.stdout)['services']['worker']['environment']
    assert variables['HU23_LOCAL_OCR_TOKEN'] == 'synthetic-clean-token-at-least-32-chars'
    assert variables['HU23_OCR_STORAGE_ORIGIN'] == 'http://127.0.0.1:54321'
