"""Removes a demo seed (seed_hu15_demo.py, seed_sprint_heroes.py): renders seed_hu15_demo_teardown.sql
for one email prefix and tenant and applies it in a single transaction.

  --check   runs the same deletes and verification, reports what it would remove and rolls back.
            Use it right after seeding to prove the revert works on the real data.

Usage, from backend/:
  python scripts/seed_demo_teardown.py --email-prefix sprint- --tenant "Inmobiliaria Sprint Review (demo)" --check
  python scripts/seed_demo_teardown.py --email-prefix sprint- --tenant "Inmobiliaria Sprint Review (demo)"
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parents[1]


CHECK_MARKER = "TEARDOWN CHECK OK"

COMMIT = """select table_name, column_name, before as removed from demo_refs where before > 0 order by 1, 2;
commit;
"""
# An exception is the one way to end a multi-statement batch that `supabase db query` reliably
# reports and rolls back; the runner recognizes the marker as success.
CHECK = f"""do $$
declare report text;
begin
  select string_agg(format('%s.%s=%s', table_name, column_name, before), ', ' order by table_name, column_name)
    into report from demo_refs where before > 0;
  raise exception '{CHECK_MARKER} (rolled back, nothing removed). Would remove: %', coalesce(report, 'nothing');
end;
$$;
"""


def render(email_prefix: str, tenant: str, check: bool) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*-", email_prefix):
        sys.exit(f"unexpected email prefix {email_prefix!r}: lowercase letters, digits and dashes, ending in '-'")
    template = (SCRIPTS / "seed_hu15_demo_teardown.sql").read_text(encoding="utf-8")
    return (template.replace("__EMAIL_PREFIX__", email_prefix)
                    .replace("__TENANT__", tenant.replace("'", "''"))
                    .replace("__FINISH__", CHECK if check else COMMIT))


def run(sql_path: Path, target: str, workdir: str | None) -> subprocess.CompletedProcess:
    if target == "local":
        names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True).stdout.split()
        container = next((name for name in names if name.startswith("supabase_db_")), None)
        if not container:
            sys.exit("no running local Supabase database container (supabase_db_*); run `supabase start` first.")
        with sql_path.open("rb") as handle:
            return subprocess.run(["docker", "exec", "-i", container, "psql", "-q", "-v", "ON_ERROR_STOP=1",
                                   "-U", "postgres", "-d", "postgres"], stdin=handle, capture_output=True)
    cli = shutil.which("supabase")  # on Windows an npm shim (supabase.cmd), not runnable by bare name
    if not cli:
        sys.exit("the Supabase CLI is not on PATH.")
    command = [cli, "db", "query", "--linked", "-f", str(sql_path)]
    if workdir:
        command += ["--workdir", workdir]
    return subprocess.run(command, cwd=str(REPO), capture_output=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--email-prefix", required=True, help="prefix the seed used, e.g. sprint-")
    parser.add_argument("--tenant", required=True, help="name of the demo inmobiliaria the seed created")
    parser.add_argument("--check", action="store_true", help="report what would be removed and roll back")
    parser.add_argument("--target", choices=["linked", "local"], default="linked")
    parser.add_argument("--workdir", help="passed to `supabase db query --workdir`")
    parser.add_argument("--out", default=str(REPO / ".seed_hu15_demo"), help="directory for the rendered SQL")
    args = parser.parse_args()

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    sql_path = outdir / ("teardown_check.sql" if args.check else "teardown.sql")
    sql_path.write_text(render(args.email_prefix, args.tenant, args.check), encoding="utf-8")

    result = run(sql_path, args.target, args.workdir)
    output = (result.stdout + result.stderr).decode("utf-8", "replace")
    if args.check:
        match = re.search(CHECK_MARKER + r"[^\n\"]*", output)
        if not match:
            print(output)
            sys.exit("teardown check FAILED: the teardown would not run cleanly (see above). Nothing was removed.")
        print(match.group(0))
        return
    if result.returncode != 0:
        print(output)
        sys.exit("teardown FAILED and was rolled back; nothing was removed.")
    print(output.strip())
    print(f"teardown done: {args.email_prefix}*@example.com and '{args.tenant}' removed.")


if __name__ == "__main__":
    main()
