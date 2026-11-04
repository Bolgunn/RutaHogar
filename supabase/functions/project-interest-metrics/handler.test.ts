import { interestResponse } from "./handler.ts";
import { protectParticipationRequest } from "../co-debtor-consent/security.ts";

function assert(value: unknown, message = "assertion failed") { if (!value) throw new Error(message); }
const p1 = { id: "b2600000-0000-0000-0000-000000000001", nombre: "P1", comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: 3000, precio_max_uf: 4000, estado: "disponible" };
const now = "2026-11-03T12:00:00Z";
const evaluation = {
  input: { ingreso_mensual: 987654321, ahorro_disponible: 30000000, comuna_objetivo: "Ñuñoa", morosidad_actual: "si" },
  onboarding: { comuna_interes: "Ñuñoa" },
  result: { score: 20, classification: "Bajo", blockers: [{ code: "morosidad_vigente", severity: "critical" }] },
};
const leads = [
  { lead_id: "PRIVATE_LEAD_SENTINEL", evaluacion_actual: evaluation,
    interacciones: [{ proyecto_id: p1.id, en_alcance: true, visualizaciones: 2, favorito: true, simulaciones: 1 }] },
  { lead_id: "2", evaluacion_actual: null,
    interacciones: [{ proyecto_id: p1.id, en_alcance: false, visualizaciones: 1, favorito: false, simulaciones: 0 }] },
];
function request(body: any = {}) {
  return new Request("https://edge.test", { method: "POST", headers: { Authorization: "Bearer valid", Origin: "https://app.test" }, body: JSON.stringify(body) });
}
function admin(data: any = { now, proyectos: [p1], leads }) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "verified-admin" } }, error: null }) },
    rpc: async (name: string, args: any) => {
      assert(name === "hu26_project_interest_source" && args.p_actor === "verified-admin", "untrusted actor or RPC");
      return { data, error: null };
    },
  };
}

Deno.test("returns ALG-20 aggregates only: no lead id, snapshot or financial value", async () => {
  const response = await interestResponse(request(), admin());
  assert(response.status === 200);
  const body = await response.json();
  assert(body.now === now && body.proyectos.length === 1);
  const row = body.metrics.ranking[0];
  assert(body.metrics.n_leads === 2 && row.interesados === 2 && row.visualizaciones === 3);
  const c = row.compatibilidad;
  assert(c.sin_datos >= 1 && c.compatibles + c.incompatibles + c.sin_datos === 2, "out-of-scope pair is sin_datos");
  assert(!("leads" in body));
  assert(!/987654321|PRIVATE_LEAD_SENTINEL|morosidad_actual|onboarding/.test(JSON.stringify(body)));
});

Deno.test("anonymous, expired, controls in the body and forbidden actors are rejected", async () => {
  let calls = 0;
  const client: any = admin(); const rpc = client.rpc; client.rpc = async (...args: any[]) => { calls++; return rpc(...args); };
  assert((await interestResponse(new Request("https://edge.test", { method: "POST" }), client)).status === 401);
  const expired: any = admin(); expired.auth.getUser = async () => ({ data: { user: null }, error: { message: "expired" } });
  assert((await interestResponse(request(), expired)).status === 401);
  for (const body of [{ p_actor: "foreign" }, { inmobiliaria_id: "x" }, []]) {
    assert((await interestResponse(request(body), client)).status === 422);
  }
  assert(calls === 0, "invalid requests reached the data source");
  const denied: any = admin(); denied.rpc = async () => ({ data: null, error: { code: "42501", message: "forbidden" } });
  assert((await interestResponse(request(), denied)).status === 403);
});

Deno.test("HTTP responses are private and failures expose no provider payload", async () => {
  for (const bad of [false, true]) {
    const client: any = admin(); if (bad) client.rpc = async () => { throw new Error("987654321 PRIVATE_LEAD_SENTINEL"); };
    const response = await protectParticipationRequest(request(), req => interestResponse(req, client), "https://app.test");
    assert(response.status === (bad ? 503 : 200));
    assert(response.headers.get("Cache-Control") === "private, no-store");
    if (bad) assert(!/987654321|PRIVATE_LEAD/.test(await response.text()));
  }
});
