import { supabase } from "../utils/supabase";

const invitationFields = [
  "recipient_email",
  "status",
  "expires_at",
  "created_at",
  "co_debtor_confirmations(ingreso_mensual_complementario,deuda_mensual_complementario,tipo_contrato_complementario,continuidad_laboral_complementario,morosidad_complementario)",
].join(",");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireSupabase() {
  if (!supabase) throw new Error("La información del co-deudor no está disponible en este momento.");
}

function functionMessage(error, data) {
  if (data?.error) return data.error;
  const status = error?.context?.status;
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente para continuar.";
  if (status === 403) return "No tienes permisos para enviar esta invitación.";
  if (status === 503) return "No pudimos enviar la invitación. Intenta nuevamente.";
  return "No se pudo enviar la invitación. Intenta nuevamente.";
}

async function readFunctionError(error) {
  try {
    return await error?.context?.clone?.().json();
  } catch {
    return null;
  }
}

function isExpired(invitation, now = Date.now()) {
  if (invitation?.status !== "pending" || !invitation.expires_at) return false;
  const expiresAt = new Date(invitation.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function confirmationFor(invitation) {
  const relation = invitation?.co_debtor_confirmations;
  return Array.isArray(relation) ? relation[0] || null : relation || null;
}

export function normalizeLeadCoDebtorInvitation(invitation, now = Date.now()) {
  if (!invitation) return null;
  const status = isExpired(invitation, now) ? "expired" : invitation.status;
  return {
    recipientEmail: invitation.recipient_email || "",
    status,
    expiresAt: invitation.expires_at || null,
    // Confirmed values are deliberately omitted as soon as consent is no
    // longer current. The UI never reads invitation or management tokens.
    confirmation: status === "confirmed" ? confirmationFor(invitation) : null,
  };
}

export async function getLeadCoDebtorInvitation() {
  requireSupabase();
  const { data, error } = await supabase
    .from("co_debtor_invitations")
    .select(invitationFields)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("No pudimos cargar el estado de tu co-deudor. Intenta nuevamente.");
  return normalizeLeadCoDebtorInvitation(data);
}

export function validateCoDebtorEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!emailPattern.test(email)) throw new Error("Ingresa un correo válido para el co-deudor.");
  return email;
}

export async function createCoDebtorInvitation(recipientEmail) {
  requireSupabase();
  const email = validateCoDebtorEmail(recipientEmail);
  const { data, error } = await supabase.functions.invoke("co-debtor-consent", {
    body: { action: "create_invitation", recipient_email: email },
  });
  if (error || data?.error) {
    const detail = data?.error ? data : await readFunctionError(error);
    throw new Error(functionMessage(error, detail));
  }
  return data;
}
