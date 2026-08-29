import React, { useMemo, useRef, useState } from "react";
import { isSupabaseDataConfigured } from "../services/profileService";
import { calculateAge } from "../utils/helpers";
import { roleLabels, roles, signIn, signUp } from "../services/auth";
import { formatPhone, normalizePhone, onlyPhoneDigits, PHONE_ERROR_MESSAGE } from "../utils/phone";

const currentYear = new Date().getFullYear();
const dayOptions = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  return { value, label: value };
});
const monthOptions = [
  ["01", "Enero"],
  ["02", "Febrero"],
  ["03", "Marzo"],
  ["04", "Abril"],
  ["05", "Mayo"],
  ["06", "Junio"],
  ["07", "Julio"],
  ["08", "Agosto"],
  ["09", "Septiembre"],
  ["10", "Octubre"],
  ["11", "Noviembre"],
  ["12", "Diciembre"],
].map(([value, month]) => ({ value, label: `${value} ${month}` }));
const yearOptions = Array.from({ length: currentYear - 18 - 1900 + 1 }, (_, index) => {
  const value = String(currentYear - 18 - index);
  return { value, label: value };
});

function onlyDigits(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function buildBirthDateIso({ birth_day, birth_month, birth_year }) {
  const day = onlyDigits(birth_day, 2).padStart(2, "0");
  const month = onlyDigits(birth_month, 2).padStart(2, "0");
  const year = onlyDigits(birth_year, 4);
  if (year.length !== 4 || day.length !== 2 || month.length !== 2) return "";
  return `${year}-${month}-${day}`;
}

function getBirthDateError(form) {
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

function getPasswordStrength(password) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  if (!password) return { label: "Débil", level: "weak", percent: 0, score };
  if (score <= 2) return { label: "Débil", level: "weak", percent: 25, score };
  if (score === 3) return { label: "Media", level: "medium", percent: 50, score };
  if (score === 4) return { label: "Segura", level: "strong", percent: 75, score };
  return { label: "Muy segura", level: "very-strong", percent: 100, score };
}

function BirthDateField({ name, value, placeholder, ariaLabel, maxLength, options, activeDropdown, onOpen, onClose, onBlur, onChange, onSelect }) {
  const isOpen = activeDropdown === name;

  return (
    <div className="date-dropdown-field">
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
        <div className="date-dropdown-menu" role="listbox">
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

export default function AuthPanel({ onAuth, onBack, onModeChange, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    birth_day: "",
    birth_month: "",
    birth_year: "",
    email: "",
    password: "",
    role: roles.user,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWeakPasswordConfirm, setShowWeakPasswordConfirm] = useState(false);
  const [activeDateDropdown, setActiveDateDropdown] = useState(null);
  const passwordRef = useRef(null);
  const formRef = useRef(null);
  const weakPasswordConfirmedRef = useRef(false);
  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    if (onModeChange) onModeChange(nextMode);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      const nextValue =
        name === "phone"
          ? onlyPhoneDigits(value, 8)
          : name === "birth_day" || name === "birth_month"
            ? onlyDigits(value, 2)
            : name === "birth_year"
              ? onlyDigits(value, 4)
              : value;
      return { ...prev, [name]: nextValue };
    });

    if (name === "password") {
      weakPasswordConfirmedRef.current = false;
      setShowWeakPasswordConfirm(false);
    }
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

    if (mode === "signup" && !form.full_name.trim()) {
      setError("Ingresa tu nombre para crear la cuenta.");
      return;
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
      if (form.password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres para crear la cuenta.");
        return;
      }
      if (passwordStrength.level === "weak" && !weakPasswordConfirmedRef.current) {
        setShowWeakPasswordConfirm(true);
        setError("");
        return;
      }
    }

    setLoading(true);
    try {
      const auth =
        mode === "signin"
          ? await signIn(form)
          : await signUp({ ...form, phone: normalizedPhone, birth_date: birthDate });
      onAuth(auth);
    } catch (err) {
      const fallback =
        mode === "signin"
          ? "No se pudo iniciar sesión. Revisa tu correo y contraseña."
          : "No se pudo crear la cuenta.";
      const message = err?.message || fallback;
      const safeSignupMessages = new Set([
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
    <section className="auth-panel">
      {onBack && (
        <div style={{ padding: "16px 24px 0", gridColumn: "1 / -1" }}>
          <button type="button" className="secondary-button compact-button" onClick={onBack}>
            ← Volver
          </button>
        </div>
      )}
      <div className="auth-copy">
        <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
        <span className="eyebrow">Acceso a RutaHogar</span>
        <h1>Ingresa a tu pre-evaluación</h1>
        <p>
          Este acceso separa vistas por rol y protege la información del flujo. Con Supabase configurado se usa
          autenticación segura para gestionar las cuentas.
        </p>
        {!isSupabaseDataConfigured && (
          <p className="inline-note">Autenticación de respaldo activa: configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar Supabase.</p>
        )}
      </div>

      <form ref={formRef} className="auth-form" onSubmit={submit}>
        <div className="segmented-control" aria-label="Modo de acceso">
          <button type="button" className={mode === "signin" ? "is-active" : ""} onClick={() => changeMode("signin")}>
            Entrar
          </button>
          <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => changeMode("signup")}>
            Crear cuenta
          </button>
        </div>

        {mode === "signup" && (
          <>
            <label>
              Nombre
              <input type="text" name="full_name" value={form.full_name} onChange={handleChange} placeholder="Ej: Isaias Carte" />
            </label>

            <label>
              Teléfono
              <div className="phone-input">
                <span>+56 9</span>
                <input
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
              
          
            </label>

            <label>
              Fecha de nacimiento
              <div className="birth-date-grid" onBlur={(event) => {
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
            </label>
          </>
        )}

        <label>
          Email
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="nombre@correo.cl" />
        </label>

        <label>
          Contraseña
          <input
            ref={passwordRef}
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Mínimo 6 caracteres"
          />
        </label>
        {mode === "signup" && (
          <div className={`password-meter ${passwordStrength.level}`}>
            <div className="password-meter-header">
              <span>Seguridad de contraseña</span>
              <strong>{passwordStrength.label}</strong>
            </div>
            <div className="password-meter-track" aria-hidden="true">
              <span style={{ width: `${passwordStrength.percent}%` }} />
            </div>
            <p>Se recomiendan 8 o más caracteres y hacer uso de mayúsculas, minúsculas, números y caracteres especiales para una mayor seguridad.</p>
          </div>
        )}

        {showWeakPasswordConfirm && (
          <div className="password-confirmation" role="alert">
            <strong>Tu contraseña es débil. ¿Deseas continuar de todas formas?</strong>
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  weakPasswordConfirmedRef.current = true;
                  setShowWeakPasswordConfirm(false);
                  window.setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
              >
                Si, continuar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  weakPasswordConfirmedRef.current = false;
                  setShowWeakPasswordConfirm(false);
                  passwordRef.current?.focus();
                }}
              >
                No, mejorar contraseña
              </button>
            </div>
          </div>
        )}

        {mode === "signup" && (
        <label>
          Tipo de usuario
          <select name="role" value={form.role} onChange={handleChange}>
            <option value={roles.user}>{roleLabels[roles.user]}</option>
            <option value={roles.sales}>{roleLabels[roles.sales]}</option>
            <option value={roles.admin}>{roleLabels[roles.admin]}</option>
          </select>
        </label>
        )}

        <button type="submit" disabled={loading}>{loading ? "Validando..." : "Continuar"}</button>
        {error && <div className="error-message">{error}</div>}
      </form>
    </section>
  );
}
