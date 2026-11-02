"""HU 28 — an inmobiliaria's team: members, role, access and history.

The tenant comes from the authenticated actor; only a global admin names one explicitly (S6).
Writes run in service-only RPCs, so each change commits with its audit entry.
"""

from .commercial_config import CONFIG_ADMIN_ROLES
from .contracts import TrackingError

ROLE_LABELS = {
    "ejecutivo": "Ejecutivo",
    "admin_inmobiliario": "Administrador inmobiliario",
    "admin": "Administrador inmobiliario",
}


def member_status(member):
    if member.get("estado_acceso") == "desactivado":
        return "desactivado"
    # Not stored: someone reactivated before ever signing in is still only invited.
    return "activo" if member.get("ultimo_ingreso") else "invitado"


def access_out_of_sync(member):
    """The status committed but the Auth ban did not follow; None until the list reports the ban."""
    if member.get("baneado") is None:
        return False
    return (member.get("estado_acceso") == "desactivado") != member["baneado"]


def locked_reason(member, actor, active_admins):
    if member["id"] == actor["id"]:
        return "propio"
    is_active_admin = member.get("rol") in CONFIG_ADMIN_ROLES and member.get("estado_acceso") == "activo"
    return "ultimo_administrador" if is_active_admin and active_admins == 1 else None


def team_view(team, actor):
    members = team.get("miembros") or []
    active_admins = sum(
        1 for member in members
        if member.get("rol") in CONFIG_ADMIN_ROLES and member.get("estado_acceso") == "activo"
    )
    covered = {
        project["id"]
        for member in members if member.get("estado_acceso") == "activo"
        for project in member.get("proyectos") or []
    }
    projects = team.get("proyectos") or []
    return {
        "miembros": [
            {
                **member,
                "estado": member_status(member),
                "es_propio": member["id"] == actor["id"],
                "bloqueo": locked_reason(member, actor, active_admins),
                "acceso_pendiente": access_out_of_sync(member),
            }
            for member in members
        ],
        "proyectos": projects,
        "proyectos_sin_ejecutivo": [project for project in projects if project["id"] not in covered],
    }


def _segment(text, strong=False):
    return {"texto": text, "destacado": strong}


def _project_names(event):
    return ", ".join(project.get("nombre", "") for project in (event.get("details") or {}).get("proyectos") or [])


def event_sentence(event, member_name):
    """The history line, as segments: the frontend renders them, never HTML from the server."""
    kind = event.get("event_type", "").removeprefix("equipo.")
    details = event.get("details") or {}
    name = _segment(member_name, True)
    project = _segment(details.get("proyecto") or "", True)
    if kind == "proyecto_asignado":
        return [_segment("asignó "), project, _segment(" a "), name]
    if kind == "proyecto_retirado":
        return [_segment("retiró "), project, _segment(" de "), name]
    if kind == "invitacion_enviada":
        return [_segment("invitó a "), name, _segment(" como Ejecutivo")]
    if kind == "invitacion_reenviada":
        return [_segment("reenvió la invitación de "), name]
    if kind == "invitacion_fallida":
        action = "reenvió la invitación de " if details.get("reenvio") else "invitó a "
        suffix = ", pero el correo no se pudo enviar" if details.get("reenvio") else " como Ejecutivo, pero el correo no se pudo enviar"
        return [_segment(action), name, _segment(suffix)]
    if kind == "miembro_vinculado":
        return [_segment("vinculó a "), name, _segment(" al equipo como Ejecutivo")]
    if kind == "rol_cambiado":
        before = ROLE_LABELS.get((event.get("before") or {}).get("rol"), "otra función")
        after = ROLE_LABELS.get((event.get("after") or {}).get("rol"), "otra función")
        return [_segment("cambió la función de "), name, _segment(f" de {before} a {after}")]
    if kind == "datos_actualizados":
        return [_segment("actualizó los datos de "), name]
    if kind == "acceso_desactivado":
        projects = _project_names(event)
        if projects:
            return [_segment("desactivó a "), name, _segment(" y retiró sus proyectos: "), _segment(projects, True)]
        return [_segment("desactivó a "), name]
    if kind == "acceso_reactivado":
        return [_segment("reactivó a "), name]
    return [_segment(kind)]


class TeamService:
    def __init__(self, repository):
        self.repository = repository

    def _scope(self, token, inmobiliaria_id):
        actor = self.repository.staff_actor(token)
        if actor.get("role") not in CONFIG_ADMIN_ROLES:
            raise TrackingError("owner_mismatch")
        own_tenant = actor.get("inmobiliaria_id")
        if own_tenant:
            if inmobiliaria_id and str(inmobiliaria_id) != str(own_tenant):
                raise TrackingError("owner_mismatch")
            return actor, own_tenant
        if actor.get("role") != "admin":
            raise TrackingError("owner_mismatch")
        if not inmobiliaria_id:
            raise TrackingError("inmobiliaria_required")
        return actor, str(inmobiliaria_id)

    def team(self, token, inmobiliaria_id=None):
        actor, tenant = self._scope(token, inmobiliaria_id)
        return team_view(self.repository.team(tenant), actor)

    def update_member(self, token, member_id, nombre, telefono, inmobiliaria_id=None):
        actor, tenant = self._scope(token, inmobiliaria_id)
        return self.repository.team_update_member(tenant, member_id, nombre, telefono or None, actor)

    def set_role(self, token, member_id, rol, inmobiliaria_id=None):
        actor, tenant = self._scope(token, inmobiliaria_id)
        return self.repository.team_set_role(tenant, member_id, rol, actor)

    def set_access(self, token, member_id, estado, inmobiliaria_id=None):
        actor, tenant = self._scope(token, inmobiliaria_id)
        if estado == "desactivado":
            # Access is already cut when the ban runs, so a failed ban is retried, not undone.
            result = self.repository.team_set_access(tenant, member_id, estado, actor)
            self.repository.set_auth_ban(member_id, True)
            return result
        if member_id == actor["id"]:
            raise TrackingError("self_change_forbidden")
        # Auth has no tenant: the ban is only lifted for someone on this team.
        if not self.repository.team_has_member(tenant, member_id):
            raise TrackingError("not_found")
        self.repository.set_auth_ban(member_id, False)
        return self.repository.team_set_access(tenant, member_id, estado, actor)

    def history(self, token, miembro_id=None, cursor=0, limit=50, inmobiliaria_id=None):
        _, tenant = self._scope(token, inmobiliaria_id)
        rows = self.repository.team_events(tenant, miembro_id, cursor, limit + 1)
        page = rows[:limit]
        contacts = self.repository.staff_contacts([row.get("actor_id") for row in page])
        actors = {profile_id: contact.get("full_name") for profile_id, contact in contacts.items()}
        # An assignment may name any email: only this team's people are shown by name.
        team = self.repository.team_member_names(tenant)
        items = []
        for row in page:
            details = row.get("details") or {}
            subject = row.get("subject_user_id") if row.get("subject_user_id") in team else None
            items.append({
                "id": row.get("id"),
                "event_type": row.get("event_type"),
                "ocurrido_en": row.get("occurred_at"),
                "miembro_id": subject,
                "actor_nombre": actors.get(row.get("actor_id")) or "RutaHogar",
                "segmentos": event_sentence(row, team.get(subject) or details.get("email") or "una persona"),
                "origen": "Desde Proyectos" if details.get("origen") == "proyectos" else None,
                "rol_nuevo": (row.get("after") or {}).get("rol"),
            })
        return {"items": items, "next_cursor": cursor + limit if len(rows) > limit else None}
