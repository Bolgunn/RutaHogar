import React, { useMemo, useState } from "react";
import DataConsent from "./DataConsent";
import { formatPhone, normalizePhone, onlyPhoneDigits, PHONE_ERROR_MESSAGE } from "../utils/phone";

function getPasswordStrength(password) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  if (!password) return { label: "Débil", level: "weak", percent: 0 };
  if (score <= 2) return { label: "Débil", level: "weak", percent: 25 };
  if (score === 3) return { label: "Media", level: "medium", percent: 50 };
  if (score === 4) return { label: "Segura", level: "strong", percent: 75 };
  return { label: "Muy segura", level: "very-strong", percent: 100 };
}

const scoreCopy = {
  Alto: "Excelente. Tu perfil está bien posicionado para iniciar el proceso de compra. Crea tu cuenta para guardar este resultado y recibir tu plan personalizado.",
  Medio: "Buen punto de partida. Crea tu cuenta para ver tu plan de mejora detallado y hacer seguimiento de tu progreso financiero.",
  Bajo: "Hay espacio para mejorar. Crea tu cuenta para recibir un plan paso a paso que te acerque a tu objetivo inmobiliario.",
};

export default function SignupOffer({ result, anonBirthDate, onSignup, onContinueWithout, loading, error }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [consentData, setConsentData] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "phone" ? onlyPhoneDigits(value, 8) : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.full_name.trim()) { setFormError("Ingresa tu nombre para continuar."); return; }
    if (!form.email) { setFormError("Ingresa tu correo electrónico."); return; }
    const normalizedPhone = normalizePhone(form.phone);
    if (!form.phone.trim()) {
      setFormError("Ingresa tu teléfono para crear la cuenta.");
      return;
    }
    if (!normalizedPhone) {
      setFormError(PHONE_ERROR_MESSAGE);
      return;
    }
    if (!form.password || form.password.length < 6) {
      setFormError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (!consentData) {
      setFormError("Debes aceptar la autorización de datos para crear tu cuenta.");
      return;
    }
    onSignup({
      full_name: form.full_name.trim(),
      email: form.email,
      phone: normalizedPhone,
      password: form.password,
      birth_date: anonBirthDate || "",
      consentData,
    });
  };

  if (showConsent) {
    return (
      <DataConsent
        profile={null}
        onAccept={(cd) => { setConsentData(cd); setShowConsent(false); }}
        onBack={() => setShowConsent(false)}
        readonly={!!consentData}
      />
    );
  }

  const scoreNum = result?.score != null ? Math.round(result.score) : "—";
  const classification = result?.classification || "—";

  return (
    <section className="signup-offer-panel">

      {/* Score summary */}
      <div className="signup-offer-score-block">
        <span className="signup-offer-score-label">Tu score orientativo</span>
        <div className="signup-offer-score-display">
          <span className="signup-offer-score-number">{scoreNum}</span>
          <span className={`signup-offer-badge signup-offer-badge-${(classification || "").toLowerCase()}`}>
            {classification}
          </span>
        </div>
        <p className="signup-offer-score-copy">
          {scoreCopy[classification] || scoreCopy["Medio"]}
        </p>
      </div>

      {/* Benefits */}
      <div className="signup-offer-benefits">
        <h3 className="signup-offer-benefits-title">¿Por qué crear una cuenta?</h3>
        <ul className="signup-offer-benefit-list">
          {[
            "Guarda tu historial de evaluaciones",
            "Accede a tu plan de mejora personalizado",
            "Haz seguimiento de tu progreso financiero",
            "Recibe notificaciones cuando estés listo para comprar",
          ].map((item) => (
            <li key={item} className="signup-offer-benefit-item">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="9" fill="rgba(36,99,84,0.12)" />
                <polyline points="5 9 7.5 11.5 13 6.5" stroke="#2D8A4E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Signup form */}
      <form className="signup-offer-form" onSubmit={handleSubmit} noValidate>
        <h3 className="signup-offer-form-title">Crea tu cuenta gratuita</h3>

        <label>
          Nombre
          <input
            type="text"
            name="full_name"
            value={form.full_name}
            onChange={handleChange}
            placeholder="Ej: María González"
            autoComplete="name"
          />
        </label>

        <label>
          Email
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="nombre@correo.cl"
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <label>
          Teléfono
          <div className="phone-input">
            <span>+56 9</span>
            <input
              type="tel"
              inputMode="numeric"
              name="phone"
              value={formatPhone(form.phone)}
              onChange={handleChange}
              maxLength="9"
              placeholder="1234 5678"
              autoComplete="tel"
              aria-label="8 dígitos restantes del teléfono"
            />
          </div>
        </label>

        <label>
          Contraseña
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </label>

        {form.password && (
          <div className={`password-meter ${passwordStrength.level}`}>
            <div className="password-meter-header">
              <span>Seguridad de contraseña</span>
              <strong>{passwordStrength.label}</strong>
            </div>
            <div className="password-meter-track" aria-hidden="true">
              <span style={{ width: `${passwordStrength.percent}%` }} />
            </div>
          </div>
        )}

        {/* DataConsent stage 2 */}
        <div className="signup-offer-consent-block">
          {consentData ? (
            <div className="consent-info">
              <span className="consent-info-icon">✓ </span>
              <span>
                Autorización de tratamiento de datos aceptada.{" "}
                <button type="button" className="consent-ref-link" onClick={() => setShowConsent(true)}>
                  Ver detalle
                </button>
              </span>
            </div>
          ) : (
            <div className="consent-required">
              <p>Para crear tu cuenta debes aceptar la autorización de tratamiento de datos personales.</p>
              <button type="button" className="consent-accept-btn" onClick={() => setShowConsent(true)}>
                Ver términos y condiciones
              </button>
            </div>
          )}
        </div>

        {(formError || error) && (
          <div className="error-message" role="alert">{formError || error}</div>
        )}

        <button type="submit" disabled={loading || !consentData}>
          {loading ? "Creando cuenta..." : "Crear cuenta y guardar resultado"}
        </button>
      </form>

      {/* Continue without account */}
      <div className="signup-offer-skip">
        <button type="button" className="secondary-button" onClick={onContinueWithout} disabled={loading}>
          Salir
        </button>
        <p className="signup-offer-skip-note">
          Tu evaluación no se guardará si continúas sin crear una cuenta.
        </p>
      </div>

    </section>
  );
}
