import CoDebtorParticipationReview, { CoDebtorParticipationList } from "./CoDebtorParticipationReview";
import { restoreInvitationSession } from "../services/auth";
import { participationPath } from "../services/coDebtorReview";
import React, { useEffect, useRef, useState } from "react";
import AuthPanel from "./AuthPanel";
import { signOut } from "../services/auth";
import { supabase } from "../utils/supabase";
import { captureInvitationContext, invitationReturnPath } from "../services/coDebtorAuthContext";
import { loadInvitationAccess } from "../services/coDebtorAccess";
import PublicShell from "./CoDebtorPageShell";

export function InvitationAccessView({ phase, onRetry, onSwitchAccount }) {
  const messages = {
    checking: "Verificando el acceso a tu invitación…",
    unavailable: "La invitación no está disponible. Abre el enlace original o solicita una nueva invitación.",
    wrong_account: "Esta cuenta no puede acceder a la invitación. Puedes cambiar de cuenta.",
    verification: "Confirma tu correo antes de continuar y vuelve a abrir la invitación.",
    authorized: "Cuenta autorizada. El siguiente paso será revisar y confirmar tus antecedentes. Todavía no se ha registrado información financiera ni consentimiento.",
    error: "No pudimos verificar el acceso. Intenta nuevamente.",
  };
  return <PublicShell><section className="co-debtor-public-card hu30-access-card" aria-live="polite" aria-busy={phase === "checking"}>
    <h1>Invitación de co-deudor</h1><p>{messages[phase] || messages.unavailable}</p>
    <div className="co-debtor-public-form__actions"><button className="primary-button" type="button" disabled={phase === "checking"} onClick={onRetry}>{phase === "checking" ? <><span className="hu30-spinner" aria-hidden="true" /> Verificando acceso…</> : "Verificar acceso nuevamente"}</button></div>
    {["wrong_account", "verification", "authorized"].includes(phase)
      && <button className="secondary-button" type="button" onClick={onSwitchAccount}>Cerrar sesión y cambiar de cuenta</button>}
  </section></PublicShell>;
}

export default function AuthenticatedCoDebtorInvitationPage() {
  const [context] = useState(() => captureInvitationContext());
  const query = new URLSearchParams(window.location.search);
  const [selected] = useState(() => participationPath(query.get("participation")) ? query.get("participation") : null);
  const [listMode] = useState(() => query.get("participaciones") === "1");
  const participationRef = useRef(selected);
  const [state, setState] = useState({ phase: "checking" });
  const [refresh, setRefresh] = useState(0);
  const retry = () => setRefresh(value => value + 1);
  useEffect(() => {
    let active = true;
    setState({ phase: "checking" });
    const access = participationRef.current || listMode
      ? restoreInvitationSession().then(auth => ({ phase: auth?.session ? "authorized" : "authentication", participationId: participationRef.current }))
      : loadInvitationAccess(context);
    access.then(value => { if (active) {
      if (value.participationId) participationRef.current = value.participationId;
      setState(value);
    } })
      .catch(() => { if (active) setState({ phase: "error" }); });
    return () => { active = false; };
  }, [context, refresh, selected, listMode]);
  useEffect(() => {
    const { data } = supabase?.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) retry();
    }) || {};
    return () => data?.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (state.phase !== "verification") return;
    window.addEventListener("focus", retry);
    const untilExpiry = new Date(state.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(retry, Number.isFinite(untilExpiry)
      ? Math.max(0, Math.min(30000, untilExpiry)) : 30000);
    return () => {
      window.removeEventListener("focus", retry);
      window.clearTimeout(timer);
    };
  }, [state]);
  const returnToInvitation = () => {
    const path = participationRef.current ? participationPath(participationRef.current) : listMode ? "/co-deudor/invitacion?participaciones=1" : invitationReturnPath(context?.nonce);
    if (path) window.location.replace(path);
  };
  if (state.phase === "authentication") return <AuthPanel
    invitationContext={context?.nonce} onAuth={returnToInvitation} />;
  if (state.phase === "authorized" && listMode) return <CoDebtorParticipationList />;
  const participationId = selected || state.participationId;
  if (state.phase === "authorized" && participationId) return <CoDebtorParticipationReview key={participationId}
    participationId={participationId} onAccessError={status => setState({ phase: status === 401 ? "authentication" : "wrong_account" })}
    onConfirmed={id => { participationRef.current = id; window.history.replaceState(null, "", participationPath(id)); }} />;
  return <InvitationAccessView phase={state.phase} onRetry={retry} onSwitchAccount={async () => {
    setState({ phase: "checking" });
    try { await signOut(); returnToInvitation(); }
    catch { setState({ phase: "error" }); }
  }} />;
}
