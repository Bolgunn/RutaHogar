"""HU 28 — team endpoints: tenant isolation, error codes and the ban ordering."""

import asyncio

import httpx
import pytest

from app.main import app
from app.tracking.contracts import TrackingError
from app.tracking.repository import TrackingRepository
from app.tracking.routes import repository
from app.tracking.team import TeamService, event_sentence, member_status, team_view

TENANT = "aaaaaaaa-0000-4000-8000-000000000001"
OTHER_TENANT = "aaaaaaaa-0000-4000-8000-000000000002"
ADMIN = "bbbbbbbb-0000-4000-8000-000000000001"
EXEC = "bbbbbbbb-0000-4000-8000-000000000002"
FOREIGN_EXEC = "bbbbbbbb-0000-4000-8000-000000000003"
PROJECT = {"id": "cccccccc-0000-4000-8000-000000000001", "nombre": "Altos"}
UNCOVERED = {"id": "cccccccc-0000-4000-8000-000000000002", "nombre": "Portal Sur"}

ACTORS = {
    "admin-a": {"id": ADMIN, "role": "admin_inmobiliario", "inmobiliaria_id": TENANT},
    "admin-scoped": {"id": "scoped", "role": "admin", "inmobiliaria_id": TENANT},
    "admin-b": {"id": "other", "role": "admin_inmobiliario", "inmobiliaria_id": OTHER_TENANT},
    "exec-a": {"id": EXEC, "role": "ejecutivo", "inmobiliaria_id": TENANT},
    "global": {"id": "global", "role": "admin", "inmobiliaria_id": None},
    "lead": {"id": "lead", "role": "usuario", "inmobiliaria_id": None},
    "broken-admin": {"id": "broken", "role": "admin_inmobiliario", "inmobiliaria_id": None},
}


def member(member_id, rol="ejecutivo", estado="activo", ingreso="2026-11-01T10:00:00+00:00", proyectos=()):
    return {
        "id": member_id, "nombre": member_id, "email": f"{member_id}@example.invalid", "telefono": None,
        "rol": rol, "estado_acceso": estado, "ultimo_ingreso": ingreso,
        "invitado_en": "2026-10-30T10:00:00+00:00", "correo_fallido": False, "proyectos": list(proyectos),
    }


class FakeRepository:
    def __init__(self):
        self.calls = []
        self.ban_error = None
        self.members = {
            TENANT: {
                ADMIN: member(ADMIN, "admin_inmobiliario"),
                EXEC: member(EXEC, proyectos=[PROJECT]),
            },
            OTHER_TENANT: {FOREIGN_EXEC: member(FOREIGN_EXEC)},
        }

    def staff_actor(self, token):
        actor = ACTORS.get(token)
        if not actor:
            raise TrackingError("unauthenticated")
        return actor

    def team(self, tenant):
        self.calls.append(("team", tenant))
        return {"miembros": list(self.members[tenant].values()), "proyectos": [PROJECT, UNCOVERED]}

    def team_has_member(self, tenant, member_id):
        return member_id in self.members[tenant]

    def _write(self, name, tenant, member_id, *rest):
        self.calls.append((name, tenant, member_id, *rest))
        if member_id not in self.members[tenant]:
            raise TrackingError("not_found")
        return {"cambio": True}

    def team_update_member(self, tenant, member_id, nombre, telefono, actor):
        return self._write("update", tenant, member_id, nombre, telefono, actor["id"])

    def team_set_role(self, tenant, member_id, rol, actor):
        return self._write("role", tenant, member_id, rol, actor["id"])

    def team_set_access(self, tenant, member_id, estado, actor):
        return self._write("access", tenant, member_id, estado, actor["id"])

    def set_auth_ban(self, member_id, banned):
        self.calls.append(("ban", member_id, banned))
        if self.ban_error:
            raise TrackingError(self.ban_error)

    def team_events(self, tenant, member_id, offset, limit):
        self.calls.append(("events", tenant, member_id, offset, limit))
        rows = [
            {"id": str(index), "occurred_at": "2026-11-01T10:00:00+00:00", "actor_id": ADMIN,
             "subject_user_id": EXEC, "event_type": "equipo.proyecto_asignado", "details": {"proyecto": "Altos", "origen": "proyectos"}}
            for index in range(3)
        ]
        return rows[offset:offset + limit]

    def staff_contacts(self, ids):
        return {ADMIN: {"full_name": "Ana Admin"}, EXEC: {"full_name": "Eva Exec"}}


def call(fake, method, path, token="admin-a", **kwargs):
    app.dependency_overrides[repository] = lambda: fake

    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            return await client.request(method, f"/tracking{path}", headers=headers, **kwargs)

    try:
        return asyncio.run(run())
    finally:
        app.dependency_overrides.pop(repository, None)


WRITES = [
    ("PATCH", f"/staff/team/{EXEC}", {"nombre": "Eva"}),
    ("POST", f"/staff/team/{EXEC}/role", {"rol": "admin_inmobiliario"}),
    ("POST", f"/staff/team/{EXEC}/access", {"estado": "desactivado"}),
    ("POST", f"/staff/team/{EXEC}/access", {"estado": "activo"}),
]
READS = [("GET", "/staff/team", None), ("GET", "/staff/team/history", None)]


@pytest.mark.parametrize("method,path,body", READS + WRITES)
@pytest.mark.parametrize("token", ["exec-a", "lead", "broken-admin"])
def test_only_a_team_admin_reaches_any_endpoint(method, path, body, token):
    fake = FakeRepository()
    response = call(fake, method, path, token=token, json=body)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "owner_mismatch"
    assert not [item for item in fake.calls if item[0] != "staff_actor"]


@pytest.mark.parametrize("method,path,body", READS + WRITES)
def test_anonymous_is_refused(method, path, body):
    assert call(FakeRepository(), method, path, token=None, json=body).status_code == 401


@pytest.mark.parametrize("method,path,body", READS + WRITES)
def test_tenant_admin_cannot_name_another_inmobiliaria(method, path, body):
    fake = FakeRepository()
    response = call(fake, method, f"{path}?inmobiliaria_id={OTHER_TENANT}", json=body)
    assert response.status_code == 403
    assert fake.calls == []


@pytest.mark.parametrize("method,path,body", WRITES)
def test_a_member_of_another_tenant_does_not_exist(method, path, body):
    fake = FakeRepository()
    response = call(fake, method, path, token="admin-b", json=body)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"
    assert not [item for item in fake.calls if item[0] == "ban"], "Auth must never be touched"


@pytest.mark.parametrize("method,path,body", READS + WRITES)
def test_global_admin_must_choose_an_inmobiliaria(method, path, body):
    fake = FakeRepository()
    response = call(fake, method, path, token="global", json=body)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "inmobiliaria_required"
    assert fake.calls == []


def test_global_admin_acts_on_the_chosen_inmobiliaria():
    fake = FakeRepository()
    response = call(fake, "POST", f"/staff/team/{EXEC}/role?inmobiliaria_id={TENANT}", token="global",
                    json={"rol": "admin_inmobiliario"})
    assert response.status_code == 200
    assert fake.calls == [("role", TENANT, EXEC, "admin_inmobiliario", "global")]


def test_tenant_comes_from_the_actor_not_the_request():
    fake = FakeRepository()
    response = call(fake, "GET", f"/staff/team?inmobiliaria_id={TENANT}", token="admin-scoped")
    assert response.status_code == 200
    assert fake.calls == [("team", TENANT)]


def test_team_marks_caller_locks_and_uncovered_projects():
    body = call(FakeRepository(), "GET", "/staff/team").json()
    by_id = {item["id"]: item for item in body["miembros"]}
    assert by_id[ADMIN]["es_propio"] is True
    assert by_id[ADMIN]["bloqueo"] == "propio"
    assert by_id[EXEC]["bloqueo"] is None
    assert body["proyectos_sin_ejecutivo"] == [UNCOVERED]


def test_last_active_admin_is_locked_for_a_global_admin_too():
    members = [member("a", "admin"), member("b", "admin_inmobiliario", estado="desactivado"), member("c")]
    view = team_view({"miembros": members, "proyectos": []}, {"id": "global"})
    assert [item["bloqueo"] for item in view["miembros"]] == ["ultimo_administrador", None, None]


def test_deactivated_people_do_not_cover_a_project():
    view = team_view({"miembros": [member("a", estado="desactivado", proyectos=[PROJECT])], "proyectos": [PROJECT]}, {"id": "x"})
    assert view["proyectos_sin_ejecutivo"] == [PROJECT]


def test_status_is_derived_from_sign_in():
    assert member_status(member("a", ingreso=None)) == "invitado"
    assert member_status(member("a")) == "activo"
    assert member_status(member("a", estado="desactivado", ingreso=None)) == "desactivado"
    assert member_status({**member("a", ingreso=None), "estado_acceso": "activo"}) == "invitado"


def test_deactivation_commits_before_the_ban():
    fake = FakeRepository()
    assert call(fake, "POST", f"/staff/team/{EXEC}/access", json={"estado": "desactivado"}).status_code == 200
    assert [item[0] for item in fake.calls] == ["access", "ban"]
    assert fake.calls[1] == ("ban", EXEC, True)


def test_reactivation_lifts_the_ban_before_committing():
    fake = FakeRepository()
    assert call(fake, "POST", f"/staff/team/{EXEC}/access", json={"estado": "activo"}).status_code == 200
    assert [item[0] for item in fake.calls] == ["ban", "access"]
    assert fake.calls[0] == ("ban", EXEC, False)


@pytest.mark.parametrize("estado", ["desactivado", "activo"])
def test_failed_ban_is_retryable(estado):
    fake = FakeRepository()
    fake.ban_error = "auth_sync_failed"
    response = call(fake, "POST", f"/staff/team/{EXEC}/access", json={"estado": estado})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_sync_failed"

    fake.ban_error = None
    assert call(fake, "POST", f"/staff/team/{EXEC}/access", json={"estado": estado}).status_code == 200


def test_reactivating_yourself_never_reaches_auth():
    fake = FakeRepository()
    response = call(fake, "POST", f"/staff/team/{ADMIN}/access", json={"estado": "activo"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "self_change_forbidden"
    assert fake.calls == []


@pytest.mark.parametrize("code,status", [
    ("self_change_forbidden", 409), ("last_active_admin", 409), ("member_deactivated", 409),
])
def test_refusals_reach_the_client(code, status):
    fake = FakeRepository()

    def refuse(*_args):
        raise TrackingError(code)

    fake.team_set_role = refuse
    response = call(fake, "POST", f"/staff/team/{EXEC}/role", json={"rol": "ejecutivo"})
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


@pytest.mark.parametrize("path,body", [
    (f"/staff/team/{EXEC}/role", {"rol": "admin"}),
    (f"/staff/team/{EXEC}/role", {"rol": "usuario"}),
    (f"/staff/team/{EXEC}/access", {"estado": "pausado"}),
    (f"/staff/team/{EXEC}/role", {"rol": "ejecutivo", "inmobiliaria_id": OTHER_TENANT}),
])
def test_role_admin_and_unknown_fields_are_refused(path, body):
    fake = FakeRepository()
    assert call(fake, "POST", path, json=body).status_code == 422
    assert fake.calls == []


def test_update_requires_a_name_and_only_touches_organizational_data():
    fake = FakeRepository()
    assert call(fake, "PATCH", f"/staff/team/{EXEC}", json={"nombre": "  "}).status_code == 422
    assert call(fake, "PATCH", f"/staff/team/{EXEC}", json={"nombre": "Eva", "email": "x@y.cl"}).status_code == 422
    assert fake.calls == []
    assert call(fake, "PATCH", f"/staff/team/{EXEC}", json={"nombre": " Eva ", "telefono": ""}).status_code == 200
    assert fake.calls == [("update", TENANT, EXEC, "Eva", None, ADMIN)]


def test_history_is_paginated_and_named():
    fake = FakeRepository()
    body = call(fake, "GET", f"/staff/team/history?limit=2&miembro_id={EXEC}").json()
    assert fake.calls == [("events", TENANT, EXEC, 0, 3)]
    assert body["next_cursor"] == 2
    entry = body["items"][0]
    assert entry["actor_nombre"] == "Ana Admin"
    assert entry["origen"] == "Desde Proyectos"
    assert [part["texto"] for part in entry["segmentos"]] == ["asignó ", "Altos", " a ", "Eva Exec"]

    last = call(fake, "GET", "/staff/team/history?limit=2&cursor=2").json()
    assert len(last["items"]) == 1
    assert last["next_cursor"] is None


@pytest.mark.parametrize("event,expected", [
    ({"event_type": "equipo.invitacion_enviada"}, "invitó a Eva como Ejecutivo"),
    ({"event_type": "equipo.invitacion_reenviada"}, "reenvió la invitación de Eva"),
    ({"event_type": "equipo.invitacion_fallida"}, "invitó a Eva como Ejecutivo, pero el correo no se pudo enviar"),
    ({"event_type": "equipo.invitacion_fallida", "details": {"reenvio": True}}, "reenvió la invitación de Eva, pero el correo no se pudo enviar"),
    ({"event_type": "equipo.miembro_vinculado"}, "vinculó a Eva al equipo como Ejecutivo"),
    ({"event_type": "equipo.rol_cambiado", "before": {"rol": "ejecutivo"}, "after": {"rol": "admin_inmobiliario"}},
     "cambió la función de Eva de Ejecutivo a Administrador inmobiliario"),
    ({"event_type": "equipo.datos_actualizados"}, "actualizó los datos de Eva"),
    ({"event_type": "equipo.acceso_desactivado", "details": {"proyectos": [{"nombre": "Altos"}, {"nombre": "Sur"}]}},
     "desactivó a Eva y retiró sus proyectos: Altos, Sur"),
    ({"event_type": "equipo.acceso_desactivado"}, "desactivó a Eva"),
    ({"event_type": "equipo.acceso_reactivado"}, "reactivó a Eva"),
    ({"event_type": "equipo.proyecto_retirado", "details": {"proyecto": "Altos"}}, "retiró Altos de Eva"),
])
def test_history_sentences(event, expected):
    assert "".join(part["texto"] for part in event_sentence(event, "Eva")) == expected


def test_a_deactivated_account_is_not_an_actor(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://stack.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    repo = TrackingRepository()
    monkeypatch.setattr(repo, "authenticate", lambda _token: EXEC)
    monkeypatch.setattr(repo, "request", lambda *_a, **_k: [
        {"id": EXEC, "role": "ejecutivo", "inmobiliaria_id": TENANT, "estado_acceso": "desactivado"},
    ])
    with pytest.raises(TrackingError) as error:
        repo.staff_actor("token")
    assert error.value.code == "owner_mismatch"


def test_a_failed_ban_call_becomes_a_retryable_code(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://stack.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    repo = TrackingRepository()

    def fail(*_args, **_kwargs):
        raise TrackingError("persistence_unavailable")

    monkeypatch.setattr(repo, "request", fail)
    with pytest.raises(TrackingError) as error:
        repo.set_auth_ban(EXEC, True)
    assert error.value.code == "auth_sync_failed"


def test_team_service_never_trusts_a_foreign_tenant_for_a_global_lookup():
    fake = FakeRepository()
    TeamService(fake).team("global", TENANT)
    assert fake.calls == [("team", TENANT)]
