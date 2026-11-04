"""Opt-in schema audit in NEW disposable DBs of the verified local container.

HU23_LOCAL_BOOTSTRAP_TEST=1 python -m pytest backend/tests/fixtures -q
No application data is copied and the live application's DB is never modified.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import hu23_local_reset as reset

pytestmark = pytest.mark.skipif(os.getenv("HU23_LOCAL_BOOTSTRAP_TEST") != "1", reason="opt-in disposable local Docker schema audit")


def test_full_snapshot_and_all_68_historical_migrations_in_disposable_local_databases():
    _, config = reset.checked_config()
    reset.verify_local_docker()
    reset.verify_destination(reset.local_status(), config)
    container = "supabase_db_" + config["project_id"]

    def docker(*args, source=None):
        return subprocess.run(["docker", "exec", "-i", container, *args], input=source,
                              text=True, capture_output=True, env=reset.local_cli_environment())

    def sql(db, source, *, check=True):
        result = docker("psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", source=source)
        if check:
            assert result.returncode == 0, result.stderr[-2500:]
        return result

    # Only system SCHEMA is copied, never users, credentials or application data.
    dump = docker("pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--no-owner", "--no-privileges",
                  "--schema=auth", "--schema=storage", "--schema=extensions", "--schema=supabase_functions")
    assert dump.returncode == 0
    # The running local stack already has HU23's cross-schema Storage triggers
    # and policies. Those belong to the application snapshot, not the platform.
    platform = re.sub(r'(?ims)^CREATE TRIGGER hu23_.*?;\n', '', dump.stdout)
    platform = re.sub(r'(?ims)^CREATE POLICY "HU23.*?;\n', '', platform)

    @contextmanager
    def database():
        name = "hu23_schema_audit_" + uuid4().hex
        result = docker("createdb", "-U", "postgres", "--template", "template0", name)
        assert result.returncode == 0, result.stderr
        try:
            sql(name, "set check_function_bodies=off;\n" + platform + "\ncreate publication supabase_realtime; set check_function_bodies=on;")
            yield name
        finally:
            result = docker("dropdb", "-U", "postgres", "--force", name)
            assert result.returncode == 0, result.stderr

    def atomic(source):
        return "begin;\n" + re.sub(r"(?im)^[ \t]*(?:begin|commit);[ \t]*$", "", source) + "\ncommit;"

    columns = "select table_name||'.'||column_name||':'||udt_name from information_schema.columns where table_schema='public' order by 1;"
    functions = "select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;"
    with database() as snapshot, database() as historical:
        sql(snapshot, reset.fresh_bootstrap_sql(reset.build_sql()))
        # Real grants/RLS/bucket and identity assertions, also used by HU23's SQL suite.
        for name in ("hu23_identity.sql", "hu23_storage.sql"):
            sql(snapshot, (reset.ROOT / "supabase/tests" / name).read_text())
        # Applying over existing data/schema is explicitly refused, even locally.
        refused = sql(snapshot, reset.fresh_bootstrap_sql(reset.build_sql()), check=False)
        assert refused.returncode and "bootstrap requiere" in refused.stderr

        base = (reset.ROOT / "supabase/schema.sql").read_text().split('drop policy if exists "Profiles select own"')[0]
        sql(historical, base)
        observed = sql(historical, "select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.profiles'::regclass and attname='onboarding_data';")
        assert observed.stdout.strip() == "jsonb"
        paths = sorted((reset.ROOT / "supabase/migrations").glob("*.sql"))
        original = paths[0].read_text()
        failed = sql(historical, atomic(original), check=False)
        assert failed.returncode and "invalid input syntax for type json" in failed.stderr
        # Diagnostic repairs ONLY IN MEMORY, never edits to historical files.
        corrected = original.replace("onboarding_data = ''", "onboarding_data::text = ''")
        failed = sql(historical, atomic(corrected), check=False)
        assert failed.returncode and 'column "deleted_at" does not exist' in failed.stderr
        sql(historical, "alter table public.evaluations add column deleted_at timestamptz; alter table public.improvement_goals add column completed_at timestamptz;")
        sql(historical, atomic(corrected))
        for path in paths[1:]:
            sql(historical, atomic(path.read_text()))
        assert paths[0].read_text() == original
        # The snapshot must cover all public columns and RPC signatures in the
        # full historical replay, not merely the two formerly missing HU23 RPCs.
        for query in (columns, functions):
            expected = set(sql(historical, query).stdout.splitlines())
            actual = set(sql(snapshot, query).stdout.splitlines())
            assert expected <= actual, sorted(expected - actual)
