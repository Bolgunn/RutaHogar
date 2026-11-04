"""The bootstrap hook must match the executable migration, including dollar quoting."""
import re
from pathlib import Path


def test_access_hook_snapshot_matches_latest_migration():
    root = Path(__file__).resolve().parents[3]
    pattern = r"create or replace function public\.hu27_access_token_hook\(event jsonb\).*?as \$\$(.*?)\$\$;"
    snapshot = (root / "supabase/schema.sql").read_text(encoding="utf-8")
    migration = (root / "supabase/migrations/20261103043642_hu27_auth_hook_controlled_errors.sql").read_text(encoding="utf-8")
    actual = re.search(pattern, snapshot, re.S)
    expected = re.search(pattern, migration, re.S)
    assert actual is not None, "Snapshot hook is missing or has broken dollar quoting"
    assert expected is not None
    assert actual.group(0).split() == expected.group(0).split()
