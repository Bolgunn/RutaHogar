import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tipoLabels: Record<string, string> = {
  acceso: "Acceso",
  rectificacion: "Rectificación",
  cancelacion: "Cancelación",
  oposicion: "Oposición",
  otro: "Otra solicitud",
};

type NotificationPayload = {
  request_id?: unknown;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeMultilineHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Faltan variables de entorno de Supabase para notify-admin-arco.");
    return jsonResponse({ success: false, error: "Servicio no configurado." }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Sesión requerida." }, 401);
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();

  if (callerError || !callerData?.user) {
    return jsonResponse({ success: false, error: "Sesión inválida o expirada." }, 401);
  }

  let payload: NotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Solicitud inválida." }, 400);
  }

  const requestId = typeof payload?.request_id === "string" ? payload.request_id.trim() : "";
  if (!isUuid(requestId)) {
    return jsonResponse({ success: false, error: "Identificador de solicitud inválido." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: arcoRequest, error: requestError } = await adminClient
    .from("arco_requests")
    .select("id, tipo, email, descripcion")
    .eq("id", requestId)
    .eq("user_id", callerData.user.id)
    .maybeSingle();

  if (requestError) {
    console.error("Error leyendo la solicitud ARCO:", requestError);
    return jsonResponse({ success: false, error: "No se pudo procesar la solicitud." }, 500);
  }

  if (!arcoRequest) {
    // No revelamos si el ID existe para otro usuario autenticado.
    return jsonResponse({ success: false, error: "Solicitud no encontrada." }, 404);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const notificationEmail = Deno.env.get("ARCO_NOTIFICATION_EMAIL");
  if (!resendApiKey || !notificationEmail) {
    console.error("Faltan secrets de correo para notify-admin-arco.");
    return jsonResponse({ success: false, error: "Servicio de notificaciones no configurado." }, 500);
  }

  const requesterName = String(callerData.user.user_metadata?.full_name || callerData.user.email || "Usuario autenticado");
  const subjectName = requesterName.replace(/[\r\n]+/g, " ").slice(0, 160);
  const tipoLabel = tipoLabels[arcoRequest.tipo] || "Otra solicitud";
  const safe = {
    requesterName: escapeHtml(requesterName),
    email: escapeHtml(arcoRequest.email),
    tipo: escapeHtml(tipoLabel),
    descripcion: escapeMultilineHtml(arcoRequest.descripcion),
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("ARCO_FROM_EMAIL") || "RutaHogar <onboarding@resend.dev>",
        to: [notificationEmail],
        subject: `Nueva solicitud ARCO de ${subjectName}`,
        html: `
          <h2>Nueva solicitud ARCO recibida</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr><td style="padding:8px;font-weight:bold;">Solicitante</td><td style="padding:8px;">${safe.requesterName}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${safe.email}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Tipo</td><td style="padding:8px;">${safe.tipo}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Descripción</td><td style="padding:8px;">${safe.descripcion}</td></tr>
          </table>
          <p>Puedes revisar y gestionar esta solicitud en el panel de administración de RutaHogar.</p>
        `,
      }),
    });

    if (!response.ok) {
      console.error("Resend rechazó la notificación ARCO:", await response.text());
      return jsonResponse({ success: false, error: "No se pudo enviar la notificación." }, 502);
    }
  } catch (error) {
    console.error("Error enviando la notificación ARCO:", error);
    return jsonResponse({ success: false, error: "No se pudo enviar la notificación." }, 502);
  }

  return jsonResponse({ success: true });
});
