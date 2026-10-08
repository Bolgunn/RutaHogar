"""Demo data for HU 15 (commercial metrics): one inmobiliaria with projects, staff and ~150 leads.

How to run, the accounts it creates and how to remove them:
docs/stories/HU15-dashboard-conversion-tiempos/DEMO.md

Everything is generated in memory first, with a fixed random seed:
  * each lead's evaluations come from the real scoring engine, saved through the real HU 13
    TrackingService (against an in-memory copy of hu13_commit), so lineage, plans and goals are the
    app's own; only the timestamps are back-dated;
  * commercial stages follow the stage rules of commercial_stage / project tracks, including the
    sell-out and restock jobs;
  * before anything is written, ALG-18 (frontend/src/lib/commercial/funnelMetrics.js) runs on the
    generated facts and the run stops if a dashboard section would be empty.
Then the accounts are created through the Supabase Admin API (confirmed, so no email is sent), all
with the password in SEED_DEMO_PASSWORD (never committed: the repository is public), and
the rows are written as SQL files, one transaction per batch, applied with `supabase db query`.
The tracking tables reference each other with a deferred foreign key, so they cannot be written
through the REST API one table at a time.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import subprocess
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from app.market_data.service import resolve_market_snapshot_from_environment  # noqa: E402
from app.tracking.contracts import TrackingError  # noqa: E402
from app.tracking.scoring_adapter import complete_snapshot, score_snapshot  # noqa: E402
from app.tracking.service import TrackingService  # noqa: E402

TENANT = "Inmobiliaria Demo Métricas"
EMAIL_DOMAIN = "example.com"
EMAIL_PREFIX = "demo-hu15-"
LEADS = 150
HISTORY_DAYS = 365
BATCH = 5  # leads per SQL file / transaction; keeps each Management API request near 0.6 MB

# Projects: (key, nombre, comuna, tipo, precio_min_uf, precio_max_uf, final estado).
PROJECTS = [
    ("P1", "Mirador Ñuñoa", "Ñuñoa", "departamento", 4200, 5600, "disponible"),
    ("P2", "Plaza Ñuñoa", "Ñuñoa", "departamento", 5800, 7500, "en_construccion"),
    ("P3", "Jardín Ñuñoa", "Ñuñoa", "departamento", 3200, 4300, "disponible"),
    ("P4", "Altos de Providencia", "Providencia", "departamento", 3800, 5200, "agotado"),
    ("P5", "Parque Providencia", "Providencia", "departamento", 4500, 6000, "disponible"),
    ("P6", "Villa Maipú", "Maipú", "casa", 2200, 2900, "disponible"),
    ("P7", "Condominio Maipú", "Maipú", "casa", 2700, 3500, "disponible"),
    ("P8", "Mirador Maipú", "Maipú", "departamento", 1800, 2400, "disponible"),
]
COMUNAS = ["Ñuñoa", "Providencia", "Maipú"]
# P3 sells out about 6 months into the history and is restocked 2 months later; P4 sells out
# 10 months in and stays sold out.
SELL_OUTS = {"P3": (183, 244), "P4": (305, None)}

# Ejecutivo -> {project: estado}. e5 has a pendiente link that must not count; e6 has only a
# pendiente link, so its /metricas shows the empty state.
ASSIGNMENTS = {
    "ejecutivo-1": {"P1": "vinculado", "P2": "vinculado", "P3": "vinculado"},
    "ejecutivo-2": {"P3": "vinculado", "P4": "vinculado"},
    "ejecutivo-3": {"P5": "vinculado", "P6": "vinculado"},
    "ejecutivo-4": {"P6": "vinculado", "P7": "vinculado", "P8": "vinculado"},
    "ejecutivo-5": {"P8": "vinculado", "P1": "pendiente"},
    "ejecutivo-6": {"P2": "pendiente"},
}
ADMINS = ["admin-1", "admin-2"]

# Lead financial profiles: hand-set ranges (decided in the HU 15 demo grill).
INCOME_CLP = (900_000, 6_500_000)
SAVINGS_MONTHS_OF_INCOME = (0, 32)
DEBT_SHARE_CHOICES = [0, 0, 0.05, 0.1, 0.2, 0.35]
AGE = (24, 58)
DELINQUENCY_SHARE = 0.08
# Late buyers (55-60, little savings): the engine's "Reorientar a otro proyecto" comes from them.
LATE_BUYER_SHARE = 0.12
LATE_BUYER_AGE = (55, 60)
LATE_BUYER_SAVINGS_MONTHS = (0, 1.5)

FIRST_NAMES = ["Camila", "Javiera", "Valentina", "Constanza", "Francisca", "Catalina", "Fernanda", "Daniela",
               "Sofía", "Isidora", "Martina", "Antonia", "Benjamín", "Matías", "Sebastián", "Nicolás", "Diego",
               "Tomás", "Joaquín", "Vicente", "Cristóbal", "Felipe", "Ignacio", "Gonzalo", "Rodrigo", "Andrés"]
LAST_NAMES = ["González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda",
              "Morales", "Rodríguez", "López", "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza",
              "Valenzuela", "Castillo", "Tapia", "Reyes", "Gutiérrez", "Castro", "Pizarro", "Álvarez", "Vásquez"]
STAFF_NAMES = {"admin-1": "Carolina Ibáñez", "admin-2": "Marcelo Riquelme", "ejecutivo-1": "Paula Fuenzalida",
               "ejecutivo-2": "Jorge Vergara", "ejecutivo-3": "Andrea Saavedra", "ejecutivo-4": "Luis Cárcamo",
               "ejecutivo-5": "Natalia Orellana", "ejecutivo-6": "Rafael Bustos"}

LADDER = ["nuevo", "contactado", "en_plan_mejora", "en_negociacion", "reserva", "venta_cerrada"]
RANK = {stage: index + 1 for index, stage in enumerate(LADDER)}
PRIORITY_QUALITY = {"Contactar ahora": 0.9, "Contactar con revisión": 0.7, "Reorientar a otro proyecto": 0.5,
                    "Nutrir con plan de mejora": 0.35, "Solicitar antecedentes": 0.3, "No derivar todavía": 0.12}


def email(local: str) -> str:
    return f"{EMAIL_PREFIX}{local}@{EMAIL_DOMAIN}"


def placeholder_id(local: str) -> str:
    """Stable id for an account before it exists; replaced by the real auth id when writing SQL."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://rutahogar.local/{email(local)}"))


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------------------------
# HU 13 persistence, in memory: the same rows hu13_commit / hu13_annotate / hu13_confirm write.
# --------------------------------------------------------------------------------------------
class MemoryRepository:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.scoring_history: list[dict] = []
        self.clock: datetime | None = None

    def bundle(self, user_id):
        return self.users.setdefault(user_id, {"plan": None, "events": [], "goals": [], "goal_events": [],
                                               "evaluations": [], "evaluation_events": []})

    def load(self, user_id):
        data = self.bundle(user_id)
        latest = max(data["events"], key=lambda row: (row["recorded_at"], row["event_id"]), default=None)
        return deepcopy({**data, "revision": latest["event_id"] if latest else None})

    def commit(self, user_id, command, revision, records):
        data = self.bundle(user_id)
        stamp = self.clock
        for item in records["evaluations"]:
            result = item["result"]
            financial = {"input": item["snapshot"], "result": result, "provenance": item["provenance"]}
            data["evaluations"].append({
                "id": item["id"], "user_id": user_id, "score": round(result["score"]),
                "classification": result["classification"], "financial_data": financial,
                "recommendations": result.get("recommendations") or [], "explanation": result.get("explanation"),
                "created_at": iso(stamp),
            })
            self.scoring_history.append({
                "id": str(uuid.UUID(int=random.getrandbits(128), version=4)), "evaluation_id": item["id"],
                "user_id": user_id, "score": round(result["score"]), "classification": result["classification"],
                "snapshot": financial, "component_scores": result["component_scores"],
                "algorithm_version": result["algorithm_version"], "channel": "web", "created_at": iso(stamp),
            })
        plan = records["plan"]
        if plan:
            data["plan"] = {
                "id": plan["id"], "user_id": user_id, "baseline_evaluation_id": plan["baseline_evaluation_id"],
                "root_event_id": plan["root_event_id"], "baseline_at": plan["baseline_at"],
                "original_plan_snapshot": plan["original_plan_snapshot"],
                "target_project_snapshot": plan["target_project_snapshot"], "provenance": plan["provenance"],
                "created_at": iso(stamp),
            }
        elif records["target_project_snapshot"] and not (data["plan"] or {}).get("target_project_snapshot"):
            data["plan"]["target_project_snapshot"] = records["target_project_snapshot"]
        for offset, item in enumerate(records["events"]):
            data["events"].append({
                "event_id": item["event_id"], "plan_id": data["plan"]["id"], "user_id": user_id,
                "event_kind": item["event_kind"], "effective_at": item["effective_at"],
                "recorded_at": iso(stamp + timedelta(milliseconds=offset)), "reason": item["reason"],
                "patch": item["patch"], "recorded_complete_snapshot": item["recorded_complete_snapshot"],
                "previous_event_id": item.get("previous"), "correction_of_event_id": item.get("correction_of"),
                "correction_effect": item.get("correction_effect"), "evaluation_id": item.get("evaluation_id"),
                "canonical_request": command, "command_result": records["result"],
                "algorithm_version": item["algorithm_version"], "provenance": item["provenance"],
            })
        for item in records["goals"]:
            data["goals"].append({
                "id": item["id"], "user_id": user_id, "evaluation_id": plan["baseline_evaluation_id"],
                "title": item.get("title"), "description": item.get("description"), "progress_data": item,
                "tracking_plan_id": data["plan"]["id"], "baseline_event_id": plan["root_event_id"],
                "source_action_type": item.get("source_action_type"), "source_ordinal": item.get("source_ordinal"),
                "metric": item.get("source"), "goal_type": item.get("type"), "direction": item.get("direction"),
                "initial_value": Json(item.get("initial_value")), "target_value": Json(item.get("target_value")),
                "unit": item.get("unit"), "target_at": item.get("target_at"),
                "verification_kind": "automatic" if item.get("verifiable") else "manual",
                "verification_source": Json(item.get("source")), "definition_version": item.get("definition_version"),
            })
        return records["result"]


# --------------------------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------------------------
class Generator:
    def __init__(self, seed: int, anchor: datetime, market_snapshot: dict):
        self.rng = random.Random(seed)
        random.seed(seed)  # MemoryRepository's scoring_history ids
        self.anchor = anchor
        self.start = anchor - timedelta(days=HISTORY_DAYS)
        self.market = market_snapshot
        self.repo = MemoryRepository()
        self.service = TrackingService(self.repo, clock=lambda: self.repo.clock, new_id=self.new_id,
                                       market_snapshot_resolver=lambda: self.market)
        self.projects = {key: {"id": self.new_id(), "key": key, "nombre": nombre, "comuna": comuna, "tipo": tipo,
                               "precio_min_uf": pmin, "precio_max_uf": pmax, "estado": estado}
                         for key, nombre, comuna, tipo, pmin, pmax, estado in PROJECTS}
        self.sell_outs = {key: (self.start + timedelta(days=down, hours=3),
                                self.start + timedelta(days=up, hours=3) if up else None)
                          for key, (down, up) in SELL_OUTS.items()}
        self.staff = {local: {"local": local, "id": placeholder_id(local), "email": email(local), "full_name": STAFF_NAMES[local],
                              "role": "admin_inmobiliario" if local in ADMINS else "ejecutivo"}
                      for local in [*ADMINS, *ASSIGNMENTS]}
        self.leads: list[dict] = []
        self.stage_events: list[dict] = []
        self.favoritos: list[dict] = []
        self.meta = {"undone_sales": 0, "revivals": 0, "sell_out_closures": 0, "restock_reopenings": 0,
                     "skips": 0, "backward_moves": 0}

    def new_id(self) -> str:
        return str(uuid.UUID(int=self.rng.getrandbits(128), version=4))

    def at(self, moment: datetime) -> datetime:
        return min(moment, self.anchor - timedelta(minutes=5))

    # --- financial profile, through the real engine -------------------------------------
    def dividend(self, value_uf: float, savings: float, term: int) -> int:
        principal = max(0.0, value_uf * self.market["uf_value_clp"] - savings)
        monthly, months = self.market["tasa_anual_uf"] / 12, term * 12
        if principal <= 0:
            return 0
        factor = (1 + monthly) ** months
        return round(principal * monthly * factor / (factor - 1))

    def base_state(self) -> dict:
        rng = self.rng
        income = round(rng.uniform(*INCOME_CLP) * rng.uniform(0.6, 1.0), -3)
        state = {
            "ingreso_mensual": income,
            "deuda_mensual": round(income * rng.choice(DEBT_SHARE_CHOICES), -3),
            "edad": rng.randint(*AGE),
            "ahorro_disponible": round(income * rng.uniform(*SAVINGS_MONTHS_OF_INCOME), -3),
            "tipo_contrato": rng.choices(["indefinido", "plazo_fijo", "independiente"], [6, 2, 2])[0],
            "continuidad_laboral": rng.choices(["menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios",
                                                "mas_3_anios"], [1, 1, 3, 5])[0],
            "morosidad_actual": "si" if rng.random() < DELINQUENCY_SHARE else "no",
            "plazo_credito_hipotecario": rng.choice([20, 25, 30]),
            "plazo_compra": rng.choice(["inmediato", "3_a_6_meses", "6_a_12_meses", "mas_12_meses", "solo_explorando"]),
            "tiene_propiedad_vista": rng.random() < 0.35,
            "consentimiento": True,
        }
        if rng.random() < LATE_BUYER_SHARE:
            state.update(edad=rng.randint(*LATE_BUYER_AGE), morosidad_actual="no",
                         ahorro_disponible=round(income * rng.uniform(*LATE_BUYER_SAVINGS_MONTHS), -3))
        if state["morosidad_actual"] == "si":
            state["monto_morosidad"] = round(rng.uniform(150_000, 1_500_000), -3)
            state["antiguedad_morosidad"] = rng.choice(["menos_3_meses", "3_a_12_meses", "1_a_3_anios"])
        return state

    def with_target(self, state: dict, value_uf: float, comuna: str, project: dict | None = None) -> dict:
        target = {**state}
        dividend = self.dividend(value_uf, target["ahorro_disponible"], target["plazo_credito_hipotecario"])
        target.update({
            "property_value": value_uf, "property_value_unit": "uf", "property_value_uf": round(value_uf, 2),
            "comuna_objetivo": comuna, "dividendo_estimado": dividend, "dividendo_esperado": dividend,
            "dividendo_estimado_origen": "calculado_referencial", "dividendo_estimado_calculado": dividend,
            "dividendo_tasa_anual_referencial": self.market["tasa_anual_uf"],
            "dividendo_uf_referencial_clp": self.market["uf_value_clp"],
        })
        if project:
            target.update({
                "property_value_source": "project_selection",
                "vivienda_nueva": project["estado"] == "en_construccion",
                "project_goal": {"id": project["id"], "nombre": project["nombre"], "comuna": project["comuna"],
                                 "tipo_vivienda": project["tipo"], "estado": project["estado"],
                                 "precio_min_uf": project["precio_min_uf"], "precio_max_uf": project["precio_max_uf"]},
            })
        return target

    def score(self, state: dict) -> dict:
        return score_snapshot(complete_snapshot(state), market_snapshot=self.market)

    # --- HU 13 commands -------------------------------------------------------------------
    def command(self, lead: dict, moment: datetime, kind: str, patch: dict) -> dict:
        self.repo.clock = moment + timedelta(seconds=self.rng.randint(1, 50))
        bundle = self.repo.load(lead["id"])
        command = {"event_id": self.new_id(), "effective_at": iso(moment), "event_kind": kind, "patch": patch,
                   "reason": "Nueva evaluación" if kind != "data_update" else "Actualización de antecedentes",
                   "previous_event_id": bundle["revision"]}
        return self.service.execute(lead["id"], command)

    def latest_evaluation(self, lead: dict, moment: datetime) -> dict:
        # Rows are stamped up to a minute after the command's moment (see command()).
        rows = [row for row in self.repo.bundle(lead["id"])["evaluations"]
                if row["created_at"] <= iso(moment + timedelta(minutes=1))]
        return max(rows, key=lambda row: row["created_at"])

    # --- leads ------------------------------------------------------------------------------
    def generate_leads(self):
        rng = self.rng
        # Mild growth: later months get more arrivals.
        offsets = sorted(HISTORY_DAYS * (rng.random() ** 0.8) for _ in range(LEADS))
        for number, offset in enumerate(offsets, start=1):
            t0 = self.start + timedelta(days=offset, hours=rng.randint(9, 21), minutes=rng.randint(0, 59))
            t0 = self.at(t0)
            comuna = rng.choice(COMUNAS)
            alternativa = rng.choice([c for c in COMUNAS if c != comuna]) if rng.random() < 0.25 else None
            own = [p for p in self.projects.values() if p["comuna"] in {comuna, alternativa}]
            local = f"lead-{number:03d}"
            lead = {"id": None, "local": local, "email": email(local), "t0": t0, "comuna": comuna,
                    "alternativa": alternativa, "full_name": f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}",
                    "tipo": rng.choice(["departamento", "casa"]),
                    "objetivo": rng.choice(["comprar_ahora", "prepararme", "evaluar_capacidad", "conocer_propiedad"])}
            lead["id"] = placeholder_id(local)
            base = self.base_state()
            lead["plazo_compra"] = base["plazo_compra"]
            # Aim near what the lead can afford, as real users roughly do.
            probe = self.score(self.with_target(base, 3000, comuna))
            capacity = probe["financial_indicators"].get("capacidad_compra_estimada_uf") or 0
            goal_value = max(1500.0, round((capacity or 1500) * rng.uniform(0.7, 1.4), -1))
            state = self.with_target(base, goal_value, comuna)
            self.command(lead, t0, "baseline", state)
            result = self.latest_evaluation(lead, t0)["financial_data"]["result"]
            action = (result.get("commercial_priority_detail") or {}).get("action")
            cheapest = min((p["precio_min_uf"] for p in own), default=0)
            quality = PRIORITY_QUALITY.get(action, 0.3) + (0.1 if capacity >= cheapest else -0.05)
            lead.update(quality=max(0.02, min(0.98, quality)), state=state, own=own,
                        main=min(own, key=lambda p: abs(p["precio_min_uf"] - capacity)) if own else None)
            self.engagement(lead)
            self.leads.append(lead)

    def engagement(self, lead: dict):
        rng, t0 = self.rng, lead["t0"]
        horizon = (self.anchor - t0).days
        moments = []
        if lead["own"] and rng.random() < 0.5:
            for project in rng.sample(lead["own"], k=min(len(lead["own"]), rng.choice([1, 1, 2]))):
                when = self.at(t0 + timedelta(days=rng.uniform(0, max(1, horizon) * 0.4)))
                if not self.closed(project["key"], when):
                    self.favoritos.append({"usuario_id": lead["id"], "proyecto_id": project["id"], "created_at": iso(when)})
        # Applying to a project = a re-evaluation with that project as the goal.
        if lead["own"] and horizon > 2 and rng.random() < 0.45:
            project = lead["main"] if rng.random() < 0.7 else rng.choice(lead["own"])
            when = self.at(t0 + timedelta(days=rng.expovariate(1 / 12)))
            if when > t0 and not self.closed(project["key"], when):
                state = self.with_target(lead["state"], float(project["precio_min_uf"]), project["comuna"], project)
                self.command(lead, when, "evaluation", state)
                lead["state"] = state
                moments.append(when)
        # Plan acceptance, progress updates and confirmed goals.
        if horizon > 5 and rng.random() < 0.3 + 0.3 * (1 - lead["quality"]):
            when = self.at(max([t0, *moments]) + timedelta(days=rng.uniform(0.5, 20)))
            if when > t0:
                evaluation = self.latest_evaluation(lead, when)
                event_id = self.new_id()
                payload = {"plan_type": rng.choice(["acelerado", "conservador"])}
                command = {"event_id": event_id, "effective_at": iso(when), "kind": "plan_accepted", "payload": payload}
                self.repo.bundle(lead["id"])["evaluation_events"].append({
                    "event_id": event_id, "evaluation_id": evaluation["id"], "user_id": lead["id"],
                    "kind": "plan_accepted", "payload": payload, "effective_at": iso(when),
                    "recorded_at": iso(when + timedelta(seconds=2)), "provenance": {"command": command}})
                lead["plan_accepted_at"] = when
                updates = rng.choice([0, 1, 1, 2, 3])
                current = when
                for _ in range(updates):
                    current = self.at(current + timedelta(days=rng.uniform(10, 45)))
                    if current <= when:
                        break
                    savings = round(lead["state"]["ahorro_disponible"] * rng.uniform(1.03, 1.25), -3)
                    self.command(lead, current, "data_update", {"ahorro_disponible": savings})
                    lead["state"] = {**lead["state"], "ahorro_disponible": savings}
                manual = [g for g in self.repo.bundle(lead["id"])["goals"] if g["verification_kind"] == "manual"]
                if manual and rng.random() < 0.65:
                    confirm_at = self.at(current + timedelta(days=rng.uniform(3, 30)))
                    if confirm_at > when:
                        goal = rng.choice(manual)
                        data = self.repo.bundle(lead["id"])
                        source = max((e for e in data["events"] if e["effective_at"] <= iso(confirm_at)),
                                     key=lambda e: (e["recorded_at"], e["event_id"]))
                        event_id = self.new_id()
                        command = {"event_id": event_id, "effective_at": iso(confirm_at), "confirmed": True,
                                   "reason": "Meta cumplida según el lead"}
                        data["goal_events"].append({
                            "event_id": event_id, "goal_id": goal["id"], "plan_id": data["plan"]["id"],
                            "user_id": lead["id"], "confirmed": True, "effective_at": iso(confirm_at),
                            "recorded_at": iso(confirm_at + timedelta(seconds=3)), "reason": command["reason"],
                            "source_event_id": source["event_id"], "canonical_request": command})

    def closed(self, key: str, moment: datetime) -> bool:
        if key not in self.sell_outs:
            return False
        down, up = self.sell_outs[key]
        return moment >= down and (up is None or moment < up)

    # --- commercial stages ---------------------------------------------------------------------
    def vinculados(self, project_key: str) -> list[str]:
        return [local for local, links in ASSIGNMENTS.items() if links.get(project_key) == "vinculado"]

    def plan_path(self, lead: dict) -> list[tuple]:
        """Desired moves: (moment, project_key | None, stage, actor). Validated by apply_path."""
        rng, q, t = self.rng, lead["quality"], lead["t0"]
        main = lead["main"]
        if not main or rng.random() > 0.12 + 0.78 * q:
            return []
        moves = []
        t += timedelta(days=rng.expovariate(1 / (1.5 + 22 * (1 - q))), hours=rng.randint(0, 8))
        if rng.random() < 0.08:
            moves.append((t, main["key"], "en_negociacion", "ejecutivo"))  # skipped contactado
            self.meta["skips"] += 1
        else:
            moves.append((t, None, "contactado", "ejecutivo"))
            if rng.random() < 0.15 + 0.35 * (1 - q):
                t += timedelta(days=rng.uniform(3, 20))
                moves.append((t, None, "en_plan_mejora", "ejecutivo"))
            if rng.random() > 0.15 + 0.6 * q:
                if rng.random() < 0.3:
                    moves.append((t + timedelta(days=rng.uniform(10, 60)), None, "perdido", "ejecutivo"))
                return moves
            t += timedelta(days=rng.uniform(5, 30))
            moves.append((t, main["key"], "en_negociacion", "ejecutivo"))
        if rng.random() < 0.1 and len(lead["own"]) > 1:
            other = rng.choice([p for p in lead["own"] if p["key"] != main["key"]])
            moves.append((t + timedelta(days=rng.uniform(2, 15)), other["key"], "en_negociacion", "ejecutivo"))
            moves.append((t + timedelta(days=rng.uniform(20, 60)), other["key"], "perdido", "ejecutivo"))
        if rng.random() > 0.3 + 0.5 * q:
            if rng.random() < 0.6:
                t += timedelta(days=rng.uniform(5, 40))
                moves.append((t, main["key"], "perdido", "ejecutivo"))
                if rng.random() < 0.2:
                    moves.append((t + timedelta(days=rng.uniform(10, 50)), None, "contactado", "revival"))
            return moves
        t += timedelta(days=rng.uniform(5, 25))
        moves.append((t, main["key"], "reserva", "ejecutivo"))
        if rng.random() < 0.1:
            t += timedelta(days=rng.uniform(3, 12))
            moves.append((t, main["key"], "en_negociacion", "ejecutivo"))  # backward move
            t += timedelta(days=rng.uniform(5, 20))
            moves.append((t, main["key"], "reserva", "ejecutivo"))
        if rng.random() < 0.45 + 0.45 * q:
            t += timedelta(days=rng.uniform(7, 40))
            moves.append((t, main["key"], "venta_cerrada", "ejecutivo"))
            if rng.random() < 0.12:
                moves.append((t + timedelta(days=rng.uniform(10, 40)), main["key"], "perdido", "admin"))
        elif rng.random() < 0.5:
            moves.append((t + timedelta(days=rng.uniform(10, 40)), main["key"], "perdido", "ejecutivo"))
        return moves

    def apply_path(self, lead: dict, moves: list[tuple]):
        records: dict[str | None, dict] = {}
        jobs = []
        for key, (down, up) in self.sell_outs.items():
            jobs.append((down, key, "sell_out"))
            if up:
                jobs.append((up, key, "restock"))
        timeline = sorted([(m[0], 1, m) for m in moves if m[0] < self.anchor] + [(j[0], 0, j) for j in jobs],
                          key=lambda item: (item[0], item[1]))
        for moment, is_move, item in timeline:
            if not is_move:
                _, key, kind = item
                record = records.get(key)
                if kind == "sell_out" and record and record["stage"] in {"nuevo", "contactado", "en_plan_mejora", "en_negociacion"}:
                    self.emit(lead, records, moment, key, "perdido", None, "proyecto_agotado", job=True)
                    self.meta["sell_out_closures"] += 1
                elif kind == "restock" and record and record.get("closed_from"):
                    self.emit(lead, records, moment, key, record["closed_from"], None, "proyecto_repuesto", job=True)
                    self.meta["restock_reopenings"] += 1
                continue
            _, key, stage, actor_kind = item
            if key and self.closed(key, moment):
                continue
            current = records.get(key, {"stage": "nuevo"})["stage"]
            project_records = {k: r for k, r in records.items() if k is not None}
            if key is None:
                if stage == "perdido" and project_records:
                    continue
                revival = (actor_kind == "revival" and project_records
                           and all(r["stage"] == "perdido" for r in project_records.values()))
                if actor_kind == "revival" and not revival:
                    continue
                if stage == current and not revival:
                    continue
                if revival:
                    self.meta["revivals"] += 1
            else:
                if stage == current:
                    continue
                if current == "venta_cerrada" and not (stage == "perdido" and actor_kind == "admin"):
                    continue
                if current == "perdido" and stage == "venta_cerrada":
                    continue
                if current == "venta_cerrada":
                    self.meta["undone_sales"] += 1
                if current in RANK and stage in RANK and RANK[stage] < RANK[current]:
                    self.meta["backward_moves"] += 1
            actor = self.pick_actor(lead, key, actor_kind)
            if actor is None:
                continue
            reason = self.reason(current, stage, revival=key is None and actor_kind == "revival")
            self.emit(lead, records, moment, key, stage, actor, reason)
        lead["records"] = records

    def pick_actor(self, lead: dict, key: str | None, actor_kind: str) -> str | None:
        """Local name of the staff member who records the move."""
        if actor_kind == "admin":
            return self.rng.choice(ADMINS)
        if key is not None:
            options = self.vinculados(key)
        else:
            options = sorted({local for p in lead["own"] for local in self.vinculados(p["key"])})
        return self.rng.choice(options) if options else None

    @staticmethod
    def reason(current: str, stage: str, revival: bool) -> str | None:
        if revival:
            return "El lead volvió a mostrar interés"
        if stage == "perdido":
            return "El lead no continuó el proceso"
        if current in {"perdido", "venta_cerrada"}:
            return "Se retoma el proceso con el lead"
        if current in RANK and stage in RANK and RANK[stage] < RANK[current]:
            return "El lead pidió revisar condiciones"
        return None

    def emit(self, lead, records, moment, key, stage, actor, reason, job=False):
        previous = records.get(key)
        before = previous["stage"] if previous else ("nuevo" if key is not None else None)
        if before == stage and not (key is None and reason):
            return
        row = {"id": self.new_id(), "occurred_at": iso(moment), "subject_user_id": lead["id"], "proyecto_key": key,
               "actor": actor, "actor_role": "sistema" if job else self.staff[actor]["role"],
               "stage_before": before, "stage_after": stage, "reason": reason, "source": "job" if job else "web"}
        self.stage_events.append(row)
        records[key] = {"stage": stage, "last_event_id": row["id"], "updated_at": row["occurred_at"],
                        "closed_from": before if job and stage == "perdido" else None}

    def generate(self):
        self.generate_leads()
        for lead in self.leads:
            self.apply_path(lead, self.plan_path(lead))
        return self

    # --- facts, exactly as commercial_funnel_facts() would return them --------------------------
    def facts(self, scope_keys: list[str], caller: str | None) -> dict:
        scope = {self.projects[k]["id"] for k in scope_keys}
        by_id = {p["id"]: p for p in self.projects.values()}
        favoritos = {}
        for row in self.favoritos:
            favoritos.setdefault(row["usuario_id"], []).append(row)
        events = {}
        for row in self.stage_events:
            events.setdefault(row["subject_user_id"], []).append(row)
        facts = []
        for lead in sorted(self.leads, key=lambda l: l["id"]):
            data = self.repo.bundle(lead["id"])
            evaluations = sorted(data["evaluations"], key=lambda e: (e["created_at"], e["id"]))
            declared = {lead["comuna"].lower(), (lead["alternativa"] or "").lower()}
            declared |= {(e["financial_data"]["input"].get("comuna_objetivo") or "").lower() for e in evaluations}
            fav_ids = {row["proyecto_id"] for row in favoritos.get(lead["id"], [])}
            record_ids = {self.projects[r["proyecto_key"]]["id"] for r in events.get(lead["id"], []) if r["proyecto_key"]}
            belongs = [p["id"] for k in scope_keys for p in [self.projects[k]]
                       if p["comuna"].lower() in declared or p["id"] in fav_ids or p["id"] in record_ids]
            if not belongs:
                continue
            goal = lambda e: ((e["financial_data"]["input"].get("project_goal") or {}).get("id"))
            postulaciones = {}
            for e in evaluations:
                if goal(e) in scope:
                    postulaciones.setdefault(goal(e), e["created_at"])
            acceptances = [(ev["effective_at"], goal(next(e for e in evaluations if e["id"] == ev["evaluation_id"])))
                           for ev in data["evaluation_events"] if ev["kind"] == "plan_accepted"]
            plan = None
            if acceptances:
                at, target = min(acceptances, key=lambda a: (a[0], a[1] or ""))
                plan = {"baseline_at": at, "target_proyecto_id": target if target in scope else None}
            stage_rows = [r for r in sorted(events.get(lead["id"], []), key=lambda r: (r["occurred_at"], r["id"]))
                          if r["proyecto_key"] is None or self.projects[r["proyecto_key"]]["id"] in scope]
            facts.append({
                "lead_id": None,
                "first_evaluation_at": evaluations[0]["created_at"],
                "evaluaciones": [{"at": e["created_at"], "project_goal_id": goal(e) if goal(e) in scope else None}
                                 for e in evaluations],
                "evaluacion_actual": {"input": evaluations[-1]["financial_data"]["input"],
                                      "onboarding": self.onboarding(lead),
                                      "result": evaluations[-1]["financial_data"]["result"]},
                "proyectos": belongs,
                "postulaciones": [{"proyecto_id": pid, "first_at": at} for pid, at in sorted(postulaciones.items(), key=lambda x: x[1])],
                "stage_events": [{"proyecto_id": self.projects[r["proyecto_key"]]["id"] if r["proyecto_key"] else None,
                                  "stage_after": r["stage_after"], "occurred_at": r["occurred_at"],
                                  "por_sistema": r["actor_role"] == "sistema", "por_mi": caller is not None and r["actor"] == caller}
                                 for r in stage_rows],
                "plan": plan,
                "favoritos": [{"proyecto_id": r["proyecto_id"], "created_at": r["created_at"]}
                              for r in favoritos.get(lead["id"], []) if r["proyecto_id"] in scope],
                "progress_update_ats": [e["recorded_at"] for e in data["events"] if e["event_kind"] in {"data_update", "evaluation"}],
                "confirmed_goal_ats": [g["recorded_at"] for g in data["goal_events"] if g["confirmed"]],
            })
        for number, fact in enumerate(facts, start=1):
            fact["lead_id"] = str(number)
        proyectos = [{key: by_id[pid][key] for key in ("id", "nombre", "comuna", "tipo", "precio_min_uf", "precio_max_uf", "estado")}
                     for pid in [self.projects[k]["id"] for k in scope_keys]]
        return {"now": iso(self.anchor), "proyectos": proyectos, "facts": facts}

    def onboarding(self, lead: dict) -> dict:
        data = {"objetivo_principal": lead["objetivo"], "tipo_propiedad": lead["tipo"], "comuna_interes": lead["comuna"],
                "plazo_compra": lead["plazo_compra"]}
        if lead["alternativa"]:
            data["comuna_alternativa"] = lead["alternativa"]
        return data

    def scope_of(self, local: str) -> list[str]:
        if local in ADMINS:
            return [key for key, *_ in PROJECTS]
        return [key for key, *_ in PROJECTS if ASSIGNMENTS[local].get(key) == "vinculado"]


# --------------------------------------------------------------------------------------------
# Coverage: ALG-18 on the generated facts, through Node
# --------------------------------------------------------------------------------------------
def run_alg18(payload: dict, workdir: Path) -> dict:
    path = workdir / "facts.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    script = Path(__file__).with_name("seed_hu15_demo_check.mjs")
    output = subprocess.run(["node", "--no-warnings", str(script), str(path)], capture_output=True, text=True,
                            encoding="utf-8", check=True)
    return json.loads(output.stdout)


def coverage_problems(summary: dict, meta: dict) -> list[str]:
    m = summary["mes"]
    problems = []
    for etapa in m["embudo"]["etapas"]:
        if etapa["alcanzaron"] == 0:
            problems.append(f"funnel stage {etapa['etapa']} reached by nobody")
    checks = {
        "perdido por gestión": m["embudo"]["perdido_actual"]["por_gestion"],
        "perdido por agotamiento": m["embudo"]["perdido_actual"]["por_agotamiento"],
        "undone sale": meta["undone_sales"], "revived lead": meta["revivals"],
        "sell-out closure": meta["sell_out_closures"], "restock reopening": meta["restock_reopenings"],
        "skipped stage": sum(row["saltaron"] for row in m["tiempos"]["entre_etapas"]),
        "plan → venta": m["plan_a_venta"]["con_plan_y_venta"],
        "en plan de mejora → venta": m["plan_mejora_a_venta"]["con_venta"],
        "uncontacted lead": m["contacto"]["sin_contactar"]["n"],
        "best leads": (m["mejores"] or {}).get("n", 0),
        "uncontacted best lead": (m["contacto"]["tiempo_primer_contacto"] or {}).get("en_curso", 0),
    }
    problems += [f"no {name}" for name, value in checks.items() if not value]
    for accion, row in m["engagement"]["por_accion"].items():
        if row["leads"] == 0:
            problems.append(f"no engagement action {accion}")
    # requiere_antecedentes needs capacidad_status requires_info, which the current engine only gives
    # for income 0, and the score contract rejects income 0. Old evaluations are the only source.
    for band, count in m["bandas"]["afinidad"].items():
        if band != "requiere_antecedentes" and count == 0:
            problems.append(f"affinity band {band} empty")
    for band, count in m["bandas"]["capacidad"].items():
        if band != "requiere_antecedentes" and count == 0:
            problems.append(f"capacity band {band} empty")
    # nurture needs a Bajo classification without a critical blocker; in the current engine a
    # Bajo score practically only comes with "carga total alta" (critical, so do_not_route).
    for row in m["desglose"]["prioridad"]:
        if row["clave"] not in {"sin_prioridad", "nurture"} and row["leads"] == 0:
            problems.append(f"priority {row['clave']} empty")
    if any(p["embudo"]["n"] == 0 for p in m["serie"]["periodos"]):
        problems.append("a month without new leads")
    return problems


# --------------------------------------------------------------------------------------------
# Supabase I/O
# --------------------------------------------------------------------------------------------
class Supabase:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not self.url or not self.key:
            sys.exit("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.")
        self.headers = {"apikey": self.key, "Content-Type": "application/json"}
        if not self.key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {self.key}"

    def request(self, method, path, **kwargs):
        response = httpx.request(method, self.url + path, headers=self.headers, timeout=30, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f"{method} {path}: {response.status_code} {response.text[:300]}")
        return response.json() if response.content else None

    def tenant_exists(self) -> bool:
        rows = self.request("GET", "/rest/v1/inmobiliarias", params={"select": "id", "nombre": f"eq.{TENANT}"})
        return bool(rows)

    def ensure_user(self, address: str, password: str) -> str:
        found = self.request("POST", "/rest/v1/rpc/find_user_id_by_email", json={"p_email": address})
        if found:
            return found
        created = self.request("POST", "/auth/v1/admin/users",
                               json={"email": address, "password": password, "email_confirm": True})
        return created["id"]


# --------------------------------------------------------------------------------------------
# SQL
# --------------------------------------------------------------------------------------------
class Json:
    """A value for a jsonb column that may hold a scalar (a bare number or string would not cast)."""

    def __init__(self, value):
        self.value = value


def lit(value) -> str:
    if isinstance(value, Json):
        value = None if value.value is None else value.value
        return "null" if value is None else "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, (dict, list)):
        return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def insert(table: str, rows: list[dict]) -> str:
    if not rows:
        return ""
    columns = list(rows[0])
    values = ",\n".join("(" + ", ".join(lit(row[c]) for c in columns) + ")" for row in rows)
    return f"insert into public.{table} ({', '.join(columns)}) values\n{values};\n"


def write_sql(gen: Generator, remap: dict[str, str], tenant_id: str, outdir: Path) -> list[Path]:
    """Writes batched SQL files; `remap` swaps each placeholder account id for its real auth id."""

    def save(path: Path, text: str):
        for old, new in remap.items():
            text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")

    staff_ids = {local: staff["id"] for local, staff in gen.staff.items()}
    files = []
    head = ["begin;\n",
            insert("inmobiliarias", [{"id": tenant_id, "nombre": TENANT}]),
            insert("proyectos", [{"id": p["id"], "inmobiliaria_id": tenant_id, "nombre": p["nombre"], "comuna": p["comuna"],
                                  "tipo": p["tipo"], "precio_min_uf": p["precio_min_uf"], "precio_max_uf": p["precio_max_uf"],
                                  "estado": p["estado"], "created_at": iso(gen.start - timedelta(days=30))}
                                 for p in gen.projects.values()]),
            insert("profiles", [{"id": staff_ids[local], "full_name": s["full_name"], "role": s["role"],
                                 "inmobiliaria_id": tenant_id, "created_at": iso(gen.start - timedelta(days=30))}
                                for local, s in gen.staff.items()]),
            insert("proyecto_ejecutivos", [{"proyecto_id": gen.projects[key]["id"],
                                            "ejecutivo_id": staff_ids[local] if estado == "vinculado" else None,
                                            "ejecutivo_email": gen.staff[local]["email"], "source": "manual", "estado": estado}
                                           for local, links in ASSIGNMENTS.items() for key, estado in links.items()]),
            "commit;\n"]
    files.append(outdir / "seed_00_tenant.sql")
    save(files[-1], "".join(head))

    for batch_number, start in enumerate(range(0, len(gen.leads), BATCH), start=1):
        leads = gen.leads[start:start + BATCH]
        lead_ids = {lead["id"] for lead in leads}
        parts = ["begin;\n"]
        parts.append(insert("profiles", [{"id": lead["id"], "full_name": lead["full_name"], "role": "usuario",
                                          "onboarding_data": gen.onboarding(lead),
                                          "consent_data": {"granted": True, "version": "1.0", "timestamp": iso(lead["t0"] - timedelta(minutes=4))},
                                          "created_at": iso(lead["t0"] - timedelta(minutes=5))} for lead in leads]))
        bundles = [gen.repo.bundle(lead["id"]) for lead in leads]
        parts.append(insert("evaluations", [e for b in bundles for e in b["evaluations"]]))
        parts.append(insert("scoring_history", [r for r in gen.repo.scoring_history if r["user_id"] in lead_ids]))
        parts.append(insert("tracking_plans", [b["plan"] for b in bundles if b["plan"]]))
        parts.append(insert("tracking_events", sorted((e for b in bundles for e in b["events"]),
                                                      key=lambda e: (e["user_id"], e["recorded_at"]))))
        parts.append(insert("improvement_goals", [g for b in bundles for g in b["goals"]]))
        parts.append(insert("evaluation_events", [e for b in bundles for e in b["evaluation_events"]]))
        parts.append(insert("improvement_goal_events", [g for b in bundles for g in b["goal_events"]]))
        parts.append(insert("proyecto_favoritos", [f for f in gen.favoritos if f["usuario_id"] in lead_ids]))
        events = [r for r in gen.stage_events if r["subject_user_id"] in lead_ids]
        parts.append(insert("commercial_stage_events", [{
            "id": r["id"], "occurred_at": r["occurred_at"], "subject_user_id": r["subject_user_id"],
            "inmobiliaria_id": tenant_id, "proyecto_id": gen.projects[r["proyecto_key"]]["id"] if r["proyecto_key"] else None,
            "actor_id": staff_ids[r["actor"]] if r["actor"] else None, "actor_role": r["actor_role"],
            "stage_before": r["stage_before"], "stage_after": r["stage_after"], "reason": r["reason"], "source": r["source"],
        } for r in events]))
        lead_level, project_level = [], []
        for lead in leads:
            for key, record in lead.get("records", {}).items():
                row = {"subject_user_id": lead["id"], "inmobiliaria_id": tenant_id, "stage": record["stage"],
                       "last_event_id": record["last_event_id"], "updated_at": record["updated_at"]}
                if key is None:
                    lead_level.append(row)
                else:
                    project_level.append({**row, "proyecto_id": gen.projects[key]["id"]})
        parts.append(insert("lead_commercial_stage", lead_level))
        parts.append(insert("lead_project_commercial_stage", project_level))
        parts.append("commit;\n")
        files.append(outdir / f"seed_{batch_number:02d}_leads.sql")
        save(files[-1], "".join(parts))
    return files


def apply_sql(files: list[Path], target: str, workdir: str | None):
    """linked: `supabase db query --linked` (Management API, runs a multi-statement file as one batch).
    local: psql inside the local stack's database container, because `supabase db query --local`
    sends a prepared statement and rejects multi-statement files."""
    container = None
    if target == "local":
        names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True).stdout.split()
        container = next((name for name in names if name.startswith("supabase_db_")), None)
        if not container:
            sys.exit("no running local Supabase database container (supabase_db_*); run `supabase start` first.")
    for path in files:
        print(f"applying {path.name} …", flush=True)
        if container:
            with path.open("rb") as handle:
                subprocess.run(["docker", "exec", "-i", container, "psql", "-q", "-v", "ON_ERROR_STOP=1",
                                "-U", "postgres", "-d", "postgres"], stdin=handle, check=True)
            continue
        command = ["supabase", "db", "query", "--linked", "-f", str(path)]
        if workdir:
            command += ["--workdir", workdir]
        subprocess.run(command, check=True, cwd=str(REPO), stdout=subprocess.DEVNULL)


# --------------------------------------------------------------------------------------------
def summarize(summary: dict, gen: Generator) -> str:
    m = summary["mes"]
    venta = m["embudo"]["etapas"][-1]["alcanzaron"]
    lines = [
        f"leads: {m['n']} · postularon {m['captura']['postulan']} · ventas vigentes {venta}",
        "funnel: " + " → ".join(f"{e['etapa']} {e['alcanzaron']}" for e in m["embudo"]["etapas"]),
        f"open {m['embudo']['abiertos']} · lost {m['embudo']['perdido_actual']['total']} "
        f"({m['embudo']['perdido_actual']['por_gestion']} gestión / {m['embudo']['perdido_actual']['por_agotamiento']} agotamiento)",
        f"en plan de mejora → venta {m['plan_mejora_a_venta']['con_venta']}/{m['plan_mejora_a_venta']['en_plan_mejora']} · "
        f"ventas con plan {m['plan_a_venta']['con_plan_y_venta']}/{m['plan_a_venta']['con_plan']}",
        f"best leads {(m['mejores'] or {}).get('n')} · sin contactar {m['contacto']['sin_contactar']['n']}",
        f"afinidad {m['bandas']['afinidad']}", f"capacidad {m['bandas']['capacidad']}",
        f"periods: {len(summary['semana']['serie']['periodos'])} weeks, {len(m['serie']['periodos'])} months, "
        f"{len(summary['año']['serie']['periodos'])} years",
        f"events: {gen.meta}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--seed", type=int, default=15, help="first random seed to try (default 15)")
    parser.add_argument("--attempts", type=int, default=20,
                        help="seeds to try, from --seed upwards, until the coverage check passes (default 20)")
    parser.add_argument("--anchor", help="'today' of the data, YYYY-MM-DD (default: today, UTC)")
    parser.add_argument("--target", choices=["linked", "local"], default="linked",
                        help="database `supabase db query` writes to (default linked)")
    parser.add_argument("--workdir", help="passed to `supabase db query --workdir`")
    parser.add_argument("--dry-run", action="store_true", help="generate and check only; write SQL with placeholder ids")
    parser.add_argument("--out", default=str(REPO / ".seed_hu15_demo"), help="directory for the SQL files")
    args = parser.parse_args()

    anchor = datetime.fromisoformat(args.anchor).replace(tzinfo=timezone.utc, hour=12) if args.anchor \
        else datetime.now(timezone.utc).replace(microsecond=0)
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    market = resolve_market_snapshot_from_environment()
    print(f"market snapshot {market.get('effective_date')} · UF {market['uf_value_clp']} · anchor {iso(anchor)}")
    for seed in range(args.seed, args.seed + args.attempts):
        gen = Generator(seed, anchor, market).generate()
        summary = run_alg18({"admin": gen.facts(gen.scope_of("admin-1"), "admin-1")}, outdir)["admin"]
        problems = coverage_problems(summary, gen.meta)
        if not problems:
            break
        print(f"seed {seed}: coverage check failed ({'; '.join(problems)}), trying the next seed")
    else:
        sys.exit(f"no seed in {args.seed}..{args.seed + args.attempts - 1} passed the coverage check; nothing written.")
    print(f"seed {seed}: coverage ok")
    print(summarize(summary, gen))
    scopes = run_alg18({local: gen.facts(gen.scope_of(local), local) for local in gen.staff}, outdir)
    for local, s in scopes.items():
        print(f"  {email(local)}: {len(gen.scope_of(local))} projects, {s['mes']['n']} leads, "
              f"contactados por mí {s['mes']['contacto']['contactados_por_mi']['total']}")

    if args.dry_run:
        files = write_sql(gen, {}, gen.new_id(), outdir)
        print(f"dry run: coverage ok, {len(files)} SQL files in {outdir} (placeholder account ids), nothing applied.")
        return

    password = os.environ.get("SEED_DEMO_PASSWORD", "")
    if len(password) < 8:
        sys.exit("Set SEED_DEMO_PASSWORD (at least 8 characters): every demo account gets it. It is never stored in the repo.")
    supabase = Supabase()
    if supabase.tenant_exists():
        sys.exit(f"'{TENANT}' already exists. Run the teardown (DEMO.md) before seeding again.")
    remap = {}
    accounts = [(staff["local"], staff["id"]) for staff in gen.staff.values()] + [(lead["local"], lead["id"]) for lead in gen.leads]
    for number, (local, placeholder) in enumerate(accounts, start=1):
        real = supabase.ensure_user(email(local), password)
        if real != placeholder:
            remap[placeholder] = real
        if number % 25 == 0:
            print(f"  accounts: {number}/{len(accounts)}", flush=True)
    files = write_sql(gen, remap, gen.new_id(), outdir)
    apply_sql(files, args.target, args.workdir)
    print(f"done: {TENANT} seeded with {len(gen.leads)} leads.")


if __name__ == "__main__":
    try:
        main()
    except TrackingError as exc:
        sys.exit(f"tracking error: {exc}")
