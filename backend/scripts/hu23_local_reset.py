"""Rebuild the local Supabase stack from the current snapshot, never the linked history."""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import tomllib
from urllib.parse import urlsplit

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from scripts.hu23_identity_fixtures import (  # noqa: E402
    local_cli_environment, local_status, local_url, supabase_executable,
)

# These are existing, reviewed definitions absent/incomplete in schema.sql.
# The historical directory remains untouched and is never replayed by this command.
OVERLAYS = (
    "20260827090000_proyectos_campos_comerciales.sql",
    "20261004110000_fix_hu16_review_issues.sql",
    "20261008090000_hu19_portal_favoritos.sql",
    "20261008150000_lead_contacts_email.sql",
    "20261024120000_security_hu19_rag.sql",
    "20261024120100_security_hu17_scenarios.sql",
    "20261024120200_hu16_fraud_robust_defaults.sql",
    "20261024120300_hu16_lead_history_scope.sql",
    "20261024120400_security_staff_contact_rpcs.sql",
    "20261024120500_security_lead_change_events.sql",
    "20261024130000_hu15_funnel_plan_accepted.sql",
    "20261024130100_hu19_proyectos_rag_tipo_singular.sql",
    "20261029120000_hu23_identity_guard.sql",
)


def build_sql(root=ROOT):
    schema = (root / "supabase/schema.sql").read_text(encoding="utf-8")
    marker = 'drop policy if exists "Profiles select own"'
    if schema.count(marker) != 1:
        raise RuntimeError("LOCAL-ONLY: cambió el punto de inserción del snapshot; revisar bootstrap.")
    base, rest = schema.split(marker, 1)
    prerequisites = "\n".join((root / "supabase/migrations" / name).read_text(encoding="utf-8")
                              for name in ("20260806_housing_plan.sql", "20260922000000_add_name_fields_to_profiles.sql"))
    prerequisites += "\nalter table public.evaluations add column if not exists deleted_at timestamptz;\n"
    prerequisites += "alter table public.improvement_goals add column if not exists completed_at timestamptz;\n"
    # The snapshot declares SQL function bodies before their catalogue dependencies.
    # Disable creation-time body checking only for this bootstrap, not runtime/RLS.
    result = "set check_function_bodies = off;\n" + base + prerequisites + "\n" + marker + rest
    reliability = (root / "supabase/migrations/20261005000000_fix_list_lead_contacts_and_reliability.sql").read_text(encoding="utf-8")
    # Only this overload is absent; the contact RPC later receives its final
    # email/name signature from 20261008150000, rather than its older signature.
    result += "\n" + reliability[reliability.index("CREATE OR REPLACE FUNCTION public.update_lead_reliability"):]
    for name in OVERLAYS:
        result += f"\n-- Local snapshot supplement: {name}\n" + (root / "supabase/migrations" / name).read_text(encoding="utf-8")
    result += "\nset check_function_bodies = on;\nnotify pgrst, 'reload schema';\n"
    # fresh_bootstrap_sql owns the transaction. Embedded snapshot transactions
    # would commit partial schemas and defeat atomic rollback.
    return re.sub(r"(?im)^[ \t]*(?:begin|commit);[ \t]*$", "", result)


def checked_config(root=ROOT):
    raw = (root / "supabase/config.toml").read_text(encoding="utf-8")
    config = tomllib.loads(raw)
    project = config.get("project_id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", project) or project != "RutaHogar-HU23":
        raise RuntimeError("LOCAL-ONLY: se esperaba el project_id local RutaHogar-HU23.")
    for section in ("api", "db"):
        port = config.get(section, {}).get("port")
        if type(port) is not int or not 1024 <= port <= 65535:
            raise RuntimeError("LOCAL-ONLY: puerto local inválido en config.toml.")
    return raw, config


def verify_destination(status, config):
    if local_url(status.get("API_URL")) != config["api"]["port"]:
        raise RuntimeError("LOCAL-ONLY: API local no coincide con config.toml.")
    try:
        db = urlsplit(status["DB_URL"])
        if (db.scheme not in {"postgres", "postgresql"} or db.hostname not in {"localhost", "127.0.0.1"}
                or db.port != config["db"]["port"] or db.path != "/postgres" or db.query or db.fragment):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise RuntimeError("LOCAL-ONLY: DB local no verificable; no se reconstruyó.") from None


def cli_command(workdir, *arguments):
    if any(arg in {"--linked", "--db-url", "--project-ref"} for arg in arguments):
        raise RuntimeError("LOCAL-ONLY: destino alternativo prohibido.")
    return [supabase_executable(), *arguments, "--workdir", str(workdir)]


def run_cli(workdir, *arguments):
    result = subprocess.run(cli_command(workdir, *arguments), env=local_cli_environment(),
                            cwd=workdir, capture_output=True, text=True)
    if result.returncode:
        # Never echo CLI status/start output: it can contain keys.
        # SQL errors from the generated migration contain only versioned source.
        detail = result.stderr[-3000:] if arguments[:2] == ("db", "reset") else ""
        raise RuntimeError(f"LOCAL-ONLY: falló {' '.join(arguments)}. {detail}")


def verify_local_docker():
    result = subprocess.run(["docker", "context", "inspect"], check=True, capture_output=True,
                            text=True, env=local_cli_environment())
    endpoint = json.loads(result.stdout)[0]["Endpoints"]["docker"]["Host"]
    if not (endpoint.startswith("unix:///") or endpoint.startswith("npipe:////./pipe/")):
        raise RuntimeError("LOCAL-ONLY: Docker no usa un socket local; destino rechazado.")


def docker_sql(config, statement):
    verify_local_docker()
    container = "supabase_db_" + config["project_id"]
    env = local_cli_environment()
    # No remote Docker context/host; confirm the inspected container is local and
    # publishes precisely the DB port previously verified against local status.
    inspected = subprocess.run(["docker", "inspect", container], check=True, capture_output=True, text=True, env=env)
    info = json.loads(inspected.stdout)[0]
    bindings = info["NetworkSettings"]["Ports"]["5432/tcp"] or []
    if not info["State"]["Running"] or not any(item["HostPort"] == str(config["db"]["port"]) for item in bindings):
        raise RuntimeError("LOCAL-ONLY: contenedor DB no coincide con el stack local.")
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
                             "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                            input=statement, text=True, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError("LOCAL-ONLY: falló verificación SQL local: " + result.stderr[-2000:])
    return result.stdout.strip()


VERIFY_SQL = """
do $$ begin
  if to_regprocedure('public.hu23_score_context(uuid)') is null
     or to_regprocedure('public.hu23_backing_evidence(uuid,boolean)') is null
     or to_regprocedure('public.hu23_reject_identity(uuid,uuid,integer,uuid)') is null
     or to_regprocedure('public.hu13_read(uuid)') is null then
    raise exception 'faltan RPC HU13/HU23';
  end if;
  if not exists (select 1 from storage.buckets where id='hu23-document-temporary' and not public) then
    raise exception 'falta bucket privado HU23';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.document_processes'::regclass
       and conname='document_processes_failure_code_check' and pg_get_constraintdef(oid) like '%identity_inconsistent%') then
    raise exception 'falta identity guard';
  end if;
  if exists (select 1 from pg_class where oid in ('public.document_processes'::regclass,
      'public.document_candidates'::regclass,'public.document_field_evidence'::regclass) and not relrowsecurity) then
    raise exception 'RLS HU23 no habilitado';
  end if;
  if has_function_privilege('authenticated','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')
     or has_function_privilege('anon','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')
     or not has_function_privilege('service_role','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute') then
    raise exception 'grants identity guard inválidos';
  end if;
end $$;
select 'HU23 local: RPC, identity guard, RLS y bucket privado verificados';
"""


def fresh_bootstrap_sql(snapshot):
    # Only populate a NEW, EMPTY local DB, after the CLI recreated its platform
    # schemas. Never apply DDL over an existing application dataset.
    return """begin;
lock table auth.users, storage.objects in access exclusive mode;
do $$ begin
  if exists(select 1 from pg_tables where schemaname='public')
     or exists(select 1 from auth.users) or exists(select 1 from storage.objects) then
    raise exception 'bootstrap requiere public/Auth/Storage locales vacíos';
  end if;
end $$;
""" + snapshot + "\n" + VERIFY_SQL + "\ncommit;"


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("LOCAL-ONLY: el reset no acepta argumentos ni destinos alternativos.")
    raw, config = checked_config()
    sql = build_sql()
    verify_local_docker()
    # A new workdir contains no link, remote secrets, historical migrations or seeds.
    with tempfile.TemporaryDirectory(prefix="rutahogar-hu23-local-") as directory:
        workdir = Path(directory)
        migrations = workdir / "supabase/migrations"
        migrations.mkdir(parents=True)
        # HU23 uses the FastAPI backend, not Edge Function serving. Do not copy
        # function paths pointing outside the isolated workdir.
        local_config = raw.split("[functions.", 1)[0]
        (workdir / "supabase/config.toml").write_text(local_config + "\n[db.seed]\nenabled = false\n", encoding="utf-8")
        # The CLI initializes its real Auth/Storage schemas with NO application
        # migrations. psql then loads the snapshot once, in one transaction.
        # This also avoids CLI batching/retry of the large concatenated snapshot.
        run_cli(workdir, "start")
        status = local_status(workdir)
        verify_destination(status, config)
        docker_sql(config, "select 1;")
        print("Reconstruyendo sólo Supabase local (borra sus datos locales)...", flush=True)
        run_cli(workdir, "db", "reset", "--local", "--no-seed")
        verify_destination(local_status(workdir), config)
        docker_sql(config, fresh_bootstrap_sql(sql))
        print(docker_sql(config, VERIFY_SQL))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        message = str(exc) if str(exc).startswith("LOCAL-ONLY:") else "LOCAL-ONLY: no se pudo verificar/reconstruir el stack local. Revisa Docker y Supabase."
        sys.exit(message)
