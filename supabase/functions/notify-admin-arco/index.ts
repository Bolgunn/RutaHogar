import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface ArcoNotification {
  tipo: string;
  descripcion: string;
  email_usuario: string;
  nombre_usuario: string;
}

serve(async (req) => {
  try {
    const { tipo, descripcion, email_usuario, nombre_usuario }: ArcoNotification = await req.json();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Falta RESEND_API_KEY en las variables de entorno.");
    }

    const adminEmails = [
      Deno.env.get("ARCO_NOTIFICATION_EMAIL") || "rodrigo.ramirezd@usm.cl",
    ];

    const tipoLabels: Record<string, string> = {
      acceso: "Acceso",
      rectificacion: "Rectificación",
      cancelacion: "Cancelación",
      otro: "Otra solicitud",
    };

    const tipoLabel = tipoLabels[tipo] || tipo;

    let notifiedCount = 0;
    for (const adminEmail of adminEmails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "RutaHogar <onboarding@resend.dev>",
          to: [adminEmail],
          subject: `Nueva solicitud ARCO de ${nombre_usuario}`,
          html: `
            <h2>Nueva solicitud ARCO recibida</h2>
            <table style="border-collapse:collapse;width:100%;max-width:600px;">
              <tr><td style="padding:8px;font-weight:bold;">Solicitante</td><td style="padding:8px;">${nombre_usuario}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${email_usuario}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Tipo</td><td style="padding:8px;">${tipoLabel}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Descripción</td><td style="padding:8px;">${descripcion}</td></tr>
            </table>
            <p>Puedes revisar y gestionar esta solicitud en el panel de administración de RutaHogar.</p>
          `,
        }),
      });

      if (res.ok) {
        notifiedCount++;
      } else {
        const errBody = await res.text();
        console.error(`Error al enviar email a ${adminEmail}:`, errBody);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: notifiedCount, total: adminEmails.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error en notify-admin-arco:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
