import React, { useState } from "react";
import { upsertProfile } from "../services/profileService";
import { assertAccountSession, restoreAuth, signOut } from "../services/auth";
import { validateRut, formatRut } from "../utils/rut";
import { formatPhone, normalizePhone, onlyPhoneDigits, parseChileanPhone, PHONE_ERROR_MESSAGE } from "../utils/phone";
import { BirthDateField, buildBirthDateIso, dayOptions, getBirthDateError, monthOptions, yearOptions } from "./AuthPanel";
import "./complete-access-profile.css";

export default function CompleteAccessProfile({ profile, onComplete }) {
  const [form, setForm] = useState(() => {
    const rut = String(profile.rut || "").replace(/[^0-9kK]/g, "");
    const [year = "", month = "", day = ""] = String(profile.birth_date || "").slice(0, 10).split("-");
    return { nombre: profile.nombre || "", apellido_paterno: profile.apellido_paterno || "", apellido_materno: profile.apellido_materno || "", rut_number: rut.slice(0, -1), rut_dv: rut.slice(-1).toUpperCase(), phone: parseChileanPhone(profile.phone), birth_day: day, birth_month: month, birth_year: year };
  });
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = event => {
    const { name, value } = event.target;
    if (name === "rut_number" && value.includes("-")) {
      const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
      setForm(previous => ({ ...previous, rut_number: clean.slice(0, -1).replace(/\D/g, "").slice(0, 8), rut_dv: clean.slice(-1) }));
      return;
    }
    const next = name === "phone" ? onlyPhoneDigits(value, 8)
      : name === "rut_number" ? value.replace(/\D/g, "").slice(0, 8)
      : name === "rut_dv" ? value.toUpperCase().replace(/[^0-9K]/g, "").slice(0, 1)
      : name.startsWith("birth_") ? value.replace(/\D/g, "").slice(0, name === "birth_year" ? 4 : 2) : value;
    setForm(previous => ({ ...previous, [name]: next }));
  };
  const submit = async event => {
    event.preventDefault(); setError(""); setActiveDropdown(null);
    if (![form.nombre, form.apellido_paterno, form.apellido_materno].every(value => value.trim())) { setError("Ingresa tu nombre y ambos apellidos, igual que en el registro."); return; }
    const rut = `${form.rut_number}-${form.rut_dv}`;
    if (!validateRut(rut)) { setError("Ingresa un RUT válido y su dígito verificador."); return; }
    if (!normalizePhone(form.phone)) { setError(PHONE_ERROR_MESSAGE); return; }
    const dateError = getBirthDateError(form);
    if (dateError) { setError(dateError); return; }
    setBusy(true);
    try {
      await assertAccountSession(profile.id);
      const names = { nombre: form.nombre.trim(), apellido_paterno: form.apellido_paterno.trim(), apellido_materno: form.apellido_materno.trim() };
      await upsertProfile(profile.id, Object.values(names).join(" "), "usuario", profile.onboarding_data, { ...names, rut: formatRut(rut), phone: normalizePhone(form.phone), birth_date: buildBirthDateIso(form) });
      await onComplete(await restoreAuth());
    } catch { setError("No pudimos completar el perfil. Si ya tienes una cuenta con este RUT, recupera su acceso; no se fusionarán cuentas."); }
    finally { setBusy(false); }
  };
  return <main className="auth-root auth-complete">
    <aside className="auth-left"><div className="auth-left-content"><h2>Un perfil completo para <span className="gold">dar tu próximo paso</span></h2><p>Completa tus datos para continuar con tu precalificación y guardar tu progreso en RutaHogar.</p><div className="auth-left-divider" /><p className="auth-complete-reassurance">Tus antecedentes se mantienen asociados a tu cuenta.</p></div></aside>
    <section className="auth-right"><div className="auth-right-inner">
      <div className="auth-right-brand"><img className="auth-right-brand-logo" src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" /></div>
      <h1>Completa tu perfil</h1><p className="auth-right-sub">Tu correo ya está verificado. Sólo faltan los datos de tu cuenta.</p>
      <form onSubmit={submit}><fieldset disabled={busy} className="auth-complete-fields"><legend className="sr-only">Datos de tu cuenta</legend>
        {[["nombre", "Nombre", "given-name"], ["apellido_paterno", "Apellido paterno", "family-name"], ["apellido_materno", "Apellido materno", "family-name"]].map(([name, text, autoComplete]) => <div className="auth-field" key={name}><label className="auth-field-label" htmlFor={`complete-${name}`}>{text}</label><input id={`complete-${name}`} name={name} value={form[name]} onChange={change} autoComplete={autoComplete} maxLength={100} required /></div>)}
        <div className="auth-field"><label className="auth-field-label" htmlFor="complete-rut">RUT</label><div className="auth-complete-rut"><input id="complete-rut" name="rut_number" value={form.rut_number} onChange={change} inputMode="numeric" placeholder="12345678" required /><span aria-hidden="true">–</span><input aria-label="Dígito verificador" name="rut_dv" value={form.rut_dv} onChange={change} maxLength={1} placeholder="K" required /></div></div>
        <div className="auth-field"><label className="auth-field-label" htmlFor="complete-phone">Teléfono</label><div className="auth-phone"><span className="auth-phone-prefix">+56 9</span><input id="complete-phone" type="tel" name="phone" value={formatPhone(form.phone)} onChange={change} inputMode="numeric" maxLength={9} placeholder="1234 5678" autoComplete="tel-national" required /></div></div>
        <div className="auth-field"><span className="auth-field-label">Fecha de nacimiento</span><div className="auth-birth-grid" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveDropdown(null); }}>{[["birth_day", "DD", "Día de nacimiento", dayOptions], ["birth_month", "MM", "Mes de nacimiento", monthOptions], ["birth_year", "AAAA", "Año de nacimiento", yearOptions]].map(([name, placeholder, ariaLabel, options]) => <BirthDateField key={name} {...{ name, placeholder, ariaLabel, options, activeDropdown }} value={form[name]} maxLength={name === "birth_year" ? 4 : 2} onChange={change} onOpen={setActiveDropdown} onClose={() => setActiveDropdown(null)} onSelect={(field, value) => setForm(previous => ({ ...previous, [field]: value }))} onBlur={() => { if (name !== "birth_year" && form[name]) setForm(previous => ({ ...previous, [name]: previous[name].padStart(2, "0") })); }} />)}</div></div>
        <div className="auth-field"><label className="auth-field-label" htmlFor="complete-email">Correo verificado</label><input id="complete-email" type="email" value={profile.email || ""} readOnly autoComplete="email" /></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Guardando…" : "Guardar y continuar"}</button>
        <button type="button" className="auth-btn-outline auth-complete-exit" disabled={busy} onClick={async () => { setBusy(true); try { await signOut("local"); } catch { setError("No pudimos cerrar la sesión. Intenta nuevamente."); setBusy(false); } }}>Salir e iniciar con otra cuenta</button>
      </fieldset></form>
    </div></section>
  </main>;
}
