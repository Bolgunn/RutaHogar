import { computeProjectInterestMetrics } from "../../../frontend/src/lib/commercial/projectInterestMetrics.js";

// HU 26 — interés por proyecto. Igual que commercial-funnel-metrics (HU 15): la fuente con datos
// financieros se lee aquí con service_role y el navegador recibe solo los conteos de ALG-20.
const forbidden = "Solo el administrador de una inmobiliaria puede ver el interés por proyecto.";
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function interestResponse(req: Request, admin: any) {
  if (req.method !== "POST") return response({ code: "method_not_allowed" }, 405);
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return response({ code: "unauthenticated" }, 401);
  try {
    const actor = await admin.auth.getUser(bearer);
    if (actor.error || !actor.data?.user?.id) return response({ code: "unauthenticated" }, 401);
    // Sin controles: el actor, el tenant, el reloj y los proyectos salen de SQL.
    let body;
    try { body = await req.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
      return response({ code: "invalid_request" }, 422);
    }
    const source = await admin.rpc("hu26_project_interest_source", { p_actor: actor.data.user.id });
    if (source.error) {
      if (source.error.code === "42501" || source.error.message === "forbidden") return response({ code: "forbidden", error: forbidden }, 403);
      return response({ code: "metrics_unavailable" }, 503);
    }
    const { now, proyectos, leads } = source.data;
    return response({ now, proyectos, metrics: computeProjectInterestMetrics({ proyectos, leads }) });
  } catch {
    // Sin errores del proveedor, fuentes, tokens ni identidades en la respuesta.
    return response({ code: "metrics_unavailable" }, 503);
  }
}
