import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { roles, sendAccessEmail, signOut, startGoogle } from "../services/auth";
import { PASSWORD_HINT, safeAuthError, validNewPassword } from "../lib/authPolicy";
import "./account-access.css";

export default function AccountAccess({ profile }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedbackArea, setFeedbackArea] = useState("");
  const [googleLinked, setGoogleLinked] = useState(null);
  const [identityError, setIdentityError] = useState(false);
  const [identityRevision, setIdentityRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setGoogleLinked(null); setIdentityError(false);
    if (profile.role !== roles.user) return;
    supabase.auth.getUser().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure || data?.user?.id !== profile.id) { setIdentityError(true); return; }
      setGoogleLinked((data.user.identities || []).some(identity => identity.provider === "google"));
    }).catch(() => { if (active) setIdentityError(true); });
    return () => { active = false; };
  }, [profile.id, profile.role, identityRevision]);
  const run = async (action, area = "password") => { setFeedbackArea(area); setBusy(true); setMessage(""); setError(""); try { await action(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } };
  const feedback = area => feedbackArea === area && (error || message) ? <p className={`account-access-feedback ${error ? "error-message" : "success-message"}`} role={error ? "alert" : "status"}>{error || message}</p> : null;
  return <section className="admin-surface account-access"><header className="account-access-heading"><i className="ti ti-shield-lock" aria-hidden="true" /><div><h2>Seguridad y acceso</h2><p>Administra tu contraseña y las sesiones de tu cuenta.</p></div></header>
    <div className="account-access-grid">
    <form onSubmit={event => { event.preventDefault(); run(async () => {
      if (!validNewPassword(password) || password !== confirmation) throw new Error("Revisa los requisitos y la confirmación de contraseña.");
      const { error: failure } = await supabase.auth.updateUser({ password, current_password: currentPassword });
      if (failure) throw new Error(safeAuthError(failure));
      setCurrentPassword(""); setPassword(""); setConfirmation(""); setMessage("Contraseña actualizada.");
    }); }}>
      <fieldset disabled={busy}><legend>Cambiar contraseña</legend>
        <label>Contraseña actual<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <small>{PASSWORD_HINT}</small>
        <label>Repetir nueva contraseña<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
        <button className="primary-button" disabled={!currentPassword || !validNewPassword(password) || password !== confirmation}>Guardar contraseña</button>
      </fieldset>
      {feedback("password")}
    </form>
    <div className="account-access-methods">
      <section><h3>Crear o recuperar contraseña</h3><p>Recibe un enlace en <strong>{profile.email}</strong> para definir una contraseña de RutaHogar.</p><p className="account-access-help">Si ingresas con Google, puedes crearla aquí sin conocer una contraseña anterior. Tu contraseña de Google no cambia.</p><button className="secondary-button" disabled={busy} onClick={() => run(async () => { setMessage(await sendAccessEmail(profile.email)); }, "recovery")}>Enviar enlace a mi correo</button>{feedback("recovery")}</section>
      {profile.role === roles.user && <section><h3>Acceso con Google</h3>{googleLinked === true ? <><span className="account-access-linked"><i className="ti ti-circle-check" aria-hidden="true" /> Google vinculado</span><p>Puedes iniciar sesión con Google usando {profile.email}.</p></> : googleLinked === false ? <><p>Vincula Google con el mismo correo de tu cuenta para conservar tus antecedentes.</p><button className="secondary-button" disabled={busy} onClick={() => run(() => startGoogle({ link: true }), "google")}><i className="ti ti-brand-google" aria-hidden="true" /> Vincular Google</button></> : identityError ? <><p>No pudimos comprobar la vinculación con Google.</p><button className="secondary-button" onClick={() => setIdentityRevision(value => value + 1)}>Volver a comprobar</button></> : <p role="status">Comprobando vinculación…</p>}{feedback("google")}</section>}
    </div></div>
    <footer className="account-access-sessions"><div><h3>Sesiones de tu cuenta</h3><p>Cierra el acceso en este dispositivo o en todos donde hayas iniciado sesión.</p></div><div className="account-access-actions"><button className="secondary-button" disabled={busy} onClick={() => run(() => signOut("local"), "sessions")}>Cerrar sesión aquí</button><button className="secondary-button" disabled={busy} onClick={() => run(() => signOut("global"), "sessions")}>Cerrar todas las sesiones</button></div></footer>
    {feedback("sessions")}
  </section>;
}
