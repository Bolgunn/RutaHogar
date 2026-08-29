import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Alta de ejecutivos comerciales por parte del admin de una inmobiliaria.
// Vive en una Edge Function porque crear cuentas exige la service_role key,
// que nunca puede viajar al frontend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreateExecutivePayload = {
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  inmobiliaria_id?: string | null;
};

function cleanText(value: unknown, maxLength = 254) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// MODO DE PRUEBA: contraseña = texto antes del @ del correo.
// "testejecutivocomercial@email.com" -> "testejecutivocomercial"
// Supabase exige 6 caracteres mínimo, así que se rellena de forma
// determinista para que siga siendo predecible.
export function testPasswordFromEmail(email: string) {
  const local = String(email || "").split("@")[0] || "";
  return local.length >= 6 ? local : local.padEnd(6, "0");
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) + "aA1!";
}

function isTestPasswordMode() {
  return Deno.env.get("EJECUTIVO_TEST_PASSWORD_MODE") === "true";
}

function buildInviteEmail(fullName: string, inmobiliariaNombre: string, actionLink: string) {
  const safe = {
    nombre: escapeHtml(fullName || "ejecutivo/a"),
    inmobiliaria: escapeHtml(inmobiliariaNombre || "tu inmobiliaria"),
    link: escapeHtml(actionLink),
  };

  return `
    <div style="margin:0;padding:0;background-color:#eef3f8;color:#172033;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#eef3f8;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d7e0ea;border-radius:12px;">
              <tr>
                <td style="padding:28px 32px;background-color:#246354;border-radius:12px 12px 0 0;">
                  <img src="https://score-leads-one.vercel.app/Logo%20ScoreLeads.png" alt="ScoreLeads" width="160" style="display:block;width:100%;max-width:160px;height:auto;border:0;margin:0 0 16px;">
                  <div style="font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.4px;color:#ffffff;">ScoreLeads</div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h1 style="margin:0 0 8px;font-size:26px;line-height:34px;color:#172033;">Tu cuenta de ejecutivo está lista</h1>
                  <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#526174;">
                    Hola ${safe.nombre}: ${safe.inmobiliaria} creó tu cuenta de ejecutivo comercial en ScoreLeads.
                    Define tu contraseña con el siguiente enlace para entrar por primera vez.
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background-color:#246354;border-radius:8px;">
                        <a href="${safe.link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Definir mi contraseña</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#64748b;">
                    Si el botón no funciona, copia y pega este enlace en tu navegador:
                  </p>
                  <p style="margin:0;font-size:12px;line-height:18px;color:#246354;word-break:break-all;">${safe.link}</p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:22px 32px;background-color:#f8fafc;border-top:1px solid #d7e0ea;border-radius:0 0 12px 12px;">
                  <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;">Este correo fue generado automáticamente por ScoreLeads.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendInviteEmail(email: string, fullName: string, inmobiliariaNombre: string, actionLink: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("EJECUTIVO_FROM_EMAIL") || "ScoreLeads <onboarding@resend.dev>";

  if (!resendApiKey) {
    console.warn("Falta RESEND_API_KEY: la cuenta se creó pero no se envió el correo.");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Tu cuenta de ejecutivo en ScoreLeads",
      html: buildInviteEmail(fullName, inmobiliariaNombre, actionLink),
    }),
  });

  if (!response.ok) {
    console.error("Resend rechazó el envío:", await response.text());
    return false;
  }

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Faltan variables de entorno de Supabase." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ error: "Falta la sesión del administrador." }, 401);
    }

    // Cliente con el JWT de quien llama: sirve para saber QUIÉN es.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Cliente service_role: crea cuentas y salta RLS. Nunca sale de aquí.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
      return jsonResponse({ error: "Sesión inválida o expirada." }, 401);
    }

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, inmobiliaria_id")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error leyendo el perfil del solicitante:", profileError);
      return jsonResponse({ error: "No se pudo validar el administrador." }, 500);
    }

    if (callerProfile?.role !== "admin") {
      return jsonResponse({ error: "Solo un administrador puede crear ejecutivos." }, 403);
    }

    const payload: CreateExecutivePayload = await req.json();
    const email = cleanText(payload.email).toLowerCase();
    const fullName = cleanText(payload.full_name, 160);
    const phone = cleanText(payload.phone, 20) || null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Correo inválido." }, 400);
    }
    if (!fullName) {
      return jsonResponse({ error: "Ingresa el nombre del ejecutivo." }, 400);
    }

    // Un admin acotado solo puede crear en SU inmobiliaria: el valor del body
    // se ignora. El admin global debe declarar explícitamente cuál.
    const targetInmobiliaria = callerProfile.inmobiliaria_id
      ? callerProfile.inmobiliaria_id
      : cleanText(payload.inmobiliaria_id, 64);

    if (!targetInmobiliaria) {
      return jsonResponse({ error: "Selecciona la inmobiliaria del ejecutivo." }, 400);
    }

    const { data: inmobiliaria, error: inmobiliariaError } = await adminClient
      .from("inmobiliarias")
      .select("id, nombre")
      .eq("id", targetInmobiliaria)
      .maybeSingle();

    if (inmobiliariaError || !inmobiliaria) {
      return jsonResponse({ error: "Inmobiliaria no encontrada." }, 404);
    }

    const { data: existingId, error: lookupError } = await adminClient.rpc("find_user_id_by_email", {
      p_email: email,
    });

    if (lookupError) {
      console.error("Error buscando la cuenta:", lookupError);
      return jsonResponse({ error: "No se pudo verificar el correo." }, 500);
    }

    // --- Cuenta ya existente: se promueve y se vincula, no se recrea ---
    if (existingId) {
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id, role, inmobiliaria_id, full_name")
        .eq("id", existingId)
        .maybeSingle();

      if (
        existingProfile?.inmobiliaria_id &&
        existingProfile.inmobiliaria_id !== targetInmobiliaria
      ) {
        return jsonResponse({ error: "Este ejecutivo ya pertenece a otra inmobiliaria." }, 409);
      }

      const { error: promoteError } = await adminClient
        .from("profiles")
        .upsert({
          id: existingId,
          full_name: existingProfile?.full_name || fullName,
          role: "ejecutivo",
          inmobiliaria_id: targetInmobiliaria,
          updated_at: new Date().toISOString(),
        });

      if (promoteError) {
        console.error("Error promoviendo la cuenta:", promoteError);
        return jsonResponse({ error: "No se pudo vincular la cuenta existente." }, 500);
      }

      return jsonResponse({
        ok: true,
        created: false,
        ejecutivo: { id: existingId, email, full_name: existingProfile?.full_name || fullName },
        email_enviado: false,
        mensaje: "La cuenta ya existía: se vinculó como ejecutivo de esta inmobiliaria.",
      });
    }

    // --- Cuenta nueva ---
    const testMode = isTestPasswordMode();
    const password = testMode ? testPasswordFromEmail(email) : randomPassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "ejecutivo", phone },
    });

    if (createError || !created?.user) {
      console.error("Error creando la cuenta:", createError);
      return jsonResponse({ error: createError?.message || "No se pudo crear la cuenta." }, 500);
    }

    const { error: insertProfileError } = await adminClient.from("profiles").upsert({
      id: created.user.id,
      full_name: fullName,
      role: "ejecutivo",
      inmobiliaria_id: targetInmobiliaria,
      phone,
      updated_at: new Date().toISOString(),
    });

    if (insertProfileError) {
      // La cuenta quedaría huérfana sin perfil: se revierte para no dejar basura.
      console.error("Error creando el perfil, revirtiendo cuenta:", insertProfileError);
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: "No se pudo crear el perfil del ejecutivo." }, 500);
    }

    // Enlace para que el ejecutivo defina su propia contraseña.
    const appUrl = Deno.env.get("APP_URL") || "https://score-leads-one.vercel.app";
    let emailSent = false;
    let actionLink = "";

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appUrl}/definir-password` },
    });

    if (linkError) {
      console.error("No se pudo generar el enlace de acceso:", linkError);
    } else {
      actionLink = linkData?.properties?.action_link || "";
      if (actionLink) {
        emailSent = await sendInviteEmail(email, fullName, inmobiliaria.nombre, actionLink);
      }
    }

    return jsonResponse({
      ok: true,
      created: true,
      ejecutivo: { id: created.user.id, email, full_name: fullName },
      email_enviado: emailSent,
      // Solo en modo de prueba: permite entrar sin depender del correo.
      password_temporal: testMode ? password : undefined,
    });
  } catch (error) {
    console.error("create-executive falló:", error);
    return jsonResponse({ error: (error as Error).message || "Error inesperado." }, 500);
  }
});
