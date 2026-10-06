import { escapeHtml } from "./helpers.ts";

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

type CtaTone = "gold" | "blue";

const COLORS = {
  navy: "#102A43",
  blue: "#1769AA",
  gold: "#F2C94C",
  goldText: "#18212F",
  page: "#F4F7FA",
  info: "#EAF4FC",
  text: "#243B53",
  muted: "#627D98",
  border: "#D9E2EC",
};

// Vite publishes this official, full wordmark from frontend/public at this
// stable production URL. Remote images are broadly supported by Gmail/Outlook.
const RUTAHOGAR_LOGO_URL = "https://www.rutahogar.cl/brand/rutahogar/logo-rutahogar.svg";

function emailShell(preheader: string, content: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RutaHogar</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.page};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${COLORS.page};">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
          <tr><td style="padding:20px 36px;background:${COLORS.navy};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:6px;"><tr><td style="padding:8px 12px;">
              <img src="${RUTAHOGAR_LOGO_URL}" alt="RutaHogar" width="172" style="display:block;width:172px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:36px;">${content}</td></tr>
          <tr><td style="padding:20px 36px;border-top:1px solid ${COLORS.border};font-size:13px;line-height:20px;color:${COLORS.muted};">RutaHogar · Orientación para tu proceso de vivienda</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function cta(label: string, url: string, tone: CtaTone): string {
  const background = tone === "gold" ? COLORS.gold : COLORS.blue;
  const color = tone === "gold" ? COLORS.goldText : "#FFFFFF";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
  <tr><td align="center" bgcolor="${background}" style="border-radius:7px;">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 22px;border-radius:7px;background:${background};color:${color};font-size:16px;font-weight:700;line-height:20px;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

function infoBlock(items: string[]): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0;background:${COLORS.info};border-radius:8px;">
  <tr><td style="padding:20px 22px;font-size:15px;line-height:23px;color:${COLORS.text};">
    ${items.map((item) => `<div style="padding:3px 0;">&#10003;&nbsp; ${escapeHtml(item)}</div>`).join("")}
  </td></tr>
</table>`;
}

function title(value: string): string {
  return `<h1 style="margin:0 0 16px;color:${COLORS.navy};font-size:26px;line-height:34px;font-weight:700;">${escapeHtml(value)}</h1>`;
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:25px;color:${COLORS.text};">${escapeHtml(value)}</p>`;
}

export function formatExpirationDate(expiresAt?: string): string | null {
  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(expiresAt));
}

export function invitationEmail(link: string, expiresAt: string): EmailMessage {
  const expiry = formatExpirationDate(expiresAt);
  return {
    subject: "Te han invitado a ser co-deudor en RutaHogar",
    html: emailShell("Revisa y confirma tus antecedentes para complementar la renta.", [
      title("Te han invitado a ser co-deudor en RutaHogar"),
      paragraph("Una persona te invitó a participar en su proceso de compra de vivienda. Podrás revisar tus propios antecedentes antes de confirmarlos."),
      infoBlock(["Revisa tus antecedentes", "Entrega tu consentimiento", "Proceso seguro"]),
      cta("Revisar y confirmar mis antecedentes", link, "gold"),
      expiry ? paragraph(`Esta invitación vence el ${expiry}.`) : "",
      `<p style="margin:24px 0 0;font-size:14px;line-height:21px;color:${COLORS.muted};">Si no esperabas este correo, puedes ignorarlo.</p>`,
    ].join("")),
    text: `Te han invitado a ser co-deudor en RutaHogar. Revisa y confirma tus antecedentes para complementar la renta.${expiry ? ` La invitación vence el ${expiry}.` : ""} Si no esperabas este correo, puedes ignorarlo.`,
  };
}

export function coDebtorConfirmationEmail(link: string): EmailMessage {
  return {
    subject: "Tus antecedentes fueron confirmados en RutaHogar",
    html: emailShell("Tu información ya está registrada correctamente.", [
      title("¡Listo! Tus antecedentes fueron confirmados"),
      paragraph("Gracias por revisar y confirmar tus antecedentes. Tus datos quedaron registrados correctamente."),
      infoBlock(["Se utilizarán para la precalificación relacionada", "Puedes gestionar tu consentimiento cuando lo necesites"]),
      cta("Gestionar mi consentimiento", link, "blue"),
      `<p style="margin:0;font-size:14px;line-height:21px;color:${COLORS.muted};">Desde ahí puedes revisar el estado y revocar tu consentimiento.</p>`,
    ].join("")),
    text: "Tus antecedentes fueron confirmados en RutaHogar. Tu información quedó registrada correctamente para la precalificación relacionada. Puedes gestionar o revocar tu consentimiento desde el botón de este correo.",
  };
}

export function leadConfirmationEmail(link: string): EmailMessage {
  return {
    subject: "El co-deudor confirmó sus antecedentes",
    html: emailShell("Ya puedes actualizar tu score con los datos confirmados.", [
      title("El co-deudor confirmó sus antecedentes"),
      paragraph("La persona invitada revisó y confirmó su información. Tu score no se actualizó automáticamente."),
      infoBlock(["Puedes actualizar tu precalificación para considerar los datos confirmados del co-deudor"]),
      cta("Actualizar score con datos confirmados", link, "gold"),
      `<p style="margin:0;font-size:14px;line-height:21px;color:${COLORS.muted};">Al actualizar tu score, se considerarán los antecedentes confirmados del co-deudor.</p>`,
    ].join("")),
    text: "El co-deudor confirmó sus antecedentes. Tu score no se actualizó automáticamente. Puedes actualizar tu precalificación con los datos confirmados desde el botón de este correo.",
  };
}

export function expirationEmail(forLead: boolean, expiresAt?: string): EmailMessage {
  const expiry = formatExpirationDate(expiresAt);
  const recipientCopy = forLead
    ? "Puedes generar una nueva invitación desde RutaHogar y revisar nuevamente el correo de la persona invitada."
    : "Solicita a la persona que te invitó que genere una nueva invitación y revisa nuevamente el correo.";
  return {
    subject: "La invitación para co-deudor ha expirado",
    html: emailShell("Será necesario generar una nueva invitación en RutaHogar.", [
      title("La invitación ha expirado"),
      paragraph("El enlace de la invitación ya no está disponible."),
      expiry ? paragraph(`La invitación venció el ${expiry}.`) : "",
      infoBlock([recipientCopy]),
    ].join("")),
    text: `La invitación para co-deudor ha expirado. El enlace ya no está disponible.${expiry ? ` La invitación venció el ${expiry}.` : ""} ${recipientCopy}`,
  };
}
