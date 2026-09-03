import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured } from "../services/profileService";

// Pantalla de "define tu contraseña": la abre el enlace que reciben los
// ejecutivos creados por el admin (Edge Function create-executive) y también
// sirve para cualquier recuperación de contraseña de Supabase.
//
// El enlace vuelve con los tokens en el hash de la URL. Se captura en el
// ámbito del módulo —es decir, al importar, antes del primer render— porque
// App.jsx limpia el hash en su primer efecto y supabase-js también lo consume.
const initialHash = typeof window !== "undefined" ? window.location.hash : "";

const MIN_PASSWORD_LENGTH = 6;

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

      const { accessToken, refreshToken, errorDescription } = parseHashTokens(initialHash);

      if (errorDescription) {
        if (active) {
          setError(errorDescription);
          setStatus("invalid");
        }
        return;
      }

      try {
        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          if (active) {
            setEmail(data?.user?.email || "");
            setStatus("ready");
          }
          return;
        }

        // supabase-js pudo haber consumido el hash antes (detectSessionInUrl).
        const { data } = await supabase.auth.getSession();
        if (active) {
          if (data?.session?.user) {
            setEmail(data.session.user.email || "");
            setStatus("ready");
          } else {
            setStatus("invalid");
          }
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setError(err.message || "");
          setStatus("invalid");
        }
      }
    }

    restoreRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && password === confirmation && !saving;

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
      await supabase.auth.signOut();
      setStatus("done");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la contraseña. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-block">
      <div className="section-heading">
        <span className="eyebrow">Acceso a RutaHogar</span>
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
          Esta pantalla necesita Supabase configurado. Revisa VITE_SUPABASE_URL y
          VITE_SUPABASE_PUBLISHABLE_KEY.
        </div>
      )}

      {status === "invalid" && (
        <>
          <div className="error-message">
            El enlace no es válido o ya expiró. Pide a tu administrador que te reenvíe la invitación.
          </div>
          {error && <p className="inline-note">{error}</p>}
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
                La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.
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
    </section>
  );
}
