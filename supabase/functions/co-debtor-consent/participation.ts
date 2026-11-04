import { FINANCIAL_FIELDS, CONTRACT_TYPES, CONTINUITY_VALUES, DELINQUENCY_VALUES } from "./helpers.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PARTICIPANT_ACTIONS = ["review_participation", "confirm_participation", "decline_participation", "revoke_participation", "list_participations"];

export function parseParticipantCommand(body: Record<string, any>) {
  const confirmation = body.action === "confirm_participation";
  const allowed = new Set(["action", ...(body.action === "list_participations" ? [] : ["participation_id"]),
    ...(confirmation ? ["request_id", "expected_revision", "relation_event_id", "accept_relation", "values", "participation_consent"] : [])]);
  if (Object.keys(body).some(key => !allowed.has(key)) || !PARTICIPANT_ACTIONS.includes(body.action)
    || (body.action !== "list_participations" && !UUID.test(body.participation_id || ""))) throw new Error("invalid_confirmation");
  if (!confirmation) return;
  const values = body.values;
  if (!UUID.test(body.request_id || "") || !UUID.test(body.relation_event_id || "")
    || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0
    || typeof body.accept_relation !== "boolean" || body.participation_consent !== true
    || !values || Array.isArray(values) || Object.keys(values).length !== 5
    || Object.keys(values).some(key => !(FINANCIAL_FIELDS as readonly string[]).includes(key))
    || ![values.ingreso_mensual_complementario, values.deuda_mensual_complementario].every(value =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
    || !CONTRACT_TYPES.has(values.tipo_contrato_complementario)
    || !CONTINUITY_VALUES.has(values.continuidad_laboral_complementario)
    || !DELINQUENCY_VALUES.has(values.morosidad_complementario)) throw new Error("invalid_confirmation");
}

export async function participantAction(req: Request, body: Record<string, any>, admin: any,
  notify?: (actor: any, participationId: string, confirmation: any) => Promise<unknown>) {
  const denied = { status: 403, body: { code: "participant_identity_mismatch", error: "Esta cuenta no puede acceder a la participación." } };
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return { status: 401, body: { code: "unauthenticated", error: "Inicia sesión para continuar." } };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return { status: 401, body: { code: "unauthenticated", error: "Inicia sesión para continuar." } };
  try { parseParticipantCommand(body); } catch { return { status: 422, body: { code: "invalid_confirmation", error: "Revisa los antecedentes, la relación y el consentimiento." } }; }
  const actor = data.user;
  let rpc = "hu30_review_participation";
  let args: Record<string, unknown> = { p_id: body.participation_id, p_actor: actor.id };
  if (body.action === "list_participations") { rpc = "hu30_list_participations"; args = { p_actor: actor.id }; }
  if (body.action === "confirm_participation") {
    rpc = "hu30_confirm_participation";
    Object.assign(args, { p_request_id: body.request_id, p_expected_revision: body.expected_revision,
      p_relation_event_id: body.relation_event_id, p_accept_relation: body.accept_relation,
      p_values: body.values, p_consent: body.participation_consent });
  }
  if (["decline_participation", "revoke_participation"].includes(body.action)) {
    rpc = "hu30_participant_decision";
    args.p_decision = body.action === "decline_participation" ? "decline" : "revoke";
  }
  const result = await admin.rpc(rpc, args);
  if (result.error) {
    const code = result.error.message;
    if (["participant_identity_mismatch", "owner_mismatch", "not_found"].includes(code)) return denied;
    if (["invitation_unavailable", "co_debtor_participation_closed"].includes(code)) return { status: 409, body: { code: "invitation_unavailable", error: "La participación está cerrada o no está disponible." } };
    if (["co_debtor_revision_conflict", "co_debtor_relation_conflict", "idempotency_conflict"].includes(code))
      return { status: 409, body: { code, error: "Los antecedentes o la relación cambiaron. Vuelve a revisar antes de confirmar." } };
    if (["invalid_confirmation", "participation_consent_required", "relation_acceptance_required"].includes(code))
      return { status: 422, body: { code, error: "Revisa los antecedentes, la relación y el consentimiento." } };
    return { status: 503, body: { code: "access_unavailable", error: "No pudimos completar la operación. Intenta nuevamente." } };
  }
  let notifications;
  if (body.action === "confirm_participation" && result.data?.replayed === false && notify) {
    try { notifications = await notify(actor, body.participation_id, result.data); } catch { notifications = { email_sent: false }; }
  }
  return { status: 200, body: { ...result.data, ...(notifications ? { notifications } : {}) } };
}
