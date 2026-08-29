import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const testerTypes = new Set(["Usuario", "Ejecutivo", "Banco", "Inmobiliaria", "Otro"]);

type FeedbackPayload = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tester_type?: string | null;
  first_impression?: string | null;
  confusing_part?: string | null;
  improvement_suggestion?: string | null;
  clarity_rating?: number | string | null;
};

function cleanText(value: unknown, maxLength = 4000) {
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

function normalizePhone(value: unknown) {
  const raw = cleanText(value, 20);
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("569") ? digits.slice(3) : digits.startsWith("9") ? digits.slice(1) : digits;

  if (/^\d{8}$/.test(local)) return `+569${local}`;
  throw new Error("Teléfono inválido. Usa un número chileno +56 9 con 8 dígitos.");
}

function normalizePayload(payload: FeedbackPayload) {
  const name = cleanText(payload.name, 160) || null;
  const email = cleanText(payload.email, 254) || null;
  const phone = normalizePhone(payload.phone);
  const tester_type = cleanText(payload.tester_type, 40) || "Otro";
  const first_impression = cleanText(payload.first_impression) || null;
  const confusing_part = cleanText(payload.confusing_part) || null;
  const improvement_suggestion = cleanText(payload.improvement_suggestion) || null;
  const clarity_rating = Number(payload.clarity_rating);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Correo inválido.");
  }

  if (!testerTypes.has(tester_type)) {
    throw new Error("Perfil de tester inválido.");
  }

  if (!Number.isInteger(clarity_rating) || clarity_rating < 1 || clarity_rating > 5) {
    throw new Error("La nota de claridad debe estar entre 1 y 5.");
  }

  if (!first_impression && !confusing_part && !improvement_suggestion) {
    throw new Error("Debes enviar al menos un comentario.");
  }

  return {
    name,
    email,
    phone,
    tester_type,
    first_impression,
    confusing_part,
    improvement_suggestion,
    clarity_rating,
  };
}

async function insertFeedback(feedback: ReturnType<typeof normalizePayload>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }

  const row = {
    name: feedback.name,
    email: feedback.email,
    tester_type: feedback.tester_type,
    first_impression: feedback.first_impression,
    confusing_part: feedback.confusing_part,
    improvement_suggestion: feedback.improvement_suggestion,
    clarity_rating: feedback.clarity_rating,
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Error al insertar feedback:", details);
    throw new Error("No se pudo guardar el feedback.");
  }
}

async function sendFeedbackEmail(feedback: ReturnType<typeof normalizePayload>, createdAt: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const toEmail = Deno.env.get("FEEDBACK_TO_EMAIL");
  const fromEmail = Deno.env.get("FEEDBACK_FROM_EMAIL") || "RutaHogar <onboarding@resend.dev>";

  if (!resendApiKey || !toEmail) {
    throw new Error("Faltan RESEND_API_KEY o FEEDBACK_TO_EMAIL.");
  }

  const fallback = "No informado";
  const testerType = feedback.tester_type || fallback;
  const clarityRating = feedback.clarity_rating || fallback;
  const subject = `Nuevo feedback RutaHogar · ${testerType} · Nota ${clarityRating}/5`;
  const displayName = feedback.name || fallback;
  const contactEmail = feedback.email || fallback;
  const contactPhone = feedback.phone || fallback;
  const firstImpression = feedback.first_impression || fallback;
  const confusingPart = feedback.confusing_part || fallback;
  const improvementSuggestion = feedback.improvement_suggestion || fallback;
  const createdAtLabel = new Date(createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }) || fallback;

  const safe = {
    displayName: escapeHtml(displayName),
    contactEmail: escapeHtml(contactEmail),
    contactPhone: escapeHtml(contactPhone),
    testerType: escapeHtml(testerType),
    clarityRating: escapeHtml(String(clarityRating)),
    createdAtLabel: escapeHtml(createdAtLabel),
    firstImpression: escapeHtml(firstImpression),
    confusingPart: escapeHtml(confusingPart),
    improvementSuggestion: escapeHtml(improvementSuggestion),
  };

  const html = `
    <div style="margin:0;padding:0;background-color:#eef3f8;color:#172033;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#eef3f8;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d7e0ea;border-radius:12px;">
              <tr>
                <td style="padding:28px 32px;background-color:#246354;border-radius:12px 12px 0 0;">
                  <img src="https://score-leads-one.vercel.app/Logo%20RutaHogar.png" alt="RutaHogar" width="160" style="display:block;width:100%;max-width:160px;height:auto;border:0;margin:0 0 16px;">
                  <div style="font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.4px;color:#ffffff;">RutaHogar</div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h1 style="margin:0 0 8px;font-size:26px;line-height:34px;color:#172033;">Nuevo feedback recibido</h1>
                  <p style="margin:0 0 28px;font-size:15px;line-height:23px;color:#526174;">Respuesta enviada desde la landing de RutaHogar</p>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f4fbf7;border:1px solid #a7dbc2;border-radius:8px;">
                    <tr><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;font-weight:700;color:#246354;width:42%;">Nombre</td><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;line-height:20px;color:#172033;">${safe.displayName}</td></tr>
                    <tr><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;font-weight:700;color:#246354;">Perfil tester</td><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;line-height:20px;color:#172033;">${safe.testerType}</td></tr>
                    <tr><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;font-weight:700;color:#246354;">Nota claridad</td><td style="padding:13px 16px;border-bottom:1px solid #d7e0ea;font-size:14px;line-height:20px;color:#172033;"><strong>${safe.clarityRating}/5</strong></td></tr>
                    <tr><td style="padding:13px 16px;font-size:14px;font-weight:700;color:#246354;">Fecha</td><td style="padding:13px 16px;font-size:14px;line-height:20px;color:#172033;">${safe.createdAtLabel}</td></tr>
                  </table>

                  <h2 style="margin:30px 0 14px;font-size:19px;line-height:26px;color:#172033;">Comentarios</h2>
                  <div style="margin:0 0 12px;padding:16px;background-color:#fbfdff;border-left:4px solid #45a68e;"><div style="margin-bottom:6px;font-size:13px;font-weight:700;color:#246354;">Primera impresión</div><div style="font-size:14px;line-height:22px;color:#334155;white-space:pre-wrap;">${safe.firstImpression}</div></div>
                  <div style="margin:0 0 12px;padding:16px;background-color:#fbfdff;border-left:4px solid #45a68e;"><div style="margin-bottom:6px;font-size:13px;font-weight:700;color:#246354;">Parte confusa o difícil</div><div style="font-size:14px;line-height:22px;color:#334155;white-space:pre-wrap;">${safe.confusingPart}</div></div>
                  <div style="margin:0 0 28px;padding:16px;background-color:#fbfdff;border-left:4px solid #45a68e;"><div style="margin-bottom:6px;font-size:13px;font-weight:700;color:#246354;">Sugerencia de mejora</div><div style="font-size:14px;line-height:22px;color:#334155;white-space:pre-wrap;">${safe.improvementSuggestion}</div></div>

                  <h2 style="margin:0 0 14px;font-size:19px;line-height:26px;color:#172033;">Contacto</h2>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #d7e0ea;">
                    <tr><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;background-color:#f8fafc;font-size:13px;font-weight:700;color:#526174;width:32%;">Nombre</td><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;font-size:14px;color:#172033;">${safe.displayName}</td></tr>
                    <tr><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;background-color:#f8fafc;font-size:13px;font-weight:700;color:#526174;">Correo</td><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;font-size:14px;color:#172033;">${safe.contactEmail}</td></tr>
                    <tr><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;background-color:#f8fafc;font-size:13px;font-weight:700;color:#526174;">Teléfono</td><td style="padding:11px 14px;border-bottom:1px solid #d7e0ea;font-size:14px;color:#172033;">${safe.contactPhone}</td></tr>
                    <tr><td style="padding:11px 14px;background-color:#f8fafc;font-size:13px;font-weight:700;color:#526174;">Perfil</td><td style="padding:11px 14px;font-size:14px;color:#172033;">${safe.testerType}</td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:22px 32px;background-color:#f8fafc;border-top:1px solid #d7e0ea;border-radius:0 0 12px 12px;">
                  <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#64748b;">Este correo fue generado automáticamente por RutaHogar.</p>
                  <a href="https://score-leads-one.vercel.app/" style="font-size:13px;line-height:20px;font-weight:700;color:#246354;text-decoration:underline;">Visitar RutaHogar</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    `Nombre: ${displayName}`,
    `Perfil tester: ${testerType}`,
    `Nota claridad: ${clarityRating}/5`,
    `Fecha: ${createdAtLabel}`,
    "",
    "Primera impresión:",
    firstImpression,
    "",
    "Parte confusa o difícil:",
    confusingPart,
    "",
    "Sugerencia de mejora:",
    improvementSuggestion,
    "",
    "Contacto:",
    `Nombre: ${displayName}`,
    `Correo: ${contactEmail}`,
    `Teléfono: ${contactPhone}`,
    `Perfil: ${testerType}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Error al enviar email de feedback:", details);
    throw new Error("Feedback guardado, pero no se pudo enviar el correo.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método no permitido." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const feedback = normalizePayload(await req.json());
    const createdAt = new Date().toISOString();

    await insertFeedback(feedback);

    try {
      await sendFeedbackEmail(feedback, createdAt);
      return new Response(
        JSON.stringify({ success: true, email_sent: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (emailError) {
      console.error("Feedback guardado sin correo:", emailError.message);
      return new Response(
        JSON.stringify({
          success: true,
          email_sent: false,
          warning: "Feedback guardado, pero no se pudo enviar el correo.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error("Error en submit-feedback:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
