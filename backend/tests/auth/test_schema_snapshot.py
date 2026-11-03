"""The bootstrap hook must match the executable migration, including dollar quoting."""
import re
from pathlib import Path


def test_access_hook_snapshot_matches_latest_migration():
    root = Path(__file__).resolve().parents[3]
    pattern = r"create or replace function public\.hu27_access_token_hook\(event jsonb\).*?as \$\$(.*?)\$\$;"
    snapshot = (root / "supabase/schema.sql").read_text(encoding="utf-8")
    migration = (root / "supabase/migrations/20261103191025_hu27_shared_access_guard.sql").read_text(encoding="utf-8")
    actual = re.search(pattern, snapshot, re.S)
    expected = re.search(pattern, migration, re.S)
    assert actual is not None, "Snapshot hook is missing or has broken dollar quoting"
    assert expected is not None
    assert actual.group(0).split() == expected.group(0).split()


def test_snapshot_reuses_the_shared_guard_without_changing_its_contract():
    root = Path(__file__).resolve().parents[3]
    fixture = (Path(__file__).parent / "shared_guard_fixture.sql").read_text(encoding="utf-8")
    shared = fixture[fixture.index("CREATE OR REPLACE FUNCTION"):].strip()
    snapshot = (root / "supabase/schema.sql").read_text(encoding="utf-8")
    assert shared in snapshot
    assert "create trigger hu27_own_access_guard" not in snapshot
