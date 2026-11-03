import { computeFunnelMetrics, FUNNEL_FILTER_OPTIONS } from "../../../frontend/src/lib/commercial/funnelMetrics.js";

const forbidden = "Tu cuenta no tiene una inmobiliaria asignada para ver métricas comerciales.";
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Only controls are accepted; the clock, actor, tenant, projects and facts come from SQL.
export function parseMetricsRequest(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["filtros", "granularidad"].includes(key))) throw new Error("invalid_request");
  const filtros = body.filtros ?? {};
  if (!filtros || typeof filtros !== "object" || Array.isArray(filtros)
    || Object.keys(filtros).some(key => !["proyecto_id", ...Object.keys(FUNNEL_FILTER_OPTIONS)].includes(key))) throw new Error("invalid_request");
  const proyecto_id = filtros.proyecto_id ?? null;
  if (proyecto_id !== null && (typeof proyecto_id !== "string" || !/^[0-9a-f-]{36}$/i.test(proyecto_id))) throw new Error("invalid_request");
  const parsed: any = { proyecto_id };
  for (const [key, allowed] of Object.entries(FUNNEL_FILTER_OPTIONS)) {
    const values = filtros[key] ?? [];
    if (!Array.isArray(values) || values.length > allowed.length || values.some(value => !allowed.includes(value))) throw new Error("invalid_request");
    parsed[key] = [...new Set(values)];
  }
  const granularidad = body.granularidad ?? "mes";
  if (!["semana", "mes", "año"].includes(granularidad)) throw new Error("invalid_request");
  return { filtros: parsed, granularidad };
}

export async function metricsResponse(req: Request, admin: any) {
  if (req.method !== "POST") return response({ code: "method_not_allowed" }, 405);
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return response({ code: "unauthenticated" }, 401);
  try {
    const actor = await admin.auth.getUser(bearer);
    if (actor.error || !actor.data?.user?.id) return response({ code: "unauthenticated" }, 401);
    let controls;
    try { controls = parseMetricsRequest(await req.json()); }
    catch { return response({ code: "invalid_request" }, 422); }
    const source = await admin.rpc("hu30_commercial_funnel_source", { p_actor: actor.data.user.id });
    if (source.error) {
      if (source.error.code === "42501" || source.error.message === "forbidden") return response({ code: "forbidden", error: forbidden }, 403);
      return response({ code: "metrics_unavailable" }, 503);
    }
    const { facts, proyectos, now } = source.data;
    if (controls.filtros.proyecto_id && !proyectos.some(project => project.id === controls.filtros.proyecto_id)) {
      return response({ code: "forbidden", error: forbidden }, 403);
    }
    const privacy_hidden = facts.filter(fact => (!controls.filtros.proyecto_id || fact.proyectos.includes(controls.filtros.proyecto_id))
      && fact.evaluacion_actual?.co_debtor_visibility === "hidden").length;
    // Reuse exact ALG-10/ALG-18, not a port or new financial thresholds.
    const metrics = computeFunnelMetrics({ facts, proyectos, now, ...controls });
    return response({ now, proyectos, total_leads: facts.length, privacy_hidden, refresh_at: source.data.refresh_at ?? null, metrics });
  } catch {
    // No provider errors, snapshots, tokens, request bodies or identities in logs/errors.
    return response({ code: "metrics_unavailable" }, 503);
  }
}
