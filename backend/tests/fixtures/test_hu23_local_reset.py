import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import hu23_local_reset as reset


def config():
    return {"project_id": "RutaHogar-HU23", "api": {"port": 55321}, "db": {"port": 54322}}


@pytest.mark.parametrize("api,db", [
    ("https://remote.supabase.co", "postgres://postgres@127.0.0.1:54322/postgres"),
    ("http://127.0.0.1:54321", "postgres://postgres@127.0.0.1:54322/postgres"),
    ("http://127.0.0.1:55321", "postgres://postgres@remote:54322/postgres"),
    ("http://127.0.0.1:55321", "postgres://postgres@localhost:55322/postgres"),
    ("http://127.0.0.1:55321", "postgres://postgres@localhost:54322/production"),
    ("http://127.0.0.1:55321", "postgres://postgres@localhost:54322/postgres?host=remote"),
])
def test_reset_rejects_unverified_api_or_database(api, db):
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        reset.verify_destination({"API_URL": api, "DB_URL": db}, config())


def test_reset_accepts_only_matching_local_stack():
    reset.verify_destination({"API_URL": "http://127.0.0.1:55321", "DB_URL": "postgres://postgres:local@localhost:54322/postgres"}, config())


@pytest.mark.parametrize("endpoint", ["ssh://production", "tcp://remote:2375", "tcp://127.0.0.1:2375"])
def test_remote_or_ambiguous_docker_context_rejected(monkeypatch, endpoint):
    run = Mock(return_value=SimpleNamespace(stdout=json.dumps([{"Endpoints": {"docker": {"Host": endpoint}}}])))
    monkeypatch.setattr(reset.subprocess, "run", run)
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        reset.verify_local_docker()
    assert run.call_args.args[0] == ["docker", "context", "inspect"]


@pytest.mark.parametrize("flag", ["--linked", "--db-url", "--project-ref"])
def test_reset_has_no_remote_cli_mode(tmp_path, flag):
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        reset.cli_command(tmp_path, "db", "reset", flag)


def test_cli_isolated_cwd_and_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "remote-token")
    monkeypatch.setenv("SUPABASE_PROJECT_REF", "remote-ref")
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("DOCKER_HOST", "tcp://remote:2375")
    run = Mock(return_value=SimpleNamespace(returncode=0))
    monkeypatch.setattr(reset.subprocess, "run", run)
    reset.run_cli(tmp_path, "db", "reset", "--local", "--no-seed")
    assert run.call_args.args[0][1:] == ["db", "reset", "--local", "--no-seed", "--workdir", str(tmp_path)]
    assert run.call_args.kwargs["cwd"] == tmp_path
    assert not any(key.startswith(("SUPABASE", "VERCEL", "DOCKER")) for key in run.call_args.kwargs["env"])


def test_full_snapshot_includes_missing_dependencies_and_identity_guard():
    snapshot = reset.build_sql()
    assert snapshot.count("create table public.document_processes") == 1
    assert "ADD COLUMN IF NOT EXISTS nombre text" in snapshot
    assert "add column if not exists housing_plan jsonb" in snapshot
    assert "add column if not exists deleted_at timestamptz" in snapshot
    assert "add column if not exists completed_at timestamptz" in snapshot
    assert "FUNCTION public.update_lead_reliability(p_lead_id uuid, p_status text)" in snapshot
    assert "create function public.hu23_reject_identity" in snapshot
    assert "create function public.hu23_score_context" in snapshot
    assert "create function public.hu23_backing_evidence" in snapshot
    assert not re.search(r"(?im)^\s*(begin|commit);\s*$", snapshot)
    assert "onboarding_data = ''" not in snapshot
    sql = reset.fresh_bootstrap_sql(snapshot)
    assert sql.index("bootstrap requiere public/Auth/Storage locales vacíos") < sql.index("create table if not exists public.profiles")


def test_main_stops_before_start_if_docker_is_not_local(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["hu23_local_reset.py"])
    monkeypatch.setattr(reset, "verify_local_docker", Mock(side_effect=RuntimeError("LOCAL-ONLY: Docker remoto")))
    cli = Mock()
    monkeypatch.setattr(reset, "run_cli", cli)
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        reset.main()
    cli.assert_not_called()


def test_main_never_resets_an_unverified_destination(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["hu23_local_reset.py"])
    monkeypatch.setattr(reset, "verify_local_docker", Mock())
    cli = Mock()
    monkeypatch.setattr(reset, "run_cli", cli)
    monkeypatch.setattr(reset, "local_status", lambda _: {"API_URL": "https://remote.supabase.co", "DB_URL": "postgres://remote/postgres"})
    with pytest.raises(RuntimeError, match="LOCAL-ONLY"):
        reset.main()
    assert [call.args[1:] for call in cli.call_args_list] == [("start",)]
