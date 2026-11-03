import json
from pathlib import Path


def test_frontend_deployment_routes_tracking_to_the_fastapi_function():
    config = json.loads((Path(__file__).parents[2] / "vercel.json").read_text(encoding='utf-8'))
    rewrites = {(row["source"], row["destination"]) for row in config["rewrites"]}

    assert ("/tracking", "/api/score") in rewrites
    assert ("/tracking/(.*)", "/api/score") in rewrites


def test_every_backend_route_is_rewritten_before_the_spa_fallback():
    # Sin rewrite, Vercel devuelve index.html con 200 y el frontend recibe HTML.
    import re

    from app.main import app

    config = json.loads((Path(__file__).parents[2] / "vercel.json").read_text(encoding='utf-8'))
    backend_sources = [
        re.compile("^" + row["source"].replace("(.*)", ".*") + "$")
        for row in config["rewrites"]
        if row["destination"] == "/api/score"
    ]
    paths = set(app.openapi()["paths"])
    assert {"/score", "/market-reference", "/tracking"} <= paths

    unrouted = sorted(
        path for path in paths
        if not any(source.match(re.sub(r"\{[^}]+\}", "x", path)) for source in backend_sources)
    )
    assert unrouted == []
