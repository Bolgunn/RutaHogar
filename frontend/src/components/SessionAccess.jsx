import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../utils/supabase";
import { clearPrivateAuth, isInteractiveAuth, restoreAuth, signOut } from "../services/auth";
import { normalizeEmail, recoverySession } from "../lib/authPolicy";
import { withTimeout } from "../services/httpRequest";
import AccessFeedback from "./AccessFeedback";

export default function SessionAccess({ children }) {
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const current = useRef(null);
  const generation = useRef(0);
  useEffect(() => {
    let active = true, sequence = 0, timer;
    const verify = async () => {
      const request = ++sequence;
      try {
        const next = supabase ? await withTimeout(restoreAuth(), 15000, "No pudimos verificar tu sesión a tiempo. Reintenta sin ingresar datos de otra cuenta.") : { session: null, profile: null };
        if (!active || request !== sequence) return;
        if (recoverySession(next.session)) { window.location.replace("/definir-password"); return; }
        const expected = sessionStorage.getItem("RutaHogar_google_expected");
        if (window.location.pathname === "/auth/callback" && expected) {
          const original = JSON.parse(expected);
          sessionStorage.removeItem("RutaHogar_google_expected");
          if (next.profile?.id !== original.id || normalizeEmail(next.profile?.email) !== original.email) {
            await signOut("local");
            throw new Error("Selecciona Google con el mismo correo de tu cuenta. No se fusionaron tus datos.");
          }
        }
        if (window.location.pathname === "/auth/callback") {
          window.history.replaceState(null, "", "/auth/callback");
          if (!next.profile) throw new Error("No se completó el acceso. El enlace puede haber vencido o el proceso fue cancelado.");
        }
        if (current.current && current.current !== next.profile?.id) {
          clearPrivateAuth();
          Object.keys(sessionStorage).filter(key => key.startsWith("RutaHogar_") && !key.startsWith("RutaHogar_auth_send_")).forEach(key => sessionStorage.removeItem(key));
        }
        current.current = next.profile?.id || null;
        setAccount(next); setError(""); setChecking(false);
      } catch (failure) {
        if (active && request === sequence) { setError(failure.message || "No pudimos verificar tu sesión. Intenta nuevamente."); setChecking(false); }
      } finally { if (window.location.pathname === "/auth/callback") window.history.replaceState(null, "", "/auth/callback"); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(verify, 0); };
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || isInteractiveAuth()) return;
      generation.current++;
      if (event === "PASSWORD_RECOVERY") { window.location.replace("/definir-password"); return; }
      // Leaving an already validated account is not a failed OAuth callback.
      if (event === "SIGNED_OUT" && current.current && window.location.pathname === "/auth/callback") {
        sessionStorage.removeItem("RutaHogar_google_expected");
        window.history.replaceState(null, "", "/login");
      }
      if (event === "SIGNED_OUT" || (session?.user?.id && current.current && session.user.id !== current.current)) {
        ++sequence; clearPrivateAuth(); setAccount(null); setChecking(true);
      }
      schedule();
    }).data.subscription;
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedule);
    verify();
    return () => { active = false; ++sequence; clearTimeout(timer); subscription?.unsubscribe(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", schedule); };
  }, [revision]);
  if (checking) return <AccessFeedback message="Comprobando tu sesión…" />;
  if (error) return <AccessFeedback error message={error}><button className="primary-button" onClick={() => { setChecking(true); setRevision(value => value + 1); }}>Reintentar</button><button className="secondary-button" onClick={async () => { try { await signOut("local"); } finally { window.location.replace("/login"); } }}>Ir a iniciar sesión</button></AccessFeedback>;
  return children(account || { session: null, profile: null }, async next => {
    const version = generation.current;
    try {
      const fresh = await restoreAuth();
      if (version !== generation.current || fresh.profile?.id !== next.profile?.id) return;
      current.current = fresh.profile?.id || null; setAccount(fresh);
    } catch { setError("No pudimos verificar tu acceso. Reintenta para continuar."); }
  });
}
