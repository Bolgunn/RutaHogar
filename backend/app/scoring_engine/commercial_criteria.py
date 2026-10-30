# ALG-19 R0: the closed criteria object an inmobiliaria configures. Pure; no I/O.

from copy import deepcopy

from .constants import (
    COMMERCIAL_CRITERIA_OPTIONS,
    COMMERCIAL_PRIORITY_ALG_VERSION,
    DEFAULT_COMMERCIAL_CRITERIOS,
    MAX_PRIORITY_PROJECTS,
)

# A version saved before a key existed is completed with that version's default (R0).
DEFAULTS_BY_ALG_VERSION = {COMMERCIAL_PRIORITY_ALG_VERSION: DEFAULT_COMMERCIAL_CRITERIOS}

SET_KEYS = (
    "contactar_ahora.clasificaciones",
    "contactar_ahora.compatibilidades",
    "contactar_con_revision.clasificaciones",
    "contactar_con_revision.compatibilidades",
    "senales.plazos",
)
CRITERIA_KEYS = (
    *SET_KEYS,
    "senales.propiedad_vista",
    "subir_con_senales",
    "umbral_reorientar",
    "proyectos_prioritarios",
    "orden_desempate",
)
GROUPS = ("contactar_ahora", "contactar_con_revision", "senales")


def _get(criterios, key):
    group, _, leaf = key.partition(".")
    return criterios[group][leaf] if leaf else criterios[key]


def _set(criterios, key, value):
    group, _, leaf = key.partition(".")
    if leaf:
        criterios[group][leaf] = value
    else:
        criterios[key] = value


def _is_str_list(value):
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _as_set(value):
    return sorted(set(value))


def merge_criterios(raw, alg_version=COMMERCIAL_PRIORITY_ALG_VERSION):
    """Overlay raw (possibly partial) over the defaults of its version, one group level deep."""
    merged = deepcopy(DEFAULTS_BY_ALG_VERSION[alg_version])
    for key, value in (raw or {}).items():
        if key in GROUPS and isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **deepcopy(value)}
        else:
            merged[key] = deepcopy(value)
    return merged


def normalize_criterios(raw, alg_version=COMMERCIAL_PRIORITY_ALG_VERSION):
    """Complete with defaults and store sets sorted. Assumes raw already passed validation."""
    criterios = merge_criterios(raw, alg_version)
    for key in (*SET_KEYS, "proyectos_prioritarios"):
        _set(criterios, key, _as_set(_get(criterios, key)))
    return criterios


def validate_criterios(raw, tenant_project_states=None):
    """R0. Returns [{key, code}], empty when valid.

    tenant_project_states maps each requested project id that belongs to the actor's
    inmobiliaria to its estado; an id missing from it is foreign or deleted. None skips the
    project checks (pure callers without a tenant).
    """
    if not isinstance(raw, dict):
        return [{"key": "criterios", "code": "invalid_type"}]

    errors = []
    for key, value in raw.items():
        if key in GROUPS and isinstance(value, dict):
            for leaf in value:
                if f"{key}.{leaf}" not in CRITERIA_KEYS:
                    errors.append({"key": f"{key}.{leaf}", "code": "unknown_key"})
        elif key not in CRITERIA_KEYS:
            errors.append({"key": key, "code": "unknown_key"})

    present = {}
    for key in CRITERIA_KEYS:
        group, _, leaf = key.partition(".")
        container = raw.get(group) if leaf else raw
        if not isinstance(container, dict) or (leaf or key) not in container:
            errors.append({"key": key, "code": "missing_key"})
        else:
            present[key] = container[leaf or key]

    for key in SET_KEYS:
        if key not in present:
            continue
        value = present[key]
        if not _is_str_list(value):
            errors.append({"key": key, "code": "invalid_type"})
        elif key == "senales.plazos":
            allowed = set(COMMERCIAL_CRITERIA_OPTIONS[key])
            if not value or not set(value) <= allowed:
                errors.append({"key": key, "code": "invalid_value"})
        elif _as_set(value) not in [_as_set(option) for option in COMMERCIAL_CRITERIA_OPTIONS[key]]:
            errors.append({"key": key, "code": "invalid_value"})

    if "senales.propiedad_vista" in present and not isinstance(present["senales.propiedad_vista"], bool):
        errors.append({"key": "senales.propiedad_vista", "code": "invalid_type"})

    for key in ("subir_con_senales", "umbral_reorientar"):
        if key not in present:
            continue
        value = present[key]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"key": key, "code": "invalid_type"})
        elif value not in COMMERCIAL_CRITERIA_OPTIONS[key]:
            errors.append({"key": key, "code": "invalid_value"})

    if present.get("subir_con_senales") == 2 and present.get("senales.propiedad_vista") is False:
        errors.append({"key": "subir_con_senales", "code": "requires_propiedad_vista"})

    if "orden_desempate" in present and present["orden_desempate"] not in COMMERCIAL_CRITERIA_OPTIONS["orden_desempate"]:
        errors.append({"key": "orden_desempate", "code": "invalid_value"})

    if "proyectos_prioritarios" in present:
        value = present["proyectos_prioritarios"]
        if not _is_str_list(value):
            errors.append({"key": "proyectos_prioritarios", "code": "invalid_type"})
        elif len(set(value)) > MAX_PRIORITY_PROJECTS:
            errors.append({"key": "proyectos_prioritarios", "code": "too_many"})
        elif tenant_project_states is not None:
            for project_id in _as_set(value):
                if project_id not in tenant_project_states:
                    errors.append({"key": "proyectos_prioritarios", "code": "project_not_found"})
                    break
                if tenant_project_states[project_id] == "agotado":
                    errors.append({"key": "proyectos_prioritarios", "code": "project_agotado"})
                    break

    return errors


def diff_criterios(before, after):
    """Flat per-key changes between two normalized configurations, in canonical key order."""
    return [
        {"key": key, "before": _get(before, key), "after": _get(after, key)}
        for key in CRITERIA_KEYS
        if _get(before, key) != _get(after, key)
    ]
