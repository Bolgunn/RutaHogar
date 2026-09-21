import json
from pathlib import Path


def test_frontend_deployment_routes_tracking_to_the_fastapi_function():
    config = json.loads((Path(__file__).parents[2] / "vercel.json").read_text())
    rewrites = {(row["source"], row["destination"]) for row in config["rewrites"]}

    assert ("/tracking", "/api/score") in rewrites
    assert ("/tracking/(.*)", "/api/score") in rewrites
