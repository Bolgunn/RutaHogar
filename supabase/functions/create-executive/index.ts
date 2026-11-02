import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Alta de ejecutivos comerciales por parte del admin de una inmobiliaria: invita,
// vincula a un ejecutivo sin inmobiliaria y reenvía la invitación.
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
  reenviar?: boolean | null;
  miembro_id?: string | null;
};

const DEFAULT_APP_URL = "https://www.rutahogar.cl";
const ADMIN_ROLES = ["admin", "admin_inmobiliario"];

function appUrl() {
  return (Deno.env.get("APP_URL") || DEFAULT_APP_URL).replace(/\/$/, "");
}

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

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) + "aA1!";
}

type EmailContent = {
  titulo: string;
  textoHtml: string;
  boton: string;
  link: string;
  nota: string;
};

function buildEmail({ titulo, textoHtml, boton, link, nota }: EmailContent) {
  const safeLink = escapeHtml(link);
  const logoUrl = escapeHtml(`${appUrl()}/brand/rutahogar/logo-rutahogar.png`);

  return `
    <div style="margin:0;padding:0;background-color:#eef3f8;color:#132b4a;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#eef3f8;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d7e0ea;border-radius:12px;">
              <tr>
                <td style="padding:24px 32px;background-color:#ffffff;border-bottom:3px solid #132b4a;border-radius:12px 12px 0 0;">
                  <img src="${logoUrl}" alt="RutaHogar" width="170" style="display:block;width:100%;max-width:170px;height:auto;border:0;margin:0;">
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h1 style="margin:0 0 8px;font-size:26px;line-height:34px;color:#132b4a;">${escapeHtml(titulo)}</h1>
                  <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#526174;">${textoHtml}</p>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background-color:#132b4a;border-radius:8px;">
                        <a href="${safeLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(boton)}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#64748b;">${escapeHtml(nota)}</p>
                  <p style="margin:0;font-size:12px;line-height:18px;color:#132b4a;word-break:break-all;">${safeLink}</p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:22px 32px;background-color:#f8fafc;border-top:1px solid #d7e0ea;border-radius:0 0 12px 12px;">
                  <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;">Este correo fue generado automáticamente por RutaHogar.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildInviteEmail(fullName: string, inmobiliariaNombre: string, actionLink: string) {
  return buildEmail({
    titulo: "Tu cuenta de ejecutivo está lista",
    textoHtml: `Hola ${escapeHtml(fullName || "ejecutivo/a")}: ${escapeHtml(inmobiliariaNombre || "tu inmobiliaria")} creó tu cuenta de ejecutivo comercial en RutaHogar.
                    Define tu contraseña con el siguiente enlace para entrar por primera vez.`,
    boton: "Definir mi contraseña",
    link: actionLink,
    nota: "Si el botón no funciona, copia y pega este enlace en tu navegador. Si ya venció, pide a tu administrador que te reenvíe la invitación.",
  });
}

function buildLinkedEmail(fullName: string, inmobiliariaNombre: string) {
  return buildEmail({
    titulo: "Te sumaron a un equipo en RutaHogar",
    textoHtml: `Hola ${escapeHtml(fullName || "ejecutivo/a")}: ${escapeHtml(inmobiliariaNombre || "una inmobiliaria")} te sumó a su equipo como ejecutivo comercial.
                    Entra con tu cuenta de siempre para ver tus proyectos.`,
    boton: "Entrar a RutaHogar",
    link: appUrl(),
    nota: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  });
}

async function sendEmail(email: string, subject: string, html: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("EJECUTIVO_FROM_EMAIL") || "RutaHogar <onboarding@resend.dev>";

  if (!resendApiKey) {
    console.warn("Falta RESEND_API_KEY: no se envió el correo.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
    });

    if (!response.ok) {
      console.error("Resend rechazó el envío:", await response.text());
      return false;
    }
  } catch (error) {
    console.error("No se pudo contactar a Resend:", error);
    return false;
  }

  return true;
}

// Enlace de un solo uso para que la persona defina su propia contraseña. Un fallo aquí
// no deshace la cuenta: se registra y el administrador la reenvía desde Equipo.
async function deliverInvite(adminClient: SupabaseClient, email: string, fullName: string, inmobiliariaNombre: string) {
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl()}/definir-password` },
  });

  if (linkError) {
    console.error("No se pudo generar el enlace de acceso:", linkError);
    return false;
  }

  const actionLink = linkData?.properties?.action_link || "";
  if (!actionLink) return false;

  return await sendEmail(
    email,
    "Tu cuenta de ejecutivo en RutaHogar",
    buildInviteEmail(fullName, inmobiliariaNombre, actionLink),
  );
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
      .select("id, role, inmobiliaria_id, estado_acceso")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error leyendo el perfil del solicitante:", profileError);
      return jsonResponse({ error: "No se pudo validar el administrador." }, 500);
    }

    if (!ADMIN_ROLES.includes(callerProfile?.role) || callerProfile?.estado_acceso !== "activo") {
      return jsonResponse({ error: "Solo un administrador puede crear ejecutivos." }, 403);
    }
    if (callerProfile.role === "admin_inmobiliario" && !callerProfile.inmobiliaria_id) {
      return jsonResponse({ error: "Tu cuenta no tiene una inmobiliaria asignada." }, 403);
    }

    const payload: CreateExecutivePayload = await req.json();

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

    const logEvent = async (subject: string, eventType: string, details: Record<string, unknown>) => {
      const { error } = await adminClient.rpc("hu28_log_event", {
        p_inmobiliaria: inmobiliaria.id,
        p_actor: callerProfile.id,
        p_actor_role: callerProfile.role,
        p_subject: subject,
        p_event_type: eventType,
        p_details: details,
      });
      if (error) console.error("No se pudo registrar el evento:", eventType, error);
    };

    // --- Reenvío: sólo alguien de este equipo que aún no entra ---
    if (payload.reenviar) {
      const memberId = cleanText(payload.miembro_id, 64);
      const { data: member, error: memberError } = await adminClient
        .from("profiles")
        .select("id, full_name, role, inmobiliaria_id, estado_acceso")
        .eq("id", memberId)
        .eq("inmobiliaria_id", inmobiliaria.id)
        .maybeSingle();

      if (memberError) {
        console.error("Error leyendo a la persona:", memberError);
        return jsonResponse({ error: "No se pudo verificar a esta persona." }, 500);
      }
      if (!member || (member.role !== "ejecutivo" && !ADMIN_ROLES.includes(member.role))) {
        return jsonResponse({ error: "Esta persona no es parte de tu equipo." }, 404);
      }
      if (member.estado_acceso !== "activo") {
        return jsonResponse({ error: "Esta persona está desactivada. Reactívala antes de reenviar la invitación." }, 409);
      }

      const { data: account, error: accountError } = await adminClient.auth.admin.getUserById(member.id);
      if (accountError || !account?.user?.email) {
        console.error("Error leyendo la cuenta:", accountError);
        return jsonResponse({ error: "No se pudo verificar a esta persona." }, 500);
      }
      if (account.user.last_sign_in_at) {
        return jsonResponse({ error: "Esta persona ya entró a RutaHogar: no necesita otra invitación." }, 409);
      }

      const sent = await deliverInvite(adminClient, account.user.email, member.full_name || "", inmobiliaria.nombre);
      await logEvent(member.id, sent ? "equipo.invitacion_reenviada" : "equipo.invitacion_fallida", { reenvio: true });

      return jsonResponse({
        ok: true,
        created: false,
        ejecutivo: { id: member.id, email: account.user.email, full_name: member.full_name },
        email_enviado: sent,
      });
    }

    const email = cleanText(payload.email).toLowerCase();
    const fullName = cleanText(payload.full_name, 160);
    const phone = cleanText(payload.phone, 20) || null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Correo inválido." }, 400);
    }
    if (!fullName) {
      return jsonResponse({ error: "Ingresa el nombre del ejecutivo." }, 400);
    }

    const { data: existingId, error: lookupError } = await adminClient.rpc("find_user_id_by_email", {
      p_email: email,
    });

    if (lookupError) {
      console.error("Error buscando la cuenta:", lookupError);
      return jsonResponse({ error: "No se pudo verificar el correo." }, 500);
    }

    // --- Cuenta ya existente: sólo se vincula a un ejecutivo sin inmobiliaria ---
    if (existingId) {
      const { data: existingProfile, error: existingProfileError } = await adminClient
        .from("profiles")
        .select("id, role, inmobiliaria_id, full_name")
        .eq("id", existingId)
        .maybeSingle();

      if (existingProfileError) {
        console.error("Error leyendo la cuenta existente:", existingProfileError);
        return jsonResponse({ error: "No se pudo verificar la cuenta existente." }, 500);
      }

      // La cuenta de un lead guarda sus finanzas: un correo mal escrito no la convierte en staff.
      if (existingProfile?.role !== "ejecutivo" && !ADMIN_ROLES.includes(existingProfile?.role)) {
        return jsonResponse({ error: "Este correo pertenece a una cuenta de comprador en RutaHogar. Usa otro correo, como el laboral." }, 409);
      }

      if (existingProfile.inmobiliaria_id === targetInmobiliaria) {
        return jsonResponse({ error: "Esta persona ya es parte de tu equipo." }, 409);
      }

      // service_role salta el guard de profiles: este es el único freno para no
      // degradar a un administrador, global o de otra inmobiliaria.
      if (ADMIN_ROLES.includes(existingProfile.role)) {
        return jsonResponse({ error: "Esta cuenta es de un administrador: no se puede vincular como ejecutivo." }, 409);
      }

      if (existingProfile.inmobiliaria_id) {
        return jsonResponse({ error: "Este correo pertenece a una persona de otra inmobiliaria." }, 409);
      }

      const { error: linkProfileError } = await adminClient
        .from("profiles")
        .update({ inmobiliaria_id: targetInmobiliaria, updated_at: new Date().toISOString() })
        .eq("id", existingId);

      if (linkProfileError) {
        console.error("Error vinculando la cuenta:", linkProfileError);
        return jsonResponse({ error: "No se pudo vincular la cuenta existente." }, 500);
      }

      const nombre = existingProfile.full_name || fullName;
      const sent = await sendEmail(
        email,
        "Te sumaron a un equipo en RutaHogar",
        buildLinkedEmail(nombre, inmobiliaria.nombre),
      );
      await logEvent(existingId, "equipo.miembro_vinculado", { email_enviado: sent });

      return jsonResponse({
        ok: true,
        created: false,
        vinculado: true,
        ejecutivo: { id: existingId, email, full_name: nombre },
        email_enviado: sent,
        mensaje: "La cuenta ya existía: se vinculó como ejecutivo de esta inmobiliaria.",
      });
    }

    // --- Cuenta nueva ---
    // La contraseña inicial no se expone ni puede derivarse de datos públicos.
    // El ejecutivo la define mediante el enlace de recuperación de un solo uso.
    const password = randomPassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "ejecutivo", phone },
    });

    if (createError || !created?.user) {
      console.error("Error creando la cuenta:", createError);
      return jsonResponse({ error: "No se pudo crear la cuenta." }, 500);
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

    const emailSent = await deliverInvite(adminClient, email, fullName, inmobiliaria.nombre);
    await logEvent(
      created.user.id,
      emailSent ? "equipo.invitacion_enviada" : "equipo.invitacion_fallida",
      { rol: "ejecutivo" },
    );

    return jsonResponse({
      ok: true,
      created: true,
      ejecutivo: { id: created.user.id, email, full_name: fullName },
      email_enviado: emailSent,
    });
  } catch (error) {
    console.error("create-executive falló:", error);
    return jsonResponse({ error: "Error inesperado." }, 500);
  }
});
