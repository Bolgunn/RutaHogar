import {
  digestToken, invitationPublicContext, invitationStatus, managementPublicContext,
  parseSubmission, secureToken, timingSafeEqual,
} from "./helpers.ts";

const now = new Date("2026-10-03T12:00:00.000Z");
const pending = {
  id: "11111111-1111-1111-1111-111111111111",
  status: "pending" as const,
  expires_at: "2026-10-10T12:00:00.000Z",
};

Deno.test("HU18 invitation tokens are random and only their digest is persistable", async () => {
  const token = secureToken();
  const digest = await digestToken(token);
  if (token === digest || digest.length !== 64 || !timingSafeEqual(digest, await digestToken(token))) {
    throw new Error("token digest contract broken");
  }
});

Deno.test("HU18 public invitation context contains no invitation id or financial values", () => {
  const context = invitationPublicContext(pending, now);
  if ("id" in context || "ingreso_mensual" in context || context.status !== "pending" || !context.can_submit) {
    throw new Error("public invitation context leaks data");
  }
});

Deno.test("HU18 recognises expired, replaced, consumed, and revoked invitation states", () => {
  if (invitationStatus(pending, new Date("2026-10-10T12:00:00.000Z")) !== "expired") throw new Error("expiry missing");
  for (const status of ["replaced", "confirmed", "revoked"] as const) {
    if (invitationStatus({ ...pending, status }, now) !== status) throw new Error(`lost ${status} state`);
  }
});

Deno.test("HU18 submission accepts only the five financial fields and treatment consent", () => {
  const submission = parseSubmission({
    action: "submit_confirmation",
    token: "public-token",
    ingreso_mensual_complementario: 900000,
    deuda_mensual_complementario: 100000,
    tipo_contrato_complementario: "indefinido",
    continuidad_laboral_complementario: "mas_3_anios",
    morosidad_complementario: "no",
    treatment_consent: true,
    treatment_consent_version: "2026-10",
  });
  if (Object.keys(submission).length !== 6 || submission.ingreso_mensual_complementario !== 900000) {
    throw new Error("valid submission rejected");
  }
});

Deno.test("HU18 rejects missing consent and lead-owned relation changes", () => {
  const base = {
    ingreso_mensual_complementario: 1,
    deuda_mensual_complementario: 0,
    tipo_contrato_complementario: "indefinido",
    continuidad_laboral_complementario: "mas_3_anios",
    morosidad_complementario: "no",
    treatment_consent: true,
    treatment_consent_version: "v1",
  };
  for (const payload of [{ ...base, treatment_consent: false }, { ...base, relacion_complementario: "pareja" }]) {
    let rejected = false;
    try { parseSubmission(payload); } catch { rejected = true; }
    if (!rejected) throw new Error("invalid co-debtor submission accepted");
  }
});

Deno.test("HU18 management context allows only confirmed consent to be revoked", () => {
  if (!managementPublicContext({ ...pending, status: "confirmed" }, now).can_revoke) throw new Error("confirmed not manageable");
  if (managementPublicContext({ ...pending, status: "revoked" }, now).can_revoke) throw new Error("revoked consent mutable");
});
