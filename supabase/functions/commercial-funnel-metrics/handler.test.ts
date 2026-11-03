import { metricsResponse, parseMetricsRequest } from "./handler.ts";
import { computeFunnelMetrics } from "../../../frontend/src/lib/commercial/funnelMetrics.js";
import { protectParticipationRequest } from "../co-debtor-consent/security.ts";

function assert(value: unknown, message = "assertion failed") { if (!value) throw new Error(message); }
const project = { id: "ca300000-0000-0000-0000-000000000003", nombre: "A", comuna: "Macul", tipo: "casa", precio_min_uf: 1000, precio_max_uf: 2000, estado: "disponible" };
const now = "2026-10-30T12:00:00Z";
const evaluation = {
  input: { complemento_renta: true, ingreso_mensual_complementario: 987654321, ahorro_disponible: 30000000, comuna_objetivo: "Macul" },
  onboarding: { tipo_propiedad: "casa" },
  result: { score: 90, classification: "Alto", blockers: [], commercial_priority_detail: { action_key: "contact_now" },
    financial_indicators: { capacidad_compra_estimada_uf: 2800, capacidad_asistida_uf: null, ingreso_total: 999999999,
      restriccion_vinculante: "renta", capacidad_status: "ok", capacidad_supuestos: {
        uf_value_clp: 40695, ratio_dividendo_max: 0.3, ratio_dividendo_saludable: 0.25, tasa_anual_uf: 0.04, plazo_anios: 30, pie_ratio: 0.2 } } },
};
const fact = { lead_id: "PRIVATE_LEAD_SENTINEL", first_evaluation_at: "2026-10-01T12:00:00Z", evaluacion_actual: evaluation,
  evaluaciones: [{ at: "2026-10-01T12:00:00Z", project_goal_id: project.id }], proyectos: [project.id], postulaciones: [], stage_events: [], plan: null, favoritos: [], progress_update_ats: [], confirmed_goal_ats: [] };
function request(body: any = {}) { return new Request("https://edge.test", { method: "POST", headers: { Authorization: "Bearer valid", Origin: "https://app.test" }, body: JSON.stringify(body) }); }
function admin(facts = [fact]) { return { auth: { getUser: async token => ({ data: { user: { id: "verified-staff" } }, error: null }) }, rpc: async (name, args) => {
  assert(name === "hu30_commercial_funnel_source" && args.p_actor === "verified-staff", "untrusted actor or RPC");
  return { data: { now, proyectos: [project], facts }, error: null }; } }; }
const controls = { filtros: { proyecto_id: null, afinidad: [], capacidad: [], prioridad: [] }, granularidad: "mes" };

Deno.test("M8 initial redaction regresses real ALG-10/18 bands, priority and best cohort", () => {
  const before = computeFunnelMetrics({ now, proyectos: [project], facts: [fact], ...controls });
  const redacted = { ...fact, evaluacion_actual: { input: {}, onboarding: {}, result: { score: 90, classification: "Alto" } } };
  const after = computeFunnelMetrics({ now, proyectos: [project], facts: [redacted], ...controls });
  assert(before.mejores.n === 1 && after.mejores.n === 0, "missing reproduction");
  assert(before.bandas.capacidad.alcanza === 1 && after.bandas.capacidad.requiere_antecedentes === 1);
  assert(before.desglose.prioridad.find(row => row.clave === "contact_now").leads === 1);
  assert(after.desglose.prioridad.find(row => row.clave === "sin_prioridad").leads === 1);
});

Deno.test("aggregate endpoint preserves every metric for visible bipersonal and individual facts across controls", async () => {
  const individual = { ...fact, lead_id: "individual", evaluacion_actual: { ...evaluation, input: { ...evaluation.input, complemento_renta: false } } };
  const facts = [fact, individual];
  for (const granularidad of ["semana", "mes", "año"]) for (const filtros of [controls.filtros,
    { ...controls.filtros, proyecto_id: project.id }, { ...controls.filtros, afinidad: ["Compatible"], capacidad: ["alcanza"], prioridad: ["contact_now"] },
    { ...controls.filtros, prioridad: ["nurture"] }]) {
    const response = await metricsResponse(request({ filtros, granularidad }), admin(facts));
    assert(response.status === 200);
    const body = await response.json();
    const expected = computeFunnelMetrics({ now, proyectos: [project], facts, filtros, granularidad });
    assert(JSON.stringify(body.metrics) === JSON.stringify(expected), "metric parity lost");
    const serialized = JSON.stringify(body);
    assert(!/987654321|999999999|PRIVATE_LEAD_SENTINEL|ingreso_mensual_complementario|evaluacion_actual|financial_indicators/.test(serialized), "raw payload leaked");
    assert(!("facts" in body) && body.total_leads === 2 && body.privacy_hidden === 0);
  }
});

Deno.test("cutoff/unverifiable snapshots stay absent but operational facts remain counted", async () => {
  const hidden = { ...fact, evaluacion_actual: { input: {}, onboarding: {}, result: {}, co_debtor_visibility: "hidden" } };
  const response = await metricsResponse(request(), admin([hidden]));
  const body = await response.json();
  assert(body.total_leads === 1 && body.metrics.n === 1 && body.privacy_hidden === 1);
  assert(body.metrics.bandas.capacidad.requiere_antecedentes === 1 && body.metrics.mejores.n === 0);
  assert(!JSON.stringify(body).includes("987654321"));
});

Deno.test("anonymous, expired, foreign scope, and actor/time overrides are rejected", async () => {
  let calls = 0;
  const client = admin(); const rpc = client.rpc; client.rpc = async (...args) => { calls++; return rpc(...args); };
  assert((await metricsResponse(new Request("https://edge.test", { method: "POST" }), client)).status === 401 && calls === 0);
  const expired = admin(); expired.auth.getUser = async () => ({ data: { user: null }, error: { message: "expired" } });
  assert((await metricsResponse(request(), expired)).status === 401);
  for (const body of [{ p_actor: "foreign" }, { now: "2026-01-01" }, { granularidad: "day" }, { filtros: { capacidad: ["invented"] } }]) {
    assert((await metricsResponse(request(body), client)).status === 422);
  }
  assert(calls === 0, "invalid controls reached data source");
  assert((await metricsResponse(request({ filtros: { proyecto_id: "ca300000-0000-0000-0000-000000000099" } }), client)).status === 403);
  const denied = admin(); denied.rpc = async () => ({ data: null, error: { code: "42501", message: "forbidden" } });
  assert((await metricsResponse(request(), denied)).status === 403);
});

Deno.test("HTTP aggregation responses and failures are private; errors expose no provider payload", async () => {
  for (const bad of [false, true]) {
    const client = admin(); if (bad) client.rpc = async () => { throw new Error("987654321 PRIVATE_LEAD_SENTINEL"); };
    const response = await protectParticipationRequest(request(), req => metricsResponse(req, client), "https://app.test");
    assert(response.status === (bad ? 503 : 200));
    assert(response.headers.get("Cache-Control") === "private, no-store");
    assert(response.headers.get("Vary") === "Origin");
    if (bad) assert(!/987654321|PRIVATE_LEAD/.test(await response.text()));
  }
});
