import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured } from "../services/profileService";
import { PASSWORD_HINT, recoverySession, safeAuthError, validNewPassword } from "../lib/authPolicy";
import { sendAccessEmail, signOut } from "../services/auth";
import AccessFeedback from "./AccessFeedback";
import "./access-feedback.css";

// Pantalla de "define tu contraseña": la abre el enlace que reciben los
// ejecutivos creados por el admin (Edge Function create-executive) y también
// sirve para cualquier recuperación de contraseña de Supabase.
//
// El enlace vuelve con los tokens en el hash de la URL. Se captura en el
// ámbito del módulo —es decir, al importar, antes del primer render— porque
// App.jsx limpia el hash en su primer efecto y supabase-js también lo consume.
const initialHash = typeof window !== "undefined" ? window.location.hash : "";

const MIN_PASSWORD_LENGTH = 8;

function parseHashTokens(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
    errorDescription: params.get("error_description"),
  };
}

export default function SetPassword({ onGoToLogin }) {
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreRecoverySession() {
      if (!isSupabaseDataConfigured) {
        if (active) setStatus("unavailable");
        return;
      }

      const { accessToken, refreshToken, type, errorDescription } = parseHashTokens(initialHash);

      if (errorDescription) {
        if (active) {
          setError("Solicita un nuevo enlace de recuperación.");
          setStatus("invalid");
        }
        window.history.replaceState(null, "", "/definir-password");
        return;
      }

      try {
        if (accessToken && refreshToken) {
          // The SDK may already have consumed the link and rotated its refresh
          // token. Reuse that session instead of replaying the original tokens.
          const existing = await supabase.auth.getSession();
          const { data, error: sessionError } = existing.data?.session?.access_token === accessToken ? existing : await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          const { data: verified, error: verificationError } = await supabase.auth.getUser();
          if (verificationError || !verified.user || verified.user.id !== data.session?.user?.id || !recoverySession(data.session, type)) throw new Error("invalid_recovery");
          if (active) {
            const claims = JSON.parse(atob(data.session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            if (claims.session_id) sessionStorage.setItem("RutaHogar_recovery_context", JSON.stringify({ userId: verified.user.id, sessionId: claims.session_id, type, expiresAt: Date.now() + 30 * 60 * 1000 }));
            setEmail(data?.user?.email || "");
            setStatus("ready");
          }
          return;
        }

        // supabase-js pudo haber consumido el hash antes (detectSessionInUrl).
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        let claims = {};
        try { claims = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* Invalid sessions fail verification below. */ }
        let saved = null;
        try { saved = JSON.parse(sessionStorage.getItem("RutaHogar_recovery_context")); } catch { /* Ignore invalid context. */ }
        const retainedType = saved?.userId === session?.user?.id && saved?.sessionId && saved.sessionId === claims.session_id && saved.expiresAt > Date.now() ? saved.type : undefined;
        const recovery = recoverySession(session, type || retainedType);
        const { data: verified, error: verificationError } = await supabase.auth.getUser();
        if (active) {
          if (data?.session?.user && recovery && verified.user?.id === session.user.id && !verificationError) {
            if (claims.session_id) sessionStorage.setItem("RutaHogar_recovery_context", JSON.stringify({ userId: session.user.id, sessionId: claims.session_id, type: type || retainedType || "recovery", expiresAt: saved?.expiresAt > Date.now() && retainedType ? saved.expiresAt : Date.now() + 30 * 60 * 1000 }));
            setEmail(data.session.user.email || "");
            setStatus("ready");
          } else {
            setStatus("invalid");
          }
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setError("El enlace no permite recuperar el acceso. Solicita otro.");
          setStatus("invalid");
        }
      } finally { window.history.replaceState(null, "", "/definir-password"); }
    }

    restoreRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const tooShort = password.length > 0 && !validNewPassword(password);
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit =
    validNewPassword(password) && password === confirmation && !saving;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // La sesión de recuperación se cierra para que el ejecutivo entre por el
      // login normal y la app arme su sesión como con cualquier otra cuenta.
      await signOut("global");
      sessionStorage.removeItem("RutaHogar_recovery_context");
      setStatus("done");
    } catch (err) {
      console.error(err);
      setError(safeAuthError(err));
    } finally {
      setSaving(false);
    }
  };

  if (status === "checking") return <AccessFeedback message="Validando el enlace…" />;

  return (
    <main className="access-feedback"><section className="access-feedback-window access-password">
      <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" className="access-feedback-logo" />
      <div className="section-heading">
        <h1>Define tu contraseña</h1>
        {status === "ready" && (
          <p>
            {email
              ? `Estás configurando el acceso de ${email}.`
              : "Elige la contraseña con la que entrarás a RutaHogar."}
          </p>
        )}
      </div>

      {status === "checking" && <p className="small-text">Validando el enlace…</p>}

      {status === "unavailable" && (
        <div className="error-message">
          El servicio de acceso no está disponible. Intenta más tarde o contacta a soporte.
        </div>
      )}

      {status === "invalid" && (
        <>
          <div className="error-message">
            El enlace no es válido o ya expiró. Solicita uno nuevo o pide a tu administrador que reenvíe la invitación.
          </div>
          {error && <p className="inline-note">{error}</p>}
          <form onSubmit={async event => { event.preventDefault(); setSaving(true); try { setError(await sendAccessEmail(email)); } catch (failure) { setError(failure.message); } finally { setSaving(false); } }}><label>Correo de tu cuenta<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label><button disabled={saving}>Solicitar nuevo enlace</button></form>
          <div className="form-actions" style={{ marginTop: "1.25rem" }}>
            <button type="button" className="secondary-button" onClick={onGoToLogin}>
              Ir a iniciar sesión
            </button>
          </div>
        </>
      )}

      {status === "done" && (
        <>
          <div className="success-message">
            Tu contraseña quedó guardada. Ya puedes iniciar sesión con ella.
          </div>
          <div className="form-actions" style={{ marginTop: "1.25rem" }}>
            <button type="button" onClick={onGoToLogin}>
              Iniciar sesión
            </button>
          </div>
        </>
      )}

      {status === "ready" && (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="error-message" style={{ marginBottom: "0.75rem" }}>
              {error}
            </div>
          )}

          <div className="field-wrap" style={{ marginBottom: "1rem" }}>
            <div className="field-label-row">
              <label htmlFor="new-password">Nueva contraseña</label>
            </div>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
              autoComplete="new-password"
            />
            {tooShort && (
              <span className="field-warning">
                {PASSWORD_HINT}
              </span>
            )}
          </div>

          <div className="field-wrap" style={{ marginBottom: "1rem" }}>
            <div className="field-label-row">
              <label htmlFor="confirm-password">Repite la contraseña</label>
            </div>
            <input
              id="confirm-password"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Vuelve a escribirla"
              autoComplete="new-password"
            />
            {mismatch && <span className="field-warning">Las contraseñas no coinciden.</span>}
          </div>

          <div className="form-actions">
            <button type="submit" disabled={!canSubmit}>
              {saving ? "Guardando…" : "Guardar contraseña"}
            </button>
          </div>
        </form>
      )}
    </section></main>
  );
}
