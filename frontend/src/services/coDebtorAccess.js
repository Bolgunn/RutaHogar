import { inspectCoDebtorInvitation, authorizeCoDebtorInvitation } from "./coDebtorService";
import { restoreInvitationSession } from "./auth";

export async function loadInvitationAccess(context) {
  if (!context?.token) return { phase: "unavailable" };
  // Always read the current server state, even after a successful login/callback.
  const invitation = await inspectCoDebtorInvitation(context.token);
  if (invitation.status !== "pending") return { phase: "unavailable" };
  const auth = await restoreInvitationSession();
  if (!auth?.session) return { phase: "authentication" };
  try {
    const access = await authorizeCoDebtorInvitation(context.token);
    return access?.authorized === true ? { phase: "authorized", expiresAt: access.expires_at, ...(access.participation_id ? { participationId: access.participation_id } : {}) } : { phase: "unavailable" };
  } catch (error) {
    if (error.status === 401) return { phase: "authentication" };
    if (error.payload?.code === "email_confirmation_required") return { phase: "verification" };
    if (error.status === 403) return { phase: "wrong_account" };
    if ([404, 409].includes(error.status)) return { phase: "unavailable" };
    throw new Error("No pudimos verificar el acceso. Intenta nuevamente.");
  }
}
