import { supabase } from "../utils/supabase";
import { trackingRequest } from "./trackingService";
import { normalizeChileanRut } from "../utils/chileanRut";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CO_DEBTOR_TREATMENT_CONSENT_VERSION = "2026-10";

const publicFinancialFields = [
  "ingreso_mensual_complementario",
  "deuda_mensual_complementario",
  "tipo_contrato_complementario",
  "continuidad_laboral_complementario",
  "morosidad_complementario",
];

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

function publicFunctionFailure(error, payload, fallback) {
  const failure = new Error(payload?.error || fallback);
  failure.status = error?.context?.status || null;
  failure.payload = payload || null;
  return failure;
}

async function invokePublicCoDebtor(action, token, values = {}) {
  requireSupabase();
  const { data, error } = await supabase.functions.invoke("co-debtor-consent", {
    body: { action, ...(token !== undefined ? { token } : {}), ...values },
  });
  if (error) {
    const payload = await readFunctionError(error);
    throw publicFunctionFailure(error, payload, "No se pudo procesar el enlace. Intenta nuevamente.");
  }
  if (data?.error) throw publicFunctionFailure(null, data, "No se pudo procesar el enlace. Intenta nuevamente.");
  return data;
}

export function readPublicCoDebtorToken(search = typeof window === "undefined" ? "" : window.location.search) {
  return new URLSearchParams(search || "").get("token") || "";
}

export function runExclusive(lock, task) {
  if (lock.current) return lock.current;
  const request = Promise.resolve().then(task);
  lock.current = request;
  const clear = () => {
    if (lock.current === request) lock.current = null;
  };
  request.then(clear, clear);
  return request;
}

export async function inspectCoDebtorInvitation(token) {
  try {
    return await invokePublicCoDebtor("inspect_invitation", token);
  } catch (failure) {
    if (failure.status === 404 && failure.payload?.status === "invalid") return failure.payload;
    throw failure;
  }
}

export async function submitCoDebtorConfirmation(token, values = {}) {
  const body = Object.fromEntries(publicFinancialFields.map((field) => [field, values[field]]));
  return invokePublicCoDebtor("submit_confirmation", token, {
    ...body,
    treatment_consent: true,
    treatment_consent_version: CO_DEBTOR_TREATMENT_CONSENT_VERSION,
  });
}

export function declineCoDebtorInvitation(token) {
  return invokePublicCoDebtor("decline_invitation", token);
}

export async function inspectCoDebtorManagement(token) {
  try {
    return await invokePublicCoDebtor("inspect_management", token);
  } catch (failure) {
    if (failure.status === 404 && failure.payload?.status === "invalid") return failure.payload;
    throw failure;
  }
}

export function revokeCoDebtorManagement(token) {
  return invokePublicCoDebtor("revoke_management", token);
}

function isExpired(invitation, now = Date.now()) {
  if (invitation?.status !== "pending" || !invitation.expires_at) return false;
  const expiresAt = new Date(invitation.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function confirmationFor(invitation) {
  const relation = invitation?.co_debtor_confirmations;
  if (!Array.isArray(relation)) return relation || null;
  if (relation.length > 1) throw new Error("La revisión del co-deudor es ambigua. Actualiza la página.");
  return relation.at(0) || null;
}

function declaredComplementFor(invitation) {
  const values = Object.fromEntries(publicFinancialFields.map((field) => [field, invitation?.[field]]));
  return publicFinancialFields.every((field) => values[field] !== undefined && values[field] !== null && values[field] !== "")
    ? values
    : null;
}

export function normalizeLeadCoDebtorInvitation(invitation, now = Date.now()) {
  if (!invitation) return null;
  const rawStatus = isExpired(invitation, now) ? "expired" : invitation.status;
  // The delivery-failure operation marks the freshly-created record as
  // replaced. It has no usable token, so surface it as a retryable state.
  const status = rawStatus === "replaced" ? "delivery_failed" : rawStatus;
  return {
    recipientEmail: invitation.recipient_email || "",
    recipientRut: invitation.recipient_rut || "",
    status,
    expiresAt: invitation.expires_at || null,
    declaredComplement: declaredComplementFor(invitation),
    ...(invitation.declared_relation ? { declaredRelation: invitation.declared_relation } : {}),
    // Confirmed values are deliberately omitted as soon as consent is no
    // longer current. The UI never reads invitation or management tokens.
    confirmation: status === "confirmed" ? confirmationFor(invitation) : null,
  };
}

export async function getLeadCoDebtorInvitation() {
  requireSupabase();
  const projection = await trackingRequest("/owner/co-debtor");
  const data = projection.items || [];
  const invitations = (data || []).map((item) => normalizeLeadCoDebtorInvitation(item));
  return invitations.find((item) => item.status === "pending") || invitations[0] || null;
}

export function validateCoDebtorEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!emailPattern.test(email)) throw new Error("Ingresa un correo válido para el co-deudor.");
  return email;
}

export function validateCoDebtorRut(value) {
  const rut = normalizeChileanRut(value);
  if (!rut) throw new Error("Ingresa un RUT válido para el co-deudor.");
  return rut;
}

export async function createCoDebtorInvitation(recipientEmail, recipientRut, declaredComplement = {}, declaredRelation) {
  requireSupabase();
  const email = validateCoDebtorEmail(recipientEmail);
  const rut = validateCoDebtorRut(recipientRut);
  const { data, error } = await supabase.functions.invoke("co-debtor-consent", {
    body: {
      action: "create_invitation",
      recipient_email: email,
      recipient_rut: rut,
      ...(declaredRelation !== undefined ? { relacion_complementario: declaredRelation } : {}),
      ...Object.fromEntries(publicFinancialFields.map((field) => [field, declaredComplement[field]])),
    },
  });
  if (error || data?.error) {
    const detail = data?.error ? data : await readFunctionError(error);
    throw publicFunctionFailure(error, detail, functionMessage(error, detail));
  }
  return data;
}

export const authorizeCoDebtorInvitation = (token) => invokePublicCoDebtor("authorize_invitation", token);

// Participation IDs are scoped selectors, never authorization; Edge resolves the actor.
export const reviewCoDebtorParticipation = (id) => invokePublicCoDebtor("review_participation", undefined, { participation_id: id });
export const listCoDebtorParticipations = () => invokePublicCoDebtor("list_participations", undefined);
export const confirmCoDebtorParticipation = (id, command) => invokePublicCoDebtor("confirm_participation", undefined, { participation_id: id, ...command });
export const decideCoDebtorParticipation = (id, decision) => invokePublicCoDebtor(`${decision}_participation`, undefined, { participation_id: id });
