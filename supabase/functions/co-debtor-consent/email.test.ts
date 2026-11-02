import {
  coDebtorConfirmationEmail, expirationEmail, formatExpirationDate, invitationEmail, leadConfirmationEmail,
} from "./email.ts";

const invitationUrl = "https://rutahogar.cl/co-deudor/invitacion?token=invitation-secret";
const managementUrl = "https://rutahogar.cl/co-deudor/consentimiento?token=management-secret";
const leadUrl = "https://rutahogar.cl/recomendaciones";
const expiresAt = "2026-10-11T12:00:00.000Z";
const officialLogoUrl = "https://www.rutahogar.cl/brand/rutahogar/logo-rutahogar.svg";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function visibleHtml(html: string): string {
  return html.replace(/href="[^"]*"/g, "");
}

function assertSafeEmail(html: string, text: string): void {
  const visible = visibleHtml(html);
  for (const forbidden of ["12.345.678-5", "900000", "100000", "invitation-secret", "management-secret", "<script", "javascript:", "Ã"]) {
    assert(!visible.includes(forbidden) && !text.includes(forbidden), `email exposes ${forbidden}`);
  }
  assert(html.includes("<!doctype html>") && html.includes("</html>"), "email shell is incomplete");
  assert(!/<script|javascript:/i.test(html), "email contains JavaScript");
}

function assertOfficialHeaderLogo(html: string): void {
  assert(html.includes(`src="${officialLogoUrl}"`), "official full logo is missing from header");
  assert(html.includes('alt="RutaHogar"'), "official logo alt text is missing");
  assert(!html.includes("Ruta<span"), "header must not reconstruct or duplicate the wordmark");
  assert(html.includes("background:#EAF4FC;border-bottom:4px solid #102A43"), "header must keep the logo readable directly on the blue background");
  assert(!html.includes("background:#FFFFFF;border-radius:6px"), "logo must not use a white container");
}

Deno.test("HU18 invitation email uses the approved subject, CTA, secure URL, and expiry date", () => {
  const message = invitationEmail(invitationUrl, expiresAt);
  const formattedDate = formatExpirationDate(expiresAt);
  assert(message.subject === "Te han invitado a ser co-deudor en RutaHogar", "unexpected invitation subject");
  assert(message.html.includes("Revisar y confirmar mis antecedentes"), "invitation CTA missing");
  assert(message.html.includes(`href="${invitationUrl}"`), "invitation CTA URL changed");
  assert(Boolean(formattedDate) && message.html.includes(formattedDate), "invitation expiry date missing");
  assertOfficialHeaderLogo(message.html);
  assert(message.html.includes("Si no esperabas este correo, puedes ignorarlo."), "invitation footer missing");
  assertSafeEmail(message.html, message.text);
});

Deno.test("HU18 confirmation email provides only the management action", () => {
  const message = coDebtorConfirmationEmail(managementUrl);
  assert(message.subject === "Tus antecedentes fueron confirmados en RutaHogar", "unexpected confirmation subject");
  assert(message.html.includes("Gestionar mi consentimiento"), "management CTA missing");
  assert(message.html.includes(`href="${managementUrl}"`), "management URL changed");
  assertOfficialHeaderLogo(message.html);
  assert(message.html.includes("revisar el estado y revocar tu consentimiento"), "revocation explanation missing");
  assertSafeEmail(message.html, message.text);
});

Deno.test("HU18 lead confirmation points to the existing score update view", () => {
  const message = leadConfirmationEmail(leadUrl);
  assert(message.subject === "El co-deudor confirmó sus antecedentes", "unexpected lead subject");
  assert(message.html.includes("Tu score no se actualizó automáticamente."), "automatic-score notice missing");
  assert(message.html.includes("Actualizar score con datos confirmados"), "lead CTA missing");
  assertOfficialHeaderLogo(message.html);
  assert(message.html.includes(`href="${leadUrl}"`), "lead CTA URL changed");
  assertSafeEmail(message.html, message.text);
});

Deno.test("HU18 expiration email has recipient-aware copy, expiry date, and no invitation link", () => {
  const formattedDate = formatExpirationDate(expiresAt);
  for (const forLead of [true, false]) {
    const message = expirationEmail(forLead, expiresAt);
    assert(message.subject === "La invitación para co-deudor ha expirado", "unexpected expiration subject");
    assert(message.html.includes("La invitación ha expirado"), "expiration title missing");
    assert(Boolean(formattedDate) && message.html.includes(formattedDate), "expiration date missing");
    assert(!message.html.includes("href="), "expired email must not contain a reusable link");
    assertOfficialHeaderLogo(message.html);
    assert(message.html.toLowerCase().includes(forLead ? "generar una nueva invitación" : "solicita a la persona que te invitó"), "recipient copy missing");
    assertSafeEmail(message.html, message.text);
  }
});
