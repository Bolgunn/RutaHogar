"""Local-only HU23 accounts. Never accepts a URL, key or --linked argument."""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5

import httpx

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from scripts.seed_hu15_demo import Supabase  # noqa: E402
from app.market_data.service import load_fixture_snapshot  # noqa: E402
from app.tracking.repository import TrackingRepository  # noqa: E402
from app.tracking.service import TrackingService  # noqa: E402

BUYER = {"email": "hu23-identidad@example.com", "password": "Hu23-Identidad-2026!"}
SALES = {"email": "hu23-ejecutivo@example.com", "password": "Hu23-Ejecutivo-2026!"}
IDENTITY = {"nombre": "Camila Fernanda", "apellido_paterno": "Prueba",
            "apellido_materno": "Usuario", "full_name": "Camila Fernanda Prueba Usuario", "rut": "1.111.111-4"}
TENANT_ID = str(uuid5(NAMESPACE_URL, "rutahogar.local/hu23-identity-fixtures/inmobiliaria"))
TENANT_NAME = "Inmobiliaria local HU23 identidad"
BUYER_PROFILE = {**IDENTITY, "role": "usuario", "inmobiliaria_id": None}
SALES_PROFILE = {"full_name": "Ejecutivo local HU23", "role": "ejecutivo", "inmobiliaria_id": TENANT_ID}
BASELINE = {"ingreso_mensual": 1450000, "deuda_mensual": 0, "edad": 30,
            "ahorro_disponible": 20000000, "plazo_credito_hipotecario": 30,
            "tipo_contrato": "indefinido", "continuidad_laboral": "mas_3_anios",
            "morosidad_actual": "no", "consentimiento": True,
            "property_value_clp": 80000000, "dividendo_estimado": 300000}


def local_url(value):
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1"}
                or parsed.username or parsed.password or parsed.path not in {"", "/"}
                or parsed.query or parsed.fragment or not parsed.port):
            raise ValueError()
    except (ValueError, TypeError):
        raise RuntimeError("LOCAL-ONLY: URL Supabase no verificable como HTTP loopback con puerto explícito.") from None
    return parsed.port


def local_cli_environment(environ=None):
    env = os.environ if environ is None else environ
    # Keep only process essentials. Remote Supabase/Vercel settings and Docker
    # context overrides must not influence discovery of the local stack.
    process_keys = {"PATH", "PATHEXT", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
                    "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "USER", "LOGNAME",
                    "SHELL", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR"}
    return {name: value for name, value in env.items() if name.upper() in process_keys}


def supabase_executable():
    return shutil.which("supabase") or str(ROOT / "node_modules/.bin" / ("supabase.cmd" if os.name == "nt" else "supabase"))


def local_status(root=ROOT, environ=None, run=subprocess.run):
    try:
        result = run([supabase_executable(), "status", "--output", "json"], cwd=root,
                     check=True, capture_output=True, text=True, env=local_cli_environment(environ))
        status = json.loads(result.stdout)
        url, key = status["API_URL"], status["SERVICE_ROLE_KEY"]
        local_url(url)
        if not isinstance(key, str) or not key.strip() or key != key.strip():
            raise ValueError()
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError):
        raise RuntimeError("LOCAL-ONLY: no se pudo verificar el stack local. Ejecuta supabase start (sin --linked).") from None
    return status


def local_settings(root=ROOT, environ=None, run=subprocess.run):
    status = local_status(root, environ, run)
    return status["API_URL"].rstrip("/"), status["SERVICE_ROLE_KEY"]


def ensure_account(api, account, profile):
    # Reuse the demo seed's Auth Admin creation and email lookup RPC.
    user_id = api.ensure_user(account["email"], account["password"])
    api.request("PUT", f"/auth/v1/admin/users/{user_id}", json={
        "password": account["password"], "email_confirm": True,
        "user_metadata": {k: v for k, v in profile.items() if k != "inmobiliaria_id"}})
    # PATCH keeps unrelated profile fields; Auth's trigger may already have inserted the profile.
    rows = api.request("GET", "/rest/v1/profiles", params={"id": f"eq.{user_id}", "select": "id"})
    if rows:
        api.request("PATCH", "/rest/v1/profiles", params={"id": f"eq.{user_id}"}, json=profile)
    else:
        api.request("POST", "/rest/v1/profiles", json={"id": user_id, **profile})
    return user_id


def ensure_fixtures(api, repository, service):
    tenants = api.request("GET", "/rest/v1/inmobiliarias", params={"id": f"eq.{TENANT_ID}", "select": "id,nombre"})
    if tenants and tenants[0]["nombre"] != TENANT_NAME:
        raise RuntimeError("Colisión con inmobiliaria ajena al fixture; no se modificó.")
    if not tenants:
        api.request("POST", "/rest/v1/inmobiliarias", json={"id": TENANT_ID, "nombre": TENANT_NAME})
    buyer_id = ensure_account(api, BUYER, BUYER_PROFILE)
    ensure_account(api, SALES, SALES_PROFILE)
    bundle = repository.load(buyer_id)
    if not bundle.get("plan"):
        service.execute(buyer_id, {"event_id": str(uuid5(NAMESPACE_URL, f"hu23-identity-baseline/{buyer_id}")),
                        "event_kind": "evaluation", "effective_at": datetime.now(timezone.utc).isoformat(),
                        "reason": "Fixture local HU23 identidad", "previous_event_id": None, "patch": BASELINE})


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("LOCAL-ONLY: este comando no acepta argumentos ni destinos alternativos.")
    url, key = local_settings()
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Imported application modules may have loaded dotenv; credentials always come from local status.
    os.environ.update(SUPABASE_URL=url, SUPABASE_SERVICE_ROLE_KEY=key, SUPABASE_SECRET_KEY=key)
    with httpx.Client(trust_env=False, follow_redirects=False, timeout=30) as client:
        api = Supabase(url=url, key=key, client=client)
        # A base URL is needed by the existing relative-path repository port.
        with httpx.Client(base_url=url, trust_env=False, follow_redirects=False, timeout=30) as tracking_client:
            repository = TrackingRepository(client=tracking_client)
            service = TrackingService(repository, market_snapshot_resolver=load_fixture_snapshot)
            ensure_fixtures(api, repository, service)
    for label, account in (("Comprador", BUYER), ("Ejecutivo", SALES)):
        print(f"{label}: {account['email']}\nPassword local de prueba: {account['password']}")
    print("Aplicación local (Vite por defecto): http://localhost:5173")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # API errors can include secrets; only the deliberately public guard messages are printed.
        message = str(exc) if str(exc).startswith("LOCAL-ONLY:") else "Falló el fixture local; revisa stack y esquema local (sin datos ni claves en el error)."
        sys.exit(message)
