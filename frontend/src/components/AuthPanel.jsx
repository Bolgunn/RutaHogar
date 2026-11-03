import '../styles/AuthPanel.css';
import { validateRut } from "../utils/rut";
import React, { useMemo, useRef, useState } from "react";
import { isSupabaseDataConfigured } from "../services/profileService";
import { calculateAge } from "../utils/helpers";
import { roleLabels, roles, signIn, signUp, sendAccessEmail, startGoogle } from "../services/auth";
import { getPasswordStrength, PASSWORD_HINT, SIGNUP_DATA_REJECTED, validNewPassword } from "../lib/authPolicy";
import { formatPhone, normalizePhone, onlyPhoneDigits, PHONE_ERROR_MESSAGE } from "../utils/phone";
import { trackSignUp } from "../lib/analytics";

const currentYear = new Date().getFullYear();
export const dayOptions = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  return { value, label: value };
});
export const monthOptions = [
  ["01", "~ Enero"],
  ["02", "~ Febrero"],
  ["03", "~ Marzo"],
  ["04", "~ Abril"],
  ["05", "~ Mayo"],
  ["06", "~ Junio"],
  ["07", "~ Julio"],
  ["08", "~ Agosto"],
  ["09", "~ Septiembre"],
  ["10", "~ Octubre"],
  ["11", "~ Noviembre"],
  ["12", "~ Diciembre"],
].map(([value, month]) => ({ value, label: `${value} ${month}` }));
export const yearOptions = Array.from({ length: currentYear - 18 - 1900 + 1 }, (_, index) => {
  const value = String(currentYear - 18 - index);
  return { value, label: value };
});

function onlyDigits(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function buildBirthDateIso({ birth_day, birth_month, birth_year }) {
  const day = onlyDigits(birth_day, 2).padStart(2, "0");
  const month = onlyDigits(birth_month, 2).padStart(2, "0");
  const year = onlyDigits(birth_year, 4);
  if (year.length !== 4 || day.length !== 2 || month.length !== 2) return "";
  return `${year}-${month}-${day}`;
}

export function getBirthDateError(form) {
  if (!form.birth_day || !form.birth_month || !form.birth_year) {
    return "Ingresa tu fecha de nacimiento para crear la cuenta.";
  }

  const birthDate = buildBirthDateIso(form);
  const dayValue = Number(onlyDigits(form.birth_day, 2));
  const monthValue = Number(onlyDigits(form.birth_month, 2));
  const yearValue = Number(onlyDigits(form.birth_year, 4));
  const birth = new Date(`${birthDate}T00:00:00`);
  const [year, month, day] = birthDate.split("-").map(Number);
  const isInRange =
    dayValue >= 1 &&
    dayValue <= 31 &&
    monthValue >= 1 &&
    monthValue <= 12 &&
    yearValue >= 1900 &&
    yearValue <= currentYear;
  const isValidDate =
    isInRange &&
    Number.isFinite(birth.getTime()) &&
    birth.getFullYear() === year &&
    birth.getMonth() === month - 1 &&
    birth.getDate() === day;

  if (!isValidDate) return "Ingresa una fecha de nacimiento válida.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (birth > today) return "Ingresa una fecha de nacimiento válida.";

  if (calculateAge(birthDate) < 18) return "Debes ser mayor de 18 años para registrarte.";

  return "";
}





const strengthColors = {
  weak: "#b42318",
  medium: "#d97706",
  strong: "#2d8a4e",
  "very-strong": "#166534",
};

export function BirthDateField({ name, value, placeholder, ariaLabel, maxLength, options, activeDropdown, onOpen, onClose, onBlur, onChange, onSelect }) {
  const isOpen = activeDropdown === name;

  return (
    <div className="auth-dd-field">
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => onOpen(name)}
        onBlur={onBlur}
        inputMode="numeric"
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        autoComplete="off"
      />
      {isOpen && (
        <div className="auth-dd-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(name, option.value);
                onClose();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function AuthPanel({ onAuth, onBack, onModeChange, initialMode = "signin", onEvalAnon, onPortalAnon, invitationContext = null }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    rut_number: "",
    rut_dv: "",
    phone: "",
    birth_day: "",
    birth_month: "",
    birth_year: "",
    email: "",
    password: "",
    role: roles.user,
  });
  const [verificationPending, setVerificationPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeDateDropdown, setActiveDateDropdown] = useState(null);
  const passwordRef = useRef(null);
  const formRef = useRef(null);
  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  React.useEffect(() => {
    setError("");
    setNotice("");
    setConfirmationNeeded(false);
  }, [mode]);

  const changeMode = (nextMode) => {
    setConfirmationNeeded(false);
    setMode(nextMode);
    if (onModeChange) onModeChange(nextMode);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "email") setConfirmationNeeded(false);
    setForm((prev) => {
      const nextValue =
        name === "phone"
          ? onlyPhoneDigits(value, 8)
          : name === "rut_number"
            ? onlyDigits(value, 8)
            : name === "rut_dv"
              ? value.slice(0, 1).toUpperCase().replace(/[^0-9K]/g, "")
              : name === "birth_day" || name === "birth_month"
                ? onlyDigits(value, 2)
                : name === "birth_year"
                  ? onlyDigits(value, 4)
                  : value;
      return { ...prev, [name]: nextValue };
    });

  };

  const handleBirthDateSelect = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const normalizeBirthDatePart = (name) => {
    setForm((prev) => {
      if (name !== "birth_day" && name !== "birth_month") return prev;
      const digits = onlyDigits(prev[name], 2);
      if (!digits) return prev;
      return { ...prev, [name]: digits.padStart(2, "0") };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Ingresa email y contrasena para continuar.");
      return;
    }

    if (mode === "signup" && !form.nombre.trim()) {
      setError("Ingresa tu nombre para crear la cuenta.");
      return;
    }
    if (mode === "signup" && !form.apellido_paterno.trim()) {
      setError("Ingresa tu apellido paterno para crear la cuenta.");
      return;
    }
    if (mode === "signup" && !form.apellido_materno.trim()) {
      setError("Ingresa tu apellido materno para crear la cuenta.");
      return;
    }

    if (mode === "signup") {
      if (!form.rut_number || !form.rut_dv) {
        setError("Ingresa tu RUT para crear la cuenta.");
        return;
      }
      if (!validateRut(`${form.rut_number}-${form.rut_dv}`)) {
        setError("El RUT ingresado no es válido.");
        return;
      }
    }

    const normalizedPhone = normalizePhone(form.phone);
    const birthDate = buildBirthDateIso(form);

    if (mode === "signup" && !form.phone.trim()) {
      setError("Ingresa tu teléfono para crear la cuenta.");
      return;
    }

    if (mode === "signup" && !normalizedPhone) {
      setError(PHONE_ERROR_MESSAGE);
      return;
    }

    if (mode === "signup") {
      const birthDateError = getBirthDateError(form);
      if (birthDateError) {
        setError(birthDateError);
        return;
      }
      if (!validNewPassword(form.password)) {
        setError(PASSWORD_HINT);
        return;
      }
    }

    setConfirmationNeeded(false);
    setLoading(true);
    try {
      const auth =
        mode === "signin"
          ? await signIn(form)
          : await signUp({ 
              ...form, invitationContext,
              full_name: `${form.nombre} ${form.apellido_paterno} ${form.apellido_materno}`.trim(),
              phone: normalizedPhone, 
              birth_date: birthDate, 
              rut: `${form.rut_number}-${form.rut_dv}` 
            });
      if (mode === "signup") trackSignUp({ method: "auth_panel" });
      if (auth.emailConfirmationRequired) { if (invitationContext) { setVerificationPending(true); return; } setNotice("Revisa tu correo para confirmar la cuenta. Si ya tienes una cuenta, inicia sesión o recupera tu acceso."); return; }
      onAuth(auth);
    } catch (err) {
      setConfirmationNeeded(mode === "signin" && err?.code === "email_not_confirmed");
      const fallback =
        mode === "signin"
          ? "No se pudo iniciar sesión. Revisa tu correo y contraseña."
          : "No se pudo crear la cuenta.";
      const message = err?.message || fallback;
      const safeSignupMessages = new Set([
        SIGNUP_DATA_REJECTED,
        "No se pudo crear la cuenta.",
        "La cuenta fue creada, pero no se pudo guardar el perfil.",
        "Este correo ya esta registrado. Intenta iniciar sesión.",
      ]);
      setError(
        mode === "signup"
          ? safeSignupMessages.has(message) ? message : fallback
          : message.includes("Cannot read") ? fallback : message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      
      <div className="auth-root">
        {/* Left Panel — Brand */}
        <div className="auth-left">
          <div className="auth-left-glow-1" />
          <div className="auth-left-glow-2" />
          <div className="auth-left-ambient"></div>
          <div className="auth-left-content">
            <div className="auth-left-badge">
              <span className="auth-left-badge-dot" />
              Precalificación inmobiliaria
            </div>
            <h2>Descubre si estás listo para <span className="gold">comprar tu primera vivienda</span></h2>
            <p>Conoce tu posición financiera antes de solicitar un crédito hipotecario. Puedes precalificar sin documentos ni claves bancarias.</p>
            <div className="auth-left-divider" />
            <ul className="auth-left-features">
              <li className="auth-left-feature">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Resultado en segundos
              </li>
              <li className="auth-left-feature">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Privacidad total
              </li>
              <li className="auth-left-feature">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Sin documentos
              </li>
            </ul>
            {onEvalAnon && (
              <button type="button" className="auth-left-cta" onClick={onEvalAnon}>
                Evaluar tu perfil gratis
                <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
            {onPortalAnon && (
              <button type="button" className="auth-left-cta auth-left-cta--secondary" onClick={onPortalAnon}>
                Buscar propiedades
                <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Right Panel — Form */}
        <div className="auth-right">
          <div className="auth-right-inner">

            <div className="auth-right-brand">
              <img className="auth-right-brand-logo" src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
            </div>

            <h1>{mode === "signin" ? "Bienvenido de vuelta" : "Crea tu cuenta"}</h1>
            <p className="auth-right-sub">
              {invitationContext ? "Accede a tu cuenta para volver a la invitación de co-deudor." : mode === "signin"
                ? "Ingresa tus credenciales para acceder a tu precalificación."
                : "Regístrate para guardar tu score y seguimiento financiero."}
            </p>

            {!isSupabaseDataConfigured && (
              <div className="auth-right-supabase-note">
                Autenticación de respaldo activa: configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar Supabase.
              </div>
            )}

            {verificationPending && <div role="status">
              <p>Revisa tu correo y confirma tu cuenta. Después podrás volver a la invitación.</p>
              <button type="button" onClick={() => { setVerificationPending(false); changeMode("signin"); }}>Ya confirmé mi correo: iniciar sesión</button>
            </div>}
            {!verificationPending && <form ref={formRef} onSubmit={submit}>
              <div className="auth-seg" aria-label="Modo de acceso">
                <button type="button" className={`auth-seg-btn ${mode === "signin" ? "is-active" : ""}`} onClick={() => changeMode("signin")}>
                  Entrar
                </button>
                <button type="button" className={`auth-seg-btn ${mode === "signup" ? "is-active" : ""}`} onClick={() => changeMode("signup")}>
                  Crear cuenta
                </button>
              </div>

              {mode === "signup" && (
                <>
                  <div className="auth-field">
                    <label className="auth-field-label">Nombre</label>
                    <input id="auth-nombre" type="text" name="nombre" value={form.nombre} onChange={handleChange} placeholder="Ej: Isaias" autoComplete="given-name" />
                  </div>
                  <div className="auth-field">
                    <label className="auth-field-label">Apellido Paterno</label>
                    <input id="auth-apellido-paterno" type="text" name="apellido_paterno" value={form.apellido_paterno} onChange={handleChange} placeholder="Ej: Carte" autoComplete="family-name" />
                  </div>
                  <div className="auth-field">
                    <label className="auth-field-label">Apellido Materno</label>
                    <input id="auth-apellido-materno" type="text" name="apellido_materno" value={form.apellido_materno} onChange={handleChange} placeholder="Ej: Pérez" autoComplete="family-name" />
                  </div>

                  <div className="auth-field">
                    <label className="auth-field-label">RUT</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: '8px' }}>
                      <input
                        type="text"
                        name="rut_number"
                        value={form.rut_number}
                        onChange={handleChange}
                        placeholder="12345678"
                        maxLength="8"
                        inputMode="numeric"
                      />
                      <input
                        type="text"
                        name="rut_dv"
                        value={form.rut_dv}
                        onChange={handleChange}
                        placeholder="K"
                        maxLength="1"
                        style={{ textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label className="auth-field-label" htmlFor="auth-phone">Teléfono</label>
                    <div className="auth-phone">
                      <span className="auth-phone-prefix">+56 9</span>
                      <input
                        id="auth-phone"
                        type="tel"
                        name="phone"
                        value={formatPhone(form.phone)}
                        onChange={handleChange}
                        inputMode="numeric"
                        maxLength="9"
                        placeholder="1234 5678"
                        aria-label="8 dígitos restantes del teléfono"
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label className="auth-field-label">Fecha de nacimiento</label>
                    <div className="auth-birth-grid" onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setActiveDateDropdown(null);
                      }
                    }}>
                      <BirthDateField
                        name="birth_day"
                        value={form.birth_day}
                        onChange={handleChange}
                        onOpen={setActiveDateDropdown}
                        onClose={() => setActiveDateDropdown(null)}
                        onSelect={handleBirthDateSelect}
                        onBlur={() => normalizeBirthDatePart("birth_day")}
                        maxLength="2"
                        placeholder="DD"
                        ariaLabel="Día de nacimiento"
                        options={dayOptions}
                        activeDropdown={activeDateDropdown}
                      />
                      <BirthDateField
                        name="birth_month"
                        value={form.birth_month}
                        onChange={handleChange}
                        onOpen={setActiveDateDropdown}
                        onClose={() => setActiveDateDropdown(null)}
                        onSelect={handleBirthDateSelect}
                        onBlur={() => normalizeBirthDatePart("birth_month")}
                        maxLength="2"
                        placeholder="MM"
                        ariaLabel="Mes de nacimiento"
                        options={monthOptions}
                        activeDropdown={activeDateDropdown}
                      />
                      <BirthDateField
                        name="birth_year"
                        value={form.birth_year}
                        onChange={handleChange}
                        onOpen={setActiveDateDropdown}
                        onClose={() => setActiveDateDropdown(null)}
                        onSelect={handleBirthDateSelect}
                        maxLength="4"
                        placeholder="AAAA"
                        ariaLabel="Año de nacimiento"
                        options={yearOptions}
                        activeDropdown={activeDateDropdown}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="auth-field">
                <label className="auth-field-label" htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" name="email" value={form.email} onChange={handleChange} placeholder="nombre@correo.cl" autoComplete="email" spellCheck={false} />
              </div>

              <div className="auth-field">
                <label className="auth-field-label" htmlFor="auth-password">Contraseña</label>
                <input
                  id="auth-password"
                  ref={passwordRef}
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder={mode === "signin" ? "Tu contraseña" : "Mínimo 8 caracteres"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>

              {mode === "signup" && (
                <div className="auth-pwd-meter">
                  <div className="auth-pwd-header">
                    <span className="auth-pwd-label">Seguridad</span>
                    <span className="auth-pwd-level" style={{ color: strengthColors[passwordStrength.level] }}>{passwordStrength.label}</span>
                  </div>
                  <div className="auth-pwd-track">
                    <div className="auth-pwd-fill" style={{ width: `${passwordStrength.percent}%`, background: strengthColors[passwordStrength.level] }} />
                  </div>
                  <p className="auth-pwd-hint">{PASSWORD_HINT}</p>
                </div>
              )}

              {error && (
                <div className="auth-error" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {error}
                  {confirmationNeeded && <button type="button" className="auth-confirmation-link" disabled={loading} onClick={async () => { setLoading(true); try { setNotice(await sendAccessEmail(form.email, "signup")); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }}>Solicitar otro enlace</button>}
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Validando…" : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
              {notice && <p className="auth-access-notice" role="status">{notice}</p>}
              {mode === "signin" && <button type="button" className="auth-recovery-link" disabled={loading} onClick={async () => { setLoading(true); setError(""); try { setNotice(await sendAccessEmail(form.email, "recovery")); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }}>¿Olvidaste tu contraseña?</button>}
              <div className="auth-provider-divider"><span>o</span></div>
              <button type="button" className="auth-google-button" disabled={loading} onClick={async () => { setLoading(true); setError(""); try { await startGoogle(); } catch (failure) { setError(failure.message); setLoading(false); } }}>
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.9-3.6-11.5-8.4H5.7v5.2A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.5 27.7a12.3 12.3 0 0 1 0-7.4v-5.2H5.7a20 20 0 0 0 0 17.8l6.8-5.2Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15.1l6.8 5.2C14.1 15.5 18.7 11.9 24 11.9Z"/></svg>
                Continuar con Google
              </button>
            </form>}
          </div>
        </div>
      </div>
    </>
  );
}



