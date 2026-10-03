export const FINANCIAL_FIELDS = [
  "ingreso_mensual_complementario",
  "deuda_mensual_complementario",
  "tipo_contrato_complementario",
  "continuidad_laboral_complementario",
  "morosidad_complementario",
] as const;

export const CONTRACT_TYPES = new Set(["indefinido", "plazo_fijo", "independiente", "honorarios_variable"]);
export const CONTINUITY_VALUES = new Set([
  "menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios",
]);
export const DELINQUENCY_VALUES = new Set(["si", "no"]);

export type InvitationRow = {
  id: string;
  status: "pending" | "expired" | "confirmed" | "revoked" | "replaced";
  expires_at: string;
  token_digest?: string | null;
  management_token_digest?: string | null;
  recipient_email?: string;
  lead_id?: string;
};

export function cleanText(value: unknown, maxLength = 254): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function secureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function digestToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function invitationStatus(row: InvitationRow, now = new Date()): InvitationRow["status"] {
  return row.status === "pending" && new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : row.status;
}

export function parseTtlDays(value: string | undefined): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error("CO_DEBTOR_INVITATION_TTL_DAYS no est\u00e1 configurado.");
  return days;
}

export function invitationExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export type Submission = {
  ingreso_mensual_complementario: number;
  deuda_mensual_complementario: number;
  tipo_contrato_complementario: string;
  continuidad_laboral_complementario: string;
  morosidad_complementario: string;
  treatment_consent_version: string;
};

export function parseSubmission(payload: Record<string, unknown>): Submission {
  const allowed = new Set(["action", "token", "treatment_consent", "treatment_consent_version", ...FINANCIAL_FIELDS]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new Error("La confirmaci\u00f3n contiene campos no permitidos.");
  }
  if (payload.treatment_consent !== true) throw new Error("El consentimiento de tratamiento es obligatorio.");
  const income = Number(payload.ingreso_mensual_complementario);
  const debt = Number(payload.deuda_mensual_complementario);
  if (!Number.isFinite(income) || income < 0 || !Number.isFinite(debt) || debt < 0) {
    throw new Error("Ingreso y deuda deben ser valores no negativos.");
  }
  const contract = cleanText(payload.tipo_contrato_complementario, 64);
  const continuity = cleanText(payload.continuidad_laboral_complementario, 64);
  const delinquency = cleanText(payload.morosidad_complementario, 8);
  const version = cleanText(payload.treatment_consent_version, 120);
  if (!CONTRACT_TYPES.has(contract) || !CONTINUITY_VALUES.has(continuity) || !DELINQUENCY_VALUES.has(delinquency)) {
    throw new Error("Los antecedentes laborales o de morosidad no son v\u00e1lidos.");
  }
  if (!version) throw new Error("La versi\u00f3n del consentimiento es obligatoria.");
  return {
    ingreso_mensual_complementario: income,
    deuda_mensual_complementario: debt,
    tipo_contrato_complementario: contract,
    continuidad_laboral_complementario: continuity,
    morosidad_complementario: delinquency,
    treatment_consent_version: version,
  };
}

export function invitationPublicContext(row: InvitationRow, status = invitationStatus(row)) {
  return {
    status,
    expires_at: status === "pending" ? row.expires_at : null,
    can_submit: status === "pending",
  };
}

export function managementPublicContext(row: InvitationRow, status = invitationStatus(row)) {
  return { status, can_revoke: status === "confirmed" };
}
