"""Export only explicitly selected fields; never serialize raw evaluations."""
from datetime import datetime, timezone
from urllib.parse import urlencode

from ..tracking.contracts import TrackingError

BLOCKS = frozenset({"profile", "evaluation", "financial", "project", "plan", "evaluation_history", "commercial_history"})
METRIC_SECTIONS = frozenset({"resumen", "embudo", "tiempos", "engagement", "desgloses", "historico"})
FINANCIAL_FIELDS = ("ingreso_mensual", "deuda_mensual", "ahorro_disponible", "dividendo_estimado", "edad", "tipo_contrato", "continuidad_laboral", "morosidad_actual", "plazo_credito_hipotecario")
PROJECT_FIELDS = ("id", "nombre", "comuna", "tipo", "tipo_vivienda", "precio_min_uf", "precio_max_uf", "estado")


def selected_scalars(value, fields):
    value = value if isinstance(value, dict) else {}
    return {key: value[key] for key in fields if key in value and isinstance(value[key], (str, int, float, bool, type(None)))}


def evaluation_parts(row):
    financial = row.get("financial_data") or {}
    return financial.get("input") or financial.get("input_snapshot") or financial, financial.get("result") or financial.get("result_snapshot") or {}


class ExportService:
    def __init__(self, repository):
        self.repo = repository

    def describe_records(self, records):
        """Resolve only actors referenced by already-authorized export records."""
        actors = {}
        for record in records:
            actor_id = record.get("actor_id")
            if actor_id and actor_id not in actors:
                query = urlencode({"id": f"eq.{actor_id}", "select": "full_name", "inmobiliaria_id": f"eq.{record['inmobiliaria_id']}"})
                profiles = self.repo.request("GET", f"/rest/v1/profiles?{query}")
                # Email lives in Auth, not in the public profiles table.
                user = self.repo.request("GET", f"/auth/v1/admin/users/{actor_id}") if profiles else {}
                actors[actor_id] = {"actor_name": profiles[0].get("full_name") if profiles else None, "actor_email": user.get("email")}
        return [{**record, **actors.get(record.get("actor_id"), {})} for record in records]

    def prepare(self, token, command, *, preview=False):
        actor = self.repo.staff_actor(token)
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"} or not actor.get("inmobiliaria_id"):
            raise TrackingError("owner_mismatch")
        # This existing RPC derives scope from auth.uid(), including project assignments.
        scope = self.repo.request("POST", "/rest/v1/rpc/commercial_funnel_facts", token=token, payload={})
        projects = {str(p["id"]): p for p in scope.get("proyectos", [])}
        project_id = str(command.project_id) if command.project_id else None
        if project_id and project_id not in projects:
            raise TrackingError("owner_mismatch")
        blocks = set(command.blocks)
        allowed = METRIC_SECTIONS if command.kind == "metrics" else BLOCKS
        if not blocks or not blocks <= allowed:
            raise TrackingError("invalid_export_fields")
        if command.kind == "dossier" and len(command.evaluation_ids) != 1:
            raise TrackingError("invalid_export_selection")
        if command.kind != "metrics" and not command.evaluation_ids:
            raise TrackingError("invalid_export_selection")
        if command.kind == "metrics" and command.evaluation_ids:
            raise TrackingError("invalid_export_selection")
        authorized_rows = self.repo.request("POST", "/rest/v1/rpc/hu22_export_rows", payload={"p_evaluations": [str(x) for x in command.evaluation_ids], "p_projects": [project_id] if project_id else list(projects)}) if command.kind != "metrics" else []
        by_id = {str(row["id"]): row for row in authorized_rows}
        if preview:
            return {"eligible_ids": [str(eid) for eid in command.evaluation_ids if str(eid) in by_id and evaluation_parts(by_id[str(eid)])[0].get("consentimiento") is not False]}
        subjects, items = [], []
        for evaluation_id in command.evaluation_ids:
            row = by_id.get(str(evaluation_id))
            if not row:
                raise TrackingError("owner_mismatch")
            lead_id = row["user_id"]
            memberships = row["authorized_projects"]
            if not memberships:
                raise TrackingError("owner_mismatch")
            if lead_id in subjects:
                raise TrackingError("invalid_export_selection")
            subjects.append(lead_id)
            input_data, result = evaluation_parts(row)
            if input_data.get("consentimiento") is False:
                raise TrackingError("owner_mismatch")
            item = {"evaluation_id": row["id"], "evaluated_at": row["created_at"]}
            if "profile" in blocks:
                item["profile"] = {**selected_scalars(row, ("full_name", "phone")), "email": row.get("email")}
            if "evaluation" in blocks:
                item["evaluation"] = {"evaluated_at": row["created_at"], "score": result.get("adjusted_score", result.get("score", row.get("score"))), "classification": result.get("classification", row.get("classification"))}
            if "financial" in blocks:
                item["financial"] = selected_scalars(input_data, FINANCIAL_FIELDS)
            if "project" in blocks:
                goal = input_data.get("project_goal") or {}
                goal_id = str(goal.get("id", ""))
                item["project"] = {"objective": selected_scalars(goal, PROJECT_FIELDS) if goal_id in projects else {"estado": "Objetivo fuera del alcance autorizado"}, "analyzed": selected_scalars(projects[project_id], PROJECT_FIELDS) if project_id else None}
                item["project"]["objective_compatibility"] = selected_scalars(result.get("project_fit"), ("score", "classification", "status", "income_gap_clp", "down_payment_gap_clp")) if goal_id in projects else None
            if "plan" in blocks:
                # Free-form AI narratives may repeat third-party financial data.
                # Export only the lead's structured, primary-party objectives.
                actions = result.get("structured_improvement_plan") or []
                item["plan"] = ([selected_scalars(action, ("type", "title", "current_value", "target_value", "gap", "priority", "estimated_months")) for action in actions if isinstance(action, dict)] if not input_data.get("complemento_renta") else [{"title": "Plan conjunto omitido: esta exportación no incluye antecedentes del codeudor."}])
            if "evaluation_history" in blocks:
                history = self.repo.staff_history(lead_id)
                item["evaluation_history"] = []
                for entry in sorted(history, key=lambda h: h.get("created_at") or ""):
                    historic = entry.get("snapshot") or {}
                    historic_input = historic.get("input") or historic.get("input_snapshot") or historic
                    item["evaluation_history"].append({**selected_scalars(entry, ("created_at", "score", "classification", "evaluation_id")), **selected_scalars(historic_input, ("ingreso_mensual", "deuda_mensual", "ahorro_disponible"))})
            if "commercial_history" in blocks:
                history = self.repo.request("GET", "/rest/v1/commercial_stage_events?" + urlencode({"subject_user_id": f"eq.{lead_id}", "inmobiliaria_id": f"eq.{actor['inmobiliaria_id']}", "proyecto_id": "in.(" + ",".join(memberships) + ")", "select": "occurred_at,proyecto_id,stage_before,stage_after,actor_role,reason", "order": "occurred_at.asc"}))
                item["commercial_history"] = [selected_scalars(h, ("occurred_at", "proyecto_id", "stage_before", "stage_after", "actor_role", "reason")) for h in history]
            items.append(item)
        now = datetime.now(timezone.utc).isoformat()
        record = {"id": str(command.request_id), "actor_id": actor["id"], "actor_role": actor["role"], "inmobiliaria_id": actor["inmobiliaria_id"], "kind": command.kind, "format": "pdf" if command.kind == "dossier" else "xlsx", "blocks": sorted(blocks), "evaluation_ids": [str(x) for x in command.evaluation_ids], "project_id": project_id, "filters": command.filters, "source_at": command.source_at or scope.get("now"), "record_count": len(items) if command.kind != "metrics" else None, "generated_at": now, "status": "prepared"}
        # Persist before releasing data. A retry reuses a request ID only if its payload matches.
        old = self.repo.request("GET", "/rest/v1/export_events?" + urlencode({"id": f"eq.{command.request_id}", "select": "*"}))
        if old:
            if any(old[0].get(k) != record.get(k) for k in ("actor_id", "inmobiliaria_id", "kind", "blocks", "evaluation_ids", "project_id", "filters")) or (command.source_at and old[0].get("source_at") != command.source_at):
                raise TrackingError("idempotency_conflict")
            record = old[0]
        else:
            self.repo.request("POST", "/rest/v1/rpc/hu22_record_export", payload={"p_record": record})
        context = self.describe_records([record])[0]
        context["project_name"] = projects.get(project_id, {}).get("nombre")
        return {"context": context, "items": items, "scope_projects": [selected_scalars(p, PROJECT_FIELDS) for p in projects.values()]}
