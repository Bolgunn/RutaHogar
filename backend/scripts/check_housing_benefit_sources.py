"""Detect source-page changes; deliberately does not extract monetary amounts."""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import urlopen

catalogue = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
changed = []
for source in catalogue["official_source_metadata"]["sources"]:
    with urlopen(source["url"], timeout=20) as response:
        digest = hashlib.sha256(response.read()).hexdigest()
    if source.get("content_sha256") and source["content_sha256"] != digest: changed.append({"url": source["url"], "observed_sha256": digest})
if changed:
    print(json.dumps(changed)); raise SystemExit(2)
