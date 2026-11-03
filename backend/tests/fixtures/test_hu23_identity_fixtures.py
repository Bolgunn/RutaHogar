import json
import subprocess
from copy import deepcopy
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import hu23_identity_fixtures as fixture
from app.documents.identity import compare_identity


def status_runner(url="http://127.0.0.1:54321"):
    return Mock(return_value=SimpleNamespace(stdout=json.dumps({"API_URL": url, "SERVICE_ROLE_KEY": "local-test-key"})))


@pytest.mark.parametrize("url", ["https://project.supabase.co", "http://localhost.evil:54321",
    "http://127.0.0.1@evil:54321", "http://localhost:54321/redirect", "http://localhost", "", "http://0.0.0.0:54321",
    "http://[::1]:54321", "http://localhost:54321?remote=true", "http://localhost:70000"])
def test_remote_or_ambiguous_status_url_aborts(tmp_path, url):
    run = status_runner(url)
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        fixture.local_settings(tmp_path, {}, run)
    run.assert_called_once()


@pytest.mark.parametrize("url", ["http://localhost:55321", "http://127.0.0.1:54321"])
def test_link_and_remote_configuration_are_ignored_when_status_is_local(tmp_path, url):
    link = tmp_path / "supabase/.temp/project-ref"
    link.parent.mkdir(parents=True)
    link.write_text("remote-reference")
    for directory in (tmp_path, tmp_path / "backend", tmp_path / "frontend"):
        directory.mkdir(exist_ok=True)
        (directory / ".env.local").write_text("SUPABASE_URL=https://remote.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=remote-key\n")
    env = {"SUPABASE_URL": "https://remote.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "remote-key",
           "SUPABASE_SECRET_KEY": "remote-secret", "SUPABASE_PROJECT_REF": "remote-reference",
           "SUPABASE_ACCESS_TOKEN": "remote-token", "SUPABASE_WORKDIR": "/remote-workdir",
           "VERCEL_ENV": "production", "VERCEL_URL": "remote.vercel.app", "NODE_ENV": "production",
           "VITE_SUPABASE_URL": "https://remote.supabase.co", "DATABASE_URL": "postgres://remote/db",
           "DOCKER_HOST": "tcp://remote:2375", "DOCKER_CONTEXT": "remote", "PATH": "/usr/bin"}
    run = status_runner(url)
    assert fixture.local_settings(tmp_path, env, run) == (url, "local-test-key")
    assert run.call_args.args[0][1:] == ["status", "--output", "json"]
    assert run.call_args.kwargs["cwd"] == tmp_path
    assert run.call_args.kwargs["env"] == {"PATH": "/usr/bin"}
    assert link.read_text() == "remote-reference"


@pytest.mark.parametrize("error", [FileNotFoundError(), subprocess.CalledProcessError(1, "supabase status")])
def test_missing_cli_or_inactive_local_stack_aborts(tmp_path, error):
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        fixture.local_settings(tmp_path, {}, Mock(side_effect=error))


@pytest.mark.parametrize("status", [{}, {"API_URL": "http://localhost:54321"}] + [
    {"API_URL": "http://localhost:54321", "SERVICE_ROLE_KEY": key} for key in [None, "", " ", 42]])
def test_incomplete_status_aborts(tmp_path, status):
    run = Mock(return_value=SimpleNamespace(stdout=json.dumps(status)))
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        fixture.local_settings(tmp_path, {}, run)


def test_main_pins_auth_and_database_to_local_status_credentials(monkeypatch, capsys):
    for name, value in {"SUPABASE_URL": "https://remote.supabase.co",
                        "SUPABASE_SERVICE_ROLE_KEY": "remote-key", "SUPABASE_SECRET_KEY": "remote-secret",
                        "VERCEL_ENV": "production"}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(sys, "argv", ["hu23_identity_fixtures.py"])
    monkeypatch.setattr(fixture, "local_settings", lambda: ("http://127.0.0.1:55321", "local-test-key"))

    def inspect(api, repository, service):
        assert api.url == repository.url == "http://127.0.0.1:55321"
        assert api.key == repository.key == "local-test-key"
        assert api.headers["apikey"] == "local-test-key"
        assert str(repository.client.base_url) == "http://127.0.0.1:55321"
        assert not api.client.follow_redirects and not repository.client.follow_redirects
        # Exercise the actual DB request port without any network traffic.
        def respond(request):
            assert request.url.host == "127.0.0.1" and request.url.port == 55321
            assert request.headers["apikey"] == "local-test-key"
            assert request.headers["authorization"] == "Bearer local-test-key"
            return httpx.Response(200, json={"plan": None})
        with httpx.Client(base_url=api.url, transport=httpx.MockTransport(respond)) as client:
            repository.client = client
            assert repository.load("synthetic-user") == {"plan": None}

    ensure = Mock(side_effect=inspect)
    monkeypatch.setattr(fixture, "ensure_fixtures", ensure)
    fixture.main()
    ensure.assert_called_once()
    assert "remote" not in capsys.readouterr().out


def test_main_does_not_open_clients_when_local_stack_is_unverified(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["hu23_identity_fixtures.py"])
    monkeypatch.setattr(fixture, "local_settings", Mock(side_effect=RuntimeError("LOCAL-ONLY: stack no activo")))
    client = Mock()
    monkeypatch.setattr(fixture.httpx, "Client", client)
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        fixture.main()
    client.assert_not_called()


class MemoryTracking:
    def __init__(self):
        self.bundle = {"plan": None, "events": [], "goals": [], "goal_events": [], "evaluations": [], "revision": None}
        self.commits = []

    def load(self, user):
        return deepcopy(self.bundle)

    def commit(self, user, command, revision, records):
        self.commits.append(deepcopy(records))
        self.bundle["plan"] = records["plan"]
        return records["result"]


def test_real_auth_seed_transport_profiles_and_hu13_baseline_are_idempotent():
    users, profiles, tenants, writes = {}, {}, {}, []

    def respond(request):
        assert request.url.host == "127.0.0.1"
        path, method = request.url.path, request.method
        body = json.loads(request.content) if request.content else {}
        if method != "GET":
            writes.append((method, path, deepcopy(body)))
        if path.endswith("/rpc/find_user_id_by_email"):
            return httpx.Response(200, json=users.get(body["p_email"], {}).get("id"))
        if path == "/auth/v1/admin/users":
            assert body["email_confirm"] is True
            row = {"id": str(uuid4()), **body}
            users[body["email"]] = row
            return httpx.Response(200, json=row)
        if path.startswith("/auth/v1/admin/users/"):
            row = next(row for row in users.values() if row["id"] == path.rsplit("/", 1)[-1])
            row.update(body)
            return httpx.Response(200, json=row)
        table = tenants if path.endswith("/inmobiliarias") else profiles
        if method == "GET":
            key = request.url.params["id"].removeprefix("eq.")
            return httpx.Response(200, json=[table[key]] if key in table else [])
        if method == "PATCH":
            table[request.url.params["id"].removeprefix("eq.")].update(body)
        else:
            assert body["id"] not in table
            table[body["id"]] = body
        return httpx.Response(201, json=body)

    repo = MemoryTracking()
    service = fixture.TrackingService(repo, market_snapshot_resolver=fixture.load_fixture_snapshot)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        api = fixture.Supabase(url="http://127.0.0.1:54321", key="test", client=client)
        fixture.ensure_fixtures(api, repo, service)
        first = deepcopy(repo.commits)
        profiles[users[fixture.BUYER["email"]]["id"]]["nombre"] = "Alterado"
        fixture.ensure_fixtures(api, repo, service)
    assert len(users) == 2 and len(profiles) == 2 and len(tenants) == 1
    assert len(repo.commits) == 1 and repo.commits == first
    buyer = profiles[users[fixture.BUYER["email"]]["id"]]
    sales = profiles[users[fixture.SALES["email"]]["id"]]
    assert all(buyer[key] == value for key, value in fixture.IDENTITY.items())
    assert buyer["role"] == "usuario"
    assert sales["role"] == "ejecutivo" and sales["inmobiliaria_id"] == fixture.TENANT_ID
    assert repo.commits[0]["evaluations"][0]["snapshot"]["ingreso_mensual"] == 1450000
    assert compare_identity(buyer, {"name": buyer["full_name"], "rut": "1.111.111-4"}) == "consistent"
    assert compare_identity(buyer, {"name": "Diego Andres Ejemplo Demo", "rut": "2.222.222-8"}) == "inconsistent"
    assert all(users[account["email"]]["password"] == account["password"] for account in (fixture.BUYER, fixture.SALES))
    assert sum(path == "/auth/v1/admin/users" for _, path, _ in writes) == 2
