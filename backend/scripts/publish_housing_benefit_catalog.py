"""Validate a human-reviewed HU17 catalogue fixture before manual publication."""
from __future__ import annotations
import hashlib
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.housing_benefit_catalog import HousingBenefitCatalogueRepository

REQUIRED = {"DS1", "DS49"}

def validate(payload):
    if not isinstance(payload.get("official_source_metadata"), dict) or not payload["official_source_metadata"].get("sources"):
        raise ValueError("official source metadata is required")
    if not isinstance(payload.get("source_checksum"), str) or not payload["source_checksum"].strip(): raise ValueError("source checksum is required")
    entries = payload.get("entries")
    identifiers = {entry.get("identifier") for entry in entries or [] if isinstance(entry, dict)}
    if not REQUIRED <= identifiers: raise ValueError("DS1 and DS49 entries are required")
    for entry in entries:
        if entry.get("identifier") in REQUIRED:
            amount = entry.get("value", {}).get("amount_clp")
            if not isinstance(amount, (int, float)) or amount <= 0:
                raise ValueError("primary benefit entries require a reviewed amount matrix")
    return payload

if __name__ == "__main__":
    path = Path(sys.argv[1])
    payload = validate(json.loads(path.read_text(encoding="utf-8")))
    if "--publish" in sys.argv:
        if payload.get("status") != "published":
            raise ValueError("only a reviewed published catalogue can be inserted")
        secret = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
        published = HousingBenefitCatalogueRepository(os.getenv("SUPABASE_URL", ""), secret).insert_version(payload)
        print(json.dumps({"id": published["id"], "version": published["version"]}))
    else:
        print(json.dumps({"version": payload["version"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}))
