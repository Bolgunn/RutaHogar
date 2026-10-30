"""HU 21 — an inmobiliaria admin's commercial criteria (ALG-19): read, preview, save.

Tenant and author always come from the authenticated actor, never from the body (S6).
Nothing here touches an evaluation: the configured priority is computed at read time.
"""

from uuid import UUID

from ..scoring_engine.commercial_criteria import diff_criterios, normalize_criterios, validate_criterios
from ..scoring_engine.commercial_priority import configured_priority_for_evaluation
from ..scoring_engine.constants import (
    COMMERCIAL_ACTIONS,
    COMMERCIAL_CRITERIA_OPTIONS,
    COMMERCIAL_PRIORITY_ALG_VERSION,
    MAX_PRIORITY_PROJECTS,
)
from .contracts import TrackingError

CONFIG_ADMIN_ROLES = {"admin", "admin_inmobiliario"}


class InvalidCriteria(TrackingError):
    def __init__(self, errors):
        super().__init__("invalid_criterios")
        self.errors = errors


def criterios_of(config):
    """(normalized criterios, version) of a stored row; no row means defaults and version None."""
    if not config:
        return normalize_criterios(None), None
    return normalize_criterios(config.get("criterios"), config.get("alg_version")), config.get("version")


def tray_config(criterios, version):
    # Executives get only what R9 needs, never the rest of the criteria.
    return {
        "version": version,
        "proyectos_prioritarios": criterios["proyectos_prioritarios"],
        "orden_desempate": criterios["orden_desempate"],
    }


def latest_per_lead(rows):
    latest = {}
    for row in rows:
        lead = row.get("user_id")
        if lead and (lead not in latest or str(row.get("created_at") or "") > str(latest[lead].get("created_at") or "")):
            latest[lead] = row
    return list(latest.values())


def _uuid_ids(ids):
    valid = []
    for value in ids:
        try:
            UUID(str(value))
        except ValueError:
            continue
        valid.append(str(value))
    return valid


class CommercialConfigService:
    def __init__(self, repository):
        self.repository = repository

    def _admin(self, token):
        actor = self.repository.staff_actor(token)
        if actor.get("role") not in CONFIG_ADMIN_ROLES or not actor.get("inmobiliaria_id"):
            # Executives and the global admin have no configuration to manage.
            raise TrackingError("owner_mismatch")
        return actor

    def _validated(self, actor, raw):
        project_ids = (raw or {}).get("proyectos_prioritarios") if isinstance(raw, dict) else None
        ids = _uuid_ids(project_ids) if isinstance(project_ids, list) else []
        states = self.repository.tenant_project_states(actor["inmobiliaria_id"], ids) if ids else {}
        errors = validate_criterios(raw, states)
        if errors:
            raise InvalidCriteria(errors)
        return normalize_criterios(raw)

    def _names(self, profile_ids):
        contacts = self.repository.staff_contacts(profile_ids)
        return {profile_id: contact.get("full_name") for profile_id, contact in contacts.items()}

    def _vigente(self, row, names):
        criterios, version = criterios_of(row)
        return {
            "version": version,
            "criterios": criterios,
            "created_at": row.get("created_at"),
            "created_by_name": names.get(row.get("created_by")),
        }

    def config(self, token):
        actor = self._admin(token)
        rows = sorted(
            self.repository.commercial_config_history(actor["inmobiliaria_id"]) or [],
            key=lambda row: row.get("version") or 0,
        )
        names = self._names([row.get("created_by") for row in rows])
        historial = []
        previous = normalize_criterios(None)
        for row in rows:
            criterios, version = criterios_of(row)
            historial.append({
                "version": version,
                "created_at": row.get("created_at"),
                "created_by_name": names.get(row.get("created_by")),
                "cambios": diff_criterios(previous, criterios),
            })
            previous = criterios
        return {
            "vigente": self._vigente(rows[-1], names) if rows else None,
            "defaults": normalize_criterios(None),
            "opciones": {
                **COMMERCIAL_CRITERIA_OPTIONS,
                "proyectos_prioritarios": {"max": MAX_PRIORITY_PROJECTS},
                "acciones": COMMERCIAL_ACTIONS,
            },
            "alg_version": COMMERCIAL_PRIORITY_ALG_VERSION,
            "historial": list(reversed(historial)),
        }

    def preview_config(self, token, body):
        actor = self._admin(token)
        borrador = self._validated(actor, body.get("criterios"))
        vigente, version = criterios_of(self.repository.latest_commercial_config(actor["inmobiliaria_id"]))

        # Same universe as the tray: latest evaluation per lead, discarded leads excluded.
        rows = latest_per_lead(self.repository.staff_evaluations(actor) or [])
        statuses = self.repository.lead_reliability_statuses([row["user_id"] for row in rows])
        rows = [row for row in rows if statuses.get(row["user_id"]) != "descartado"]

        conteos = {"vigente": dict.fromkeys(COMMERCIAL_ACTIONS, 0), "borrador": dict.fromkeys(COMMERCIAL_ACTIONS, 0)}
        cambian = 0
        for row in rows:
            antes = configured_priority_for_evaluation(row, vigente, version)["commercial_priority_configured"]["action_key"]
            despues = configured_priority_for_evaluation(row, borrador, None)["commercial_priority_configured"]["action_key"]
            conteos["vigente"][antes] += 1
            conteos["borrador"][despues] += 1
            cambian += antes != despues
        return {
            "cambios": diff_criterios(vigente, borrador),
            "conteos": conteos,
            "leads_que_cambian": cambian,
        }

    def save_config(self, token, body):
        actor = self._admin(token)
        criterios = self._validated(actor, body.get("criterios"))
        latest = self.repository.latest_commercial_config(actor["inmobiliaria_id"])
        base_version = body.get("base_version")
        if base_version != (latest or {}).get("version"):
            raise TrackingError("config_version_conflict")
        row = self.repository.insert_commercial_config({
            "inmobiliaria_id": actor["inmobiliaria_id"],
            "version": (base_version or 0) + 1,
            "criterios": criterios,
            "alg_version": COMMERCIAL_PRIORITY_ALG_VERSION,
            "created_by": actor["id"],
        })
        return self._vigente(row, self._names([actor["id"]]))
