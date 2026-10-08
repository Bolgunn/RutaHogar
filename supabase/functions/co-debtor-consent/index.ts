import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cleanText, digestToken, invitationExpiry, invitationPublicContext, invitationStatus,
  isEmail, managementPublicContext, normalizeChileanRut, parseLeadDeclaredComplement, parseSubmission, parseTtlDays, secureToken, timingSafeEqual,
  type InvitationRow,
} from "./helpers.ts";
import {
  coDebtorConfirmationEmail, expirationEmail, invitationEmail, leadConfirmationEmail,
} from "./email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hu18-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Falta la configuraci\u00f3n ${name}.`);
  return value;
}

function appUrl(path = ""): string {
  const base = requiredEnv("APP_PUBLIC_URL").replace(/\/$/, "");
  return `${base}${path}`;
}

function publicUrl(path: string, token: string): string {
  return `${appUrl(path)}?token=${encodeURIComponent(token)}`;
}

async function sendEmail(to: string, message: { subject: string; html: string; text: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}` },
    body: JSON.stringify({ from: requiredEnv("CO_DEBTOR_FROM_EMAIL"), to: [to], ...message }),
  });
  if (!response.ok) {
    console.error("Resend rechazó el correo de co-deudor.", {
      status: response.status,
    });
    throw new Error("No se pudo enviar el correo de RutaHogar.");
  }
}

async function leadEmail(admin: AdminClient, leadId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(leadId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

async function authenticatedLead(req: Request, admin: AdminClient, anonKey: string, supabaseUrl: string): Promise<string> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw json({ error: "Debes iniciar sesi\u00f3n." }, 401);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) throw json({ error: "Sesi\u00f3n inv\u00e1lida o expirada." }, 401);
  const { data: profile, error: profileError } = await admin.from("profiles").select("id, role").eq("id", data.user.id).maybeSingle();
  if (profileError || profile?.role !== "usuario") throw json({ error: "Solo el lead puede crear esta invitaci\u00f3n." }, 403);
  return data.user.id;
}

async function findByToken(admin: AdminClient, column: "token_digest" | "management_token_digest", token: string): Promise<InvitationRow | null> {
  const digest = await digestToken(token);
  const { data, error } = await admin.from("co_debtor_invitations")
    .select("id, status, expires_at, token_digest, management_token_digest, recipient_email, lead_id, ingreso_mensual_complementario, deuda_mensual_complementario, tipo_contrato_complementario, continuidad_laboral_complementario, morosidad_complementario")
    .eq(column, digest).maybeSingle();
  if (error || !data || !timingSafeEqual(digest, String(data[column] || ""))) return null;
  return data as InvitationRow;
}

async function materializeExpiry(admin: AdminClient, invitation: InvitationRow): Promise<InvitationRow> {
  if (invitationStatus(invitation) !== "expired" || invitation.status !== "pending") return invitation;
  await admin.rpc("hu18_expire_invitation", { p_invitation_id: invitation.id });
  return { ...invitation, status: "expired" };
}

async function createInvitation(req: Request, body: Record<string, unknown>, admin: AdminClient, anonKey: string, supabaseUrl: string) {
  const leadId = await authenticatedLead(req, admin, anonKey, supabaseUrl);
  const recipientEmail = cleanText(body.recipient_email).toLowerCase();
  if (!isEmail(recipientEmail)) return json({ error: "Correo del co-deudor inv\u00e1lido." }, 400);
  let recipientRut: string;
  try { recipientRut = normalizeChileanRut(body.recipient_rut); } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  let declaredComplement;
  try { declaredComplement = parseLeadDeclaredComplement(body); } catch (error) {
    return json({ error: (error as Error).message }, 422);
  }
  const token = secureToken();
  const tokenDigest = await digestToken(token);
  const ttlDays = parseTtlDays(Deno.env.get("CO_DEBTOR_INVITATION_TTL_DAYS"));
  const expiresAt = invitationExpiry(new Date(), ttlDays).toISOString();
  const { data, error } = await admin.rpc("hu18_create_invitation", {
    p_lead_id: leadId, p_recipient_email: recipientEmail, p_recipient_rut: recipientRut, p_token_digest: tokenDigest, p_expires_at: expiresAt,
    p_ingreso_mensual_complementario: declaredComplement.ingreso_mensual_complementario,
    p_deuda_mensual_complementario: declaredComplement.deuda_mensual_complementario,
    p_tipo_contrato_complementario: declaredComplement.tipo_contrato_complementario,
    p_continuidad_laboral_complementario: declaredComplement.continuidad_laboral_complementario,
    p_morosidad_complementario: declaredComplement.morosidad_complementario,
  }).single();
  if (error || !data) return json({ error: "No se pudo crear la invitaci\u00f3n." }, 500);
  try {
    await sendEmail(recipientEmail, invitationEmail(publicUrl("/co-deudor/invitacion", token), expiresAt));
  } catch {
    await admin.rpc("hu18_revert_invitation_after_delivery_failure", {
      p_invitation_id: data.invitation_id, p_previous_invitation_id: data.previous_invitation_id,
    });
    return json({ error: "No se pudo enviar la invitaci\u00f3n; no se conserv\u00f3 una invitaci\u00f3n activa." }, 503);
  }
  return json({ status: "pending", expires_at: expiresAt, email_sent: true });
}

async function inspectInvitation(body: Record<string, unknown>, admin: AdminClient) {
  const token = cleanText(body.token, 512);
  const invitation = token ? await findByToken(admin, "token_digest", token) : null;
  if (!invitation) return json({ status: "invalid", can_submit: false }, 404);
  return json(invitationPublicContext(await materializeExpiry(admin, invitation)));
}

async function submitConfirmation(body: Record<string, unknown>, admin: AdminClient) {
  const token = cleanText(body.token, 512);
  const invitation = token ? await findByToken(admin, "token_digest", token) : null;
  if (!invitation) return json({ error: "Invitaci\u00f3n inv\u00e1lida." }, 404);
  const current = await materializeExpiry(admin, invitation);
  if (current.status !== "pending") return json({ error: "La invitaci\u00f3n no admite una nueva confirmaci\u00f3n." }, 409);
  let submission;
  try { submission = parseSubmission(body); } catch (error) { return json({ error: (error as Error).message }, 422); }
  const managementToken = secureToken();
  const managementDigest = await digestToken(managementToken);
  const { data, error } = await admin.rpc("hu18_confirm_invitation", {
    p_invitation_id: current.id,
    p_ingreso_mensual_complementario: submission.ingreso_mensual_complementario,
    p_deuda_mensual_complementario: submission.deuda_mensual_complementario,
    p_tipo_contrato_complementario: submission.tipo_contrato_complementario,
    p_continuidad_laboral_complementario: submission.continuidad_laboral_complementario,
    p_morosidad_complementario: submission.morosidad_complementario,
    p_treatment_consent_version: submission.treatment_consent_version,
    p_management_token_digest: managementDigest,
  }).single();
  if (error || !data) return json({ error: "No se pudo registrar la confirmaci\u00f3n." }, 409);
  const managementLink = publicUrl("/co-deudor/consentimiento", managementToken);
  let coDebtorEmailSent = true;
  let leadEmailSent = true;
  try { await sendEmail(data.recipient_email, coDebtorConfirmationEmail(managementLink)); } catch { coDebtorEmailSent = false; }
  const email = await leadEmail(admin, data.lead_id);
  try { if (!email) throw new Error("lead email unavailable"); await sendEmail(email, leadConfirmationEmail(appUrl("/recomendaciones"))); } catch { leadEmailSent = false; }
  return json({ status: "confirmed", confirmation_email_sent: coDebtorEmailSent, lead_email_sent: leadEmailSent });
}

async function declineInvitation(body: Record<string, unknown>, admin: AdminClient) {
  const token = cleanText(body.token, 512);
  const invitation = token ? await findByToken(admin, "token_digest", token) : null;
  if (!invitation) return json({ error: "Invitación inválida." }, 404);
  const current = await materializeExpiry(admin, invitation);
  if (current.status !== "pending") return json({ error: "La invitación no admite una respuesta." }, 409);
  const { error } = await admin.rpc("hu18_decline_invitation", { p_invitation_id: current.id });
  if (error) return json({ error: "No se pudo registrar tu decisión." }, 409);
  return json({ status: "declined" });
}

async function inspectManagement(body: Record<string, unknown>, admin: AdminClient) {
  const token = cleanText(body.token, 512);
  const invitation = token ? await findByToken(admin, "management_token_digest", token) : null;
  if (!invitation) return json({ status: "invalid", can_revoke: false }, 404);
  return json(managementPublicContext(invitation));
}

async function revokeManagement(body: Record<string, unknown>, admin: AdminClient) {
  const token = cleanText(body.token, 512);
  const invitation = token ? await findByToken(admin, "management_token_digest", token) : null;
  if (!invitation) return json({ error: "Enlace de gesti\u00f3n inv\u00e1lido." }, 404);
  if (invitation.status === "revoked") return json({ status: "revoked", already_revoked: true });
  const { data, error } = await admin.rpc("hu18_revoke_consent", { p_invitation_id: invitation.id });
  if (error) return json({ error: "No se pudo revocar el consentimiento." }, 409);
  return json({ status: "revoked", already_revoked: data === false });
}

async function processExpirations(req: Request, admin: AdminClient) {
  const expected = requiredEnv("HU18_CRON_SECRET");
  if (!timingSafeEqual(req.headers.get("x-hu18-cron-secret") || "", expected)) return json({ error: "No autorizado." }, 401);
  const { data, error } = await admin.rpc("hu18_expire_invitations");
  if (error) return json({ error: "No se pudieron procesar expiraciones." }, 500);
  let notificationFailures = 0;
  for (const invitation of data || []) {
    try { await sendEmail(invitation.recipient_email, expirationEmail(false)); } catch { notificationFailures += 1; }
    try {
      const email = await leadEmail(admin, invitation.lead_id);
      if (!email) throw new Error("lead email unavailable");
      await sendEmail(email, expirationEmail(true));
    } catch { notificationFailures += 1; }
  }
  return json({ processed: (data || []).length, notification_failures: notificationFailures });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "M\u00e9todo no permitido." }, 405);
  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const body = await req.json() as Record<string, unknown>;
    const action = cleanText(body.action, 64);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    if (action === "create_invitation") return await createInvitation(req, body, admin, anonKey, supabaseUrl);
    if (action === "inspect_invitation") return await inspectInvitation(body, admin);
    if (action === "submit_confirmation") return await submitConfirmation(body, admin);
    if (action === "decline_invitation") return await declineInvitation(body, admin);
    if (action === "inspect_management") return await inspectManagement(body, admin);
    if (action === "revoke_management") return await revokeManagement(body, admin);
    if (action === "process_expirations") return await processExpirations(req, admin);
    return json({ error: "Acci\u00f3n no permitida." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "No se pudo procesar la solicitud de co-deudor." }, 500);
  }
});
