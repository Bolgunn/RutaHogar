import { digestToken } from "./helpers.ts";

// No request-provided account, email, role, RUT or participation id is trusted.
export async function authorizeInvitationAccess(req: Request, body: Record<string, unknown>, admin: any) {
  const unavailable = { status: 409, body: { code: "invitation_unavailable", error: "La invitación no está disponible." } };
  if (Object.keys(body).some(key => !["action", "token"].includes(key))
    || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{20,512}$/.test(body.token)) return unavailable;
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return { status: 401, body: { code: "unauthenticated", error: "Inicia sesión para continuar." } };
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user?.id) return { status: 401, body: { code: "unauthenticated", error: "Inicia sesión para continuar." } };
  const response = await admin.rpc("hu30_authorize_invitation", {
    p_token_digest: await digestToken(body.token), p_actor: data.user.id,
  });
  if (response.error) {
    const code = response.error.message;
    if (code === "participant_identity_mismatch") return { status: 403, body: { code, error: "Esta cuenta no puede acceder a la invitación. Puedes cambiar de cuenta." } };
    if (code === "email_confirmation_required") return { status: 403, body: { code, error: "Confirma tu correo antes de continuar." } };
    if (["invitation_unavailable", "not_found"].includes(code)) return unavailable;
    return { status: 503, body: { code: "access_unavailable", error: "No pudimos verificar el acceso. Intenta nuevamente." } };
  }
  return { status: 200, body: response.data };
}
