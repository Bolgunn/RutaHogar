// Origin checks are transport protection, never a substitute for Auth/RPC scope.
export async function protectParticipationRequest(
  req: Request, handler: (req: Request) => Promise<Response>,
  publicUrl: string, extraOrigins = "",
): Promise<Response> {
  const headers = new Headers({
    "Cache-Control": "private, no-store", "Pragma": "no-cache", "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hu18-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  let allowed: Set<string>;
  try {
    const base = new URL(publicUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error();
    allowed = new Set([base.origin]);
    for (const value of extraOrigins.split(",").map(value => value.trim()).filter(Boolean)) {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value) throw new Error();
      allowed.add(parsed.origin);
    }
  } catch {
    return new Response(JSON.stringify({ error: "El acceso no está disponible temporalmente." }), {
      status: 503, headers: new Headers([...headers, ["Content-Type", "application/json"]]),
    });
  }
  const origin = req.headers.get("Origin");
  if (origin && !allowed.has(origin)) return new Response(JSON.stringify({ error: "Origen no permitido." }), {
    status: 403, headers: new Headers([...headers, ["Content-Type", "application/json"]]),
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const response = await handler(req);
  const merged = new Headers(response.headers);
  merged.delete("Access-Control-Allow-Origin");
  for (const [key, value] of headers) merged.set(key, value);
  return new Response(response.body, { status: response.status, headers: merged });
}
