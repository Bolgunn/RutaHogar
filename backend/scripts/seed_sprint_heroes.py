"""Hero personas for the sprint review, generated in the same run as the bulk seed (`--heroes`).

Plan and decisions: docs/stories/sprint-review-seed/PLAN.md.

  * Camila (HU 14 E1 + E2): four evaluations over ~6 months, improving; the latest turns Compatible
    with the presenter's Mirador Ñuñoa, so ALG-14 shows her as the presenter's first opportunity.
  * Matías (HU 14 E3): same project, Medio, short of its minimum price; compared against Camila.
  * Diego (HU 20): one evaluation more than 30 days old, so the real detectors of LeadChangeService
    find his events; scored with the market snapshot in force on that date, when one exists.

Every evaluation goes through the real engine and the real HU 13 TrackingService, like the bulk leads.
Profiles are searched over a few parameters until the app's own code (ALG-10/14 and the comparison,
through Node; the HU 20 detectors in Python) shows each story; if none does, nothing is written.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import seed_hu15_demo as seed
from app.lead_changes.service import LeadChangeService
from app.market_data.repository import MarketRepositoryError, MarketSnapshotRepository
from app.market_data.snapshot import SnapshotValidationError, validate_snapshot

PRESENTER = "ejecutivo-1"
STORY_PROJECT = "P1"  # Mirador Ñuñoa, linked to the presenter
DIEGO_PROJECT = "P6"  # Villa Maipú: his goal; Mirador Maipú, cheaper, is the one he unlocks
DIEGO_AGE_DAYS = 35  # past LeadChangeService's 30-day monthly summary

CAMILA_DAYS = [170, 115, 60, 4]
CAMILA_INCOME_SHARE = [0.72, 0.8, 0.88, 1.0]
CAMILA_DEBT_SHARE = [0.22, 0.16, 0.1, 0.04]
CAMILA_SAVINGS_SHARE = [0.3, 0.5, 0.72, 1.0]  # of her final savings
MATIAS_DAYS = [90, 20]


class StoryError(RuntimeError):
    pass


def snapshot_history(supabase) -> list[dict]:
    """Every valid persisted market snapshot, oldest first (read-only)."""
    repository = MarketSnapshotRepository(supabase.url, supabase.key)
    try:
        rows = repository.list_uf_history()
    except MarketRepositoryError as exc:
        raise StoryError("could not read market_snapshots") from exc
    snapshots = []
    for row in rows:
        try:
            snapshots.append(validate_snapshot(row.get("snapshot")))
        except SnapshotValidationError:
            continue
    return snapshots


def available_projects(supabase) -> list[dict]:
    """What the HU 20 cron matches leads against: every project that is not agotado (read-only).
    `demo` marks projects of a demo tenant (name ending in '(demo)'), the only ones Diego may unlock."""
    rows = supabase.request("GET", "/rest/v1/proyectos", params={
        "select": "id,inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf,estado,inmobiliarias!proyectos_inmobiliaria_id_fkey(nombre)",
        "estado": "neq.agotado", "order": "nombre.asc"}) or []
    for row in rows:
        row["demo"] = ((row.pop("inmobiliarias", None) or {}).get("nombre") or "").endswith("(demo)")
    return rows


def _project_row(project: dict) -> dict:
    return {key: project[key] for key in ("id", "nombre", "comuna", "tipo", "precio_min_uf", "precio_max_uf", "estado")}


def _state(gen, income, debt_share, savings, project, *, edad, contrato="indefinido", continuidad="mas_3_anios"):
    base = {
        "ingreso_mensual": round(income, -3), "deuda_mensual": round(income * debt_share, -3), "edad": edad,
        "ahorro_disponible": round(savings, -3), "tipo_contrato": contrato, "continuidad_laboral": continuidad,
        "morosidad_actual": "no", "plazo_credito_hipotecario": 25, "plazo_compra": "3_a_6_meses",
        "tiene_propiedad_vista": True, "consentimiento": True,
    }
    return gen.with_target(base, float(project["precio_min_uf"]), project["comuna"], project)


def _normalized(user_id, evaluation_id, created_at, state, result):
    """An evaluation as the staff dashboard sees it (services/evaluationService.normalizeEvaluation)."""
    return {"id": evaluation_id, "user_id": user_id, "created_at": created_at, "input": state, "result": result,
            "onboarding": {"objetivo_principal": "", "tipo_propiedad": "", "comuna_interes": state.get("comuna_objetivo") or "",
                           "comuna_alternativa": state.get("comuna_alternativa") or "",
                           "plazo_compra": state.get("plazo_compra") or "", "tiene_propiedad_vista": state.get("tiene_propiedad_vista")}}


def _presenter_scope(gen) -> tuple[list[dict], list[dict]]:
    """The presenter's projects and the bulk evaluations of the leads its dashboard lists."""
    keys = gen.scope_of(PRESENTER)
    projects = [gen.projects[key] for key in keys]
    ids = {p["id"] for p in projects}
    comunas = {p["comuna"].lower() for p in projects}
    favorites = {(row["usuario_id"], row["proyecto_id"]) for row in gen.favoritos}
    evaluations = []
    for lead in gen.leads:
        rows = gen.repo.bundle(lead["id"])["evaluations"]
        declared = {lead["comuna"].lower(), (lead["alternativa"] or "").lower()}
        declared |= {(row["financial_data"]["input"].get("comuna_objetivo") or "").lower() for row in rows}
        staged = {gen.projects[key]["id"] for key in lead.get("records", {}) if key}
        if not (declared & comunas or staged & ids or any((lead["id"], pid) in favorites for pid in ids)):
            continue
        evaluations += [_normalized(lead["id"], row["id"], row["created_at"], row["financial_data"]["input"],
                                    row["financial_data"]["result"]) for row in rows]
    return [_project_row(p) for p in projects], evaluations


def _run_check(scenarios: list[dict], workdir: Path) -> dict:
    path = workdir / "heroes_check.json"
    path.write_text(json.dumps({"scenarios": scenarios}, ensure_ascii=False), encoding="utf-8")
    script = Path(__file__).with_name("seed_sprint_heroes_check.mjs")
    output = subprocess.run(["node", "--no-warnings", str(script), str(path)], capture_output=True, text=True,
                            encoding="utf-8", check=True)
    return json.loads(output.stdout)


def _hero(number: int, local: str, nombre: str, paterno: str, materno: str, comuna: str, tipo: str) -> dict:
    index = seed.staff_count() + seed.LEADS + number
    return {"local": local, "email": seed.email(local), "id": seed.placeholder_id(local), "t0": None,
            "comuna": comuna, "alternativa": None, "tipo": tipo, "objetivo": "comprar_ahora",
            "plazo_compra": "3_a_6_meses", "records": {}, **seed.identity(index, nombre, paterno, materno)}


def _camila_states(gen, project, income, savings):
    return [_state(gen, income * share_i, share_d, savings * share_s, project, edad=33)
            for share_i, share_d, share_s in zip(CAMILA_INCOME_SHARE, CAMILA_DEBT_SHARE, CAMILA_SAVINGS_SHARE)]


def _matias_states(gen, project, income, savings):
    # Debt creeps up, staying under the share that becomes a critical blocker (and excludes him from
    # the project): no improvement, so he is never an opportunity himself.
    return [_state(gen, income, 0.12, savings, project, edad=41, continuidad="entre_1_y_3_anios"),
            _state(gen, income, 0.16, savings * 1.05, project, edad=41, continuidad="entre_1_y_3_anios")]


def _story_hu14(gen, workdir: Path) -> tuple[list, list]:
    """Chooses Camila's and Matías's profiles; returns the (moment, state) commands for each."""
    project = gen.projects[STORY_PROJECT]
    projects, bulk = _presenter_scope(gen)
    camila_id, matias_id = seed.placeholder_id("hero-camila"), seed.placeholder_id("hero-matias")

    def virtual(user_id, days, states, tag):
        out = []
        for offset, (day, state) in enumerate(zip(days, states)):
            moment = seed.iso(gen.anchor - timedelta(days=day, hours=offset))
            out.append(_normalized(user_id, f"{tag}-{offset}", moment, state, gen.score(state)))
        return out

    matias_candidates = [states for income in range(1_300_000, 6_000_001, 100_000)
                         for states in [_matias_states(gen, project, income, income * 6)]
                         if gen.score(states[-1])["classification"] == "Medio"]
    results = _run_check([{"key": str(i), "evaluations": bulk + virtual(matias_id, MATIAS_DAYS, states, "matias"),
                           "projects": projects, "project_id": project["id"], "compare": [matias_id]}
                          for i, states in enumerate(matias_candidates)], workdir)
    matias = next((states for i, states in enumerate(matias_candidates)
                   if not _matias_problems(results[str(i)], matias_id)), None)
    if not matias:
        raise StoryError("no Matías profile is a Medio lead rated Cercano or Marginal for Mirador Ñuñoa")
    matias_rows = virtual(matias_id, MATIAS_DAYS, matias, "matias")

    candidates = []
    for income in range(4_000_000, 10_500_001, 200_000):
        for savings_months in (8, 10, 12, 14):
            candidates.append((income, income * savings_months))
    scenarios = [{"key": str(i), "evaluations": bulk + matias_rows + virtual(camila_id, CAMILA_DAYS, _camila_states(gen, project, inc, sav), "camila"),
                  "projects": projects, "project_id": project["id"], "compare": [camila_id, matias_id]}
                 for i, (inc, sav) in enumerate(candidates)]
    results = _run_check(scenarios, workdir)
    for i, (income, savings) in enumerate(candidates):
        if not _hu14_problems(results[str(i)], camila_id, matias_id, project["id"]):
            return list(zip(CAMILA_DAYS, _camila_states(gen, project, income, savings))), list(zip(MATIAS_DAYS, matias))
    raise StoryError("no Camila profile becomes the presenter's first ALG-14 opportunity for Mirador Ñuñoa")


def _hu14_problems(result: dict, camila_id: str, matias_id: str, project_id: str) -> list[str]:
    problems = []
    opportunities = result["opportunities"]
    first = opportunities[0] if opportunities else None
    if not first or first["user_id"] != camila_id:
        problems.append("Camila is not the presenter's first opportunity")
    elif not any(t in first["triggers"] for t in (f"compatibility:{project_id}", f"capacity:{project_id}")):
        problems.append("Camila's opportunity is not about Mirador Ñuñoa")
    camila = result["matches"][camila_id]
    if not camila["latest"] or camila["latest"]["clasificacion"] != "Compatible" or not camila["latest"]["alcanza_precio_min"]:
        problems.append("Camila's latest evaluation is not Compatible with Mirador Ñuñoa")
    if camila["previous"] and camila["previous"]["clasificacion"] == "Compatible":
        problems.append("Camila was already Compatible before")
    problems += _matias_problems(result, matias_id)
    if len(result["comparison"]) != 2:
        problems.append("the comparison does not show both heroes")
    return problems


def _matias_problems(result: dict, matias_id: str) -> list[str]:
    matias = result["matches"][matias_id]["latest"]
    problems = []
    if (not matias or matias["classification"] != "Medio" or matias["alcanza_precio_min"]
            or matias["clasificacion"] not in {"Cercano", "Marginal"}):
        problems.append("Matías is not a Medio lead rated Cercano or Marginal, short of Mirador Ñuñoa")
    if any(o["user_id"] == matias_id for o in result["opportunities"]):
        problems.append("Matías shows up as an opportunity")
    return problems


def _in_force(history: list[dict], moment: datetime) -> dict | None:
    day = moment.date().isoformat()
    older = [s for s in history if s["effective_date"] <= day]
    return older[-1] if older else None


def _detect(gen, lead_id, evaluation, projects):
    lead = {"user_id": lead_id, "latest_evaluation_id": evaluation["id"], "latest_evaluation_at": evaluation["created_at"],
            "classification": evaluation["classification"], "score": evaluation["score"],
            "financial_data": evaluation["financial_data"]}
    service = LeadChangeService(repository=object(), email_client=object(), clock=lambda: gen.anchor)
    return service._detect_events(lead, projects)


def _story_hu20(gen, history: list[dict], projects: list[dict]):
    """Chooses Diego's profile and the snapshot his evaluation used; returns (moment, state, snapshot, expected)."""
    goal = gen.projects[DIEGO_PROJECT]
    moment = gen.anchor - timedelta(days=DIEGO_AGE_DAYS)
    then = _in_force(history, moment)
    old = then if then and then.get("fetched_at") != gen.market.get("fetched_at") else None
    demo_ids = {p["id"] for p in gen.projects.values()} | {p["id"] for p in projects if p.get("demo")}
    current = gen.market
    for income in range(1_200_000, 6_000_001, 50_000):
        state = _state(gen, income, 0.1, income * 5, goal, edad=36)
        gen.market = old or current
        try:
            result = gen.score(state)
        finally:
            gen.market = current
        capacity = result["financial_indicators"].get("capacidad_compra_estimada_uf") or 0
        reachable = sorted((p for p in projects if capacity >= p["precio_min_uf"]), key=lambda p: (p["precio_min_uf"], p["nombre"]))
        if not reachable or reachable[0]["id"] not in demo_ids or capacity >= goal["precio_min_uf"]:
            continue
        evaluation = {"id": "diego", "created_at": seed.iso(moment), "classification": result["classification"],
                      "score": round(result["score"]),
                      "financial_data": {"input": state, "result": result}}
        kinds = {event["event_type"] for event in _detect(gen, "diego", evaluation, projects)}
        expected = {"monthly_plan_summary", "project_compatible_unlocked"} | ({"score_band_improved"} if old else set())
        if expected <= kinds:
            return moment, state, old, expected
    if old:
        raise StoryError("no Diego profile moves up a band between the old and the current market snapshot")
    raise StoryError("no Diego profile unlocks a demo project")


def add_heroes(gen, history: list[dict], projects: list[dict], workdir: Path) -> dict:
    """Appends the heroes to gen.leads (so accounts, SQL and teardown treat them like any lead) and
    returns Diego's events to record once his account exists."""
    camila_plan, matias_plan = _story_hu14(gen, workdir)
    diego_moment, diego_state, diego_snapshot, expected = _story_hu20(gen, history, projects)

    camila = _hero(0, "hero-camila", "Camila", "Fuentes", "Morales", "Ñuñoa", "departamento")
    matias = _hero(1, "hero-matias", "Matías", "Herrera", "Soto", "Ñuñoa", "departamento")
    diego = _hero(2, "hero-diego", "Diego", "Paredes", "Lagos", "Maipú", "casa")
    for lead, plan in ((camila, camila_plan), (matias, matias_plan)):
        for number, (day, state) in enumerate(plan):
            moment = gen.anchor - timedelta(days=day, hours=number)
            lead["t0"] = lead["t0"] or moment
            gen.command(lead, moment, "baseline" if number == 0 else "evaluation", state)
    diego["t0"] = diego_moment
    current = gen.market
    gen.market = diego_snapshot or current
    try:
        gen.command(diego, diego_moment, "baseline", diego_state)
    finally:
        gen.market = current
    gen.leads += [camila, matias, diego]

    projects_scope, bulk = _presenter_scope(gen)
    project = gen.projects[STORY_PROJECT]
    check = _run_check([{"key": "final", "evaluations": bulk, "projects": projects_scope, "project_id": project["id"],
                         "compare": [camila["id"], matias["id"]]}], workdir)["final"]
    problems = _hu14_problems(check, camila["id"], matias["id"], project["id"])
    evaluation = gen.repo.bundle(diego["id"])["evaluations"][-1]
    events = _detect(gen, diego["id"], evaluation, projects)
    missing = expected - {event["event_type"] for event in events}
    if missing:
        problems.append(f"Diego's saved evaluation does not produce {sorted(missing)}")
    if problems:
        raise StoryError("; ".join(problems))
    return {"events": events, "summary": [
        f"  {camila['email']}: {len(camila_plan)} evaluations, first opportunity of {seed.email(PRESENTER)} "
        f"({check['opportunities'][0]['primary']}), {check['matches'][camila['id']]['latest']['classification']}",
        f"  {matias['email']}: {check['matches'][matias['id']]['latest']['classification']}, "
        f"{check['matches'][matias['id']]['latest']['clasificacion']} with {project['nombre']}",
        f"  {diego['email']}: events {sorted(e['event_type'] for e in events)}"
        + ("" if diego_snapshot else " (no older market snapshot in force, so no score_band_improved)"),
    ]}


def record_events(supabase, events: list[dict], remap: dict[str, str]):
    for event in events:
        payload = json.loads(json.dumps(event, default=str))
        payload["user_id"] = remap.get(payload["user_id"], payload["user_id"])
        supabase.request("POST", "/rest/v1/rpc/lead_changes_record_event", json={"p_event": payload})
