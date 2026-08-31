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

const strengthColors = {
  weak: "#b42318",
  medium: "#d97706",
  strong: "#2d8a4e",
  "very-strong": "#166534",
};

function BirthDateField({ name, value, placeholder, ariaLabel, maxLength, options, activeDropdown, onOpen, onClose, onBlur, onChange, onSelect }) {
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

const authStyles = `
/* ═══ Auth Navy/Gold ═══ */
/* Override .auth-shell so it doesn't constrain the split layout */
.auth-shell {
  display: block !important;
  min-height: auto !important;
  place-items: unset !important;
}

.auth-root {
  display: grid;
  grid-template-columns: 42% 58%;
  height: 100vh;
  width: 100%;
  font-family: var(--rh-font);
  overflow: hidden;
}

/* ── Left Panel ── */
.auth-left {
  background: linear-gradient(165deg, #0B1A2E 0%, #0F2240 50%, #132B4A 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
}
.auth-left::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image:
    linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
  background-size: 50px 50px;
}
.auth-left-glow-1 {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 350px;
  height: 350px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212,168,67,0.10) 0%, transparent 70%);
  pointer-events: none;
}
.auth-left-glow-2 {
  position: absolute;
  bottom: -80px;
  left: -80px;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212,168,67,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.auth-left-ambient {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--rh-font-mono);
  font-size: clamp(140px, 18vw, 220px);
  font-weight: 700;
  color: rgba(255,255,255,0.02);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
}
.auth-left-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 340px;
}
.auth-left-logo {
  width: 64px;
  height: auto;
  margin-bottom: 2rem;
  filter: brightness(0) invert(1);
  opacity: 0.9;
}
.auth-left-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(212,168,67,0.10);
  border: 1px solid rgba(212,168,67,0.20);
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #D4A843;
  margin-bottom: 1.5rem;
}
.auth-left-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #D4A843;
  animation: authPulse 2s ease-in-out infinite;
}
@keyframes authPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

.auth-left h2 {
  font-family: var(--rh-font-display);
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 400;
  color: #fff;
  line-height: 1.15;
  margin-bottom: 1rem;
  text-wrap: balance;
}
.auth-left h2 .gold { color: #D4A843; }
.auth-left p {
  font-size: 14px;
  color: rgba(255,255,255,0.45);
  line-height: 1.7;
}
.auth-left-divider {
  width: 40px;
  height: 2px;
  background: linear-gradient(90deg, #D4A843, rgba(212,168,67,0.2));
  margin: 1.5rem auto;
  border-radius: 1px;
}
.auth-left-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.5rem;
}
.auth-left-feature {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: rgba(255,255,255,0.5);
}
.auth-left-feature svg {
  width: 16px;
  height: 16px;
  color: #D4A843;
  flex-shrink: 0;
}
.auth-left-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 1.5rem;
  padding: 12px 24px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #D4A843 0%, #B8922E 100%);
  color: #0B1A2E;
  font-family: var(--rh-font);
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 2px 12px rgba(212,168,67,0.3);
}
.auth-left-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(212,168,67,0.4);
}
.auth-left-cta:active {
  transform: translateY(0);
}
.auth-left-cta svg {
  width: 16px;
  height: 16px;
}

/* ── Right Panel ── */
.auth-right {
  background: #FAFBFD;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 2.5rem;
  position: relative;
  overflow-y: auto;
  height: 100vh;
}
.auth-right-inner {
  width: 100%;
  max-width: 420px;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(11,26,46,0.1);
  border-radius: 16px;
  padding: 2rem;
}

.auth-right-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2rem;
}
.auth-right-brand-logo {
  height: 32px;
  width: auto;
}

.auth-right h1 {
  font-family: var(--rh-font-display);
  font-size: clamp(24px, 2.5vw, 30px);
  font-weight: 400;
  color: #0B1A2E;
  line-height: 1.15;
  margin-bottom: 0.5rem;
  text-wrap: balance;
}
.auth-right-sub {
  font-size: 14px;
  color: rgba(11,26,46,0.85);
  line-height: 1.6;
  margin-bottom: 1.75rem;
}
.auth-right-supabase-note {
  font-size: 12px;
  color: rgba(11,26,46,0.35);
  background: rgba(11,26,46,0.03);
  border: 1px solid rgba(11,26,46,0.06);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

/* ── Segmented Control ── */
.auth-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  background: rgba(11,26,46,0.1);
  border-radius: 10px;
  margin-bottom: 1.5rem;
}
.auth-seg-btn {
  padding: 10px 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(11,26,46,0.65);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--rh-font);
  transition: color 0.2s, background 0.2s, box-shadow 0.2s;
}
.auth-seg-btn:hover { color: rgba(11,26,46,0.80); }
.auth-seg-btn:focus-visible {
  outline: 2px solid #D4A843;
  outline-offset: 2px;
}
.auth-seg-btn.is-active {
  background: #fff;
  color: #0B1A2E;
  box-shadow: 0 1px 4px rgba(11,26,46,0.1);
}

/* ── Form Fields ── */
.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.auth-field-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(11,26,46,0.65);
}
.auth-field input,
.auth-field select {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1.5px solid rgba(11,26,46,0.42);
  border-radius: 10px;
  background: #fff;
  color: #0B1A2E;
  font-size: 14px;
  font-family: var(--rh-font);
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
.auth-field input::placeholder {
  color: rgba(11,26,46,0.60);
}
.auth-field input:focus-visible,
.auth-field select:focus-visible {
  border-color: #D4A843;
  box-shadow: 0 0 0 3px rgba(212,168,67,0.12);
  outline: none;
}
.auth-field input:focus:not(:focus-visible),
.auth-field select:focus:not(:focus-visible) {
  outline: none;
}
.auth-field select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%230B1A2E' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 36px;
}

/* ── Phone Input ── */
.auth-phone {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0;
  margin-top: 7px;
}
.auth-phone-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  height: 46px;
  border: 1.5px solid rgba(11,26,46,0.22);
  border-right: none;
  border-radius: 10px 0 0 10px;
  background: rgba(11,26,46,0.04);
  font-size: 14px;
  font-weight: 700;
  color: rgba(11,26,46,0.6);
  font-family: var(--rh-font);
  white-space: nowrap;
  user-select: none;
}
.auth-phone input {
  border-radius: 0 10px 10px 0;
  height: 46px;
  /* La regla global "input, select, textarea" trae margin-top: 7px. El prefijo
     es un span y no lo recibe, asi que el input caia 7px mas abajo. El margen
     lo lleva el contenedor. */
  margin-top: 0;
}

/* ── Birth Date Grid ── */
.auth-birth-grid {
  display: grid;
  grid-template-columns: 60px 1fr 80px;
  gap: 8px;
}
.auth-dd-field {
  position: relative;
}
.auth-dd-field input {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  border: 1.5px solid rgba(11,26,46,0.42);
  border-radius: 10px;
  background: #fff;
  color: #0B1A2E;
  font-size: 14px;
  font-family: var(--rh-font);
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
.auth-dd-field input::placeholder { color: rgba(11,26,46,0.60); }
.auth-dd-field input:focus-visible {
  border-color: #D4A843;
  box-shadow: 0 0 0 3px rgba(212,168,67,0.12);
  outline: none;
}
.auth-dd-field input:focus:not(:focus-visible) {
  outline: none;
}
.auth-dd-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  max-height: 180px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid rgba(11,26,46,0.1);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(11,26,46,0.12);
}
.auth-dd-menu button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border-radius: 7px;
  background: transparent;
  border: none;
  color: #0B1A2E;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--rh-font);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.auth-dd-menu button:hover,
.auth-dd-menu button[aria-selected="true"] {
  background: rgba(212,168,67,0.1);
  color: #0B1A2E;
}

/* ── Password Strength ── */
.auth-pwd-meter {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(11,26,46,0.06);
  border-radius: 10px;
  background: #fff;
  margin-bottom: 14px;
}
.auth-pwd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.auth-pwd-label {
  font-size: 12px;
  color: rgba(11,26,46,0.75);
}
.auth-pwd-level {
  font-size: 12px;
  font-weight: 700;
}
.auth-pwd-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(11,26,46,0.06);
  overflow: hidden;
}
.auth-pwd-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 200ms ease, background 200ms ease;
}
.auth-pwd-hint {
  font-size: 11px;
  color: rgba(11,26,46,0.75);
  line-height: 1.5;
  margin: 0;
}

/* ── Weak Password Confirm ── */
.auth-weak-confirm {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(212,168,67,0.25);
  border-radius: 10px;
  background: rgba(212,168,67,0.04);
  margin-bottom: 14px;
}
.auth-weak-confirm strong {
  font-size: 13px;
  color: #0B1A2E;
  display: block;
}
.auth-weak-actions {
  display: flex;
  gap: 8px;
}

/* ── Error ── */
.auth-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(180,35,24,0.05);
  border: 1px solid rgba(180,35,24,0.12);
  font-size: 13px;
  color: #b42318;
  margin-bottom: 14px;
}
.auth-error svg { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Submit Button ── */
.auth-submit {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #D4A843, #B8912E);
  color: #0B1A2E;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--rh-font);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 4px 16px rgba(212,168,67,0.25);
  margin-top: 4px;
}
.auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(212,168,67,0.35);
}
.auth-submit:active:not(:disabled) { transform: translateY(0); }
.auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.auth-submit:focus-visible {
  outline: 2px solid #0B1A2E;
  outline-offset: 2px;
}

/* Touch: prevent double-tap zoom on buttons */
.auth-seg-btn,
.auth-submit,
.auth-btn-outline,
.auth-btn-gold,
.auth-dd-menu button {
  touch-action: manipulation;
}

/* ── Buttons shared ── */
.auth-btn-outline {
  padding: 9px 16px;
  border-radius: 8px;
  border: 1.5px solid rgba(11,26,46,0.12);
  background: #fff;
  color: rgba(11,26,46,0.6);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--rh-font);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.auth-btn-outline:hover {
  border-color: rgba(11,26,46,0.2);
  color: #0B1A2E;
}
.auth-btn-outline:focus-visible {
  outline: 2px solid #D4A843;
  outline-offset: 2px;
}
.auth-btn-gold {
  padding: 9px 16px;
  border-radius: 8px;
  border: none;
  background: #D4A843;
  color: #0B1A2E;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--rh-font);
  cursor: pointer;
  transition: background 0.2s;
}
.auth-btn-gold:focus-visible {
  outline: 2px solid #0B1A2E;
  outline-offset: 2px;
}
.auth-btn-gold:hover { background: #E0B85A; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .auth-root {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: auto;
    overflow: auto;
  }
  .auth-left {
    position: relative;
    height: auto;
    padding: 2rem 1.5rem;
    min-height: auto;
  }
  .auth-left-ambient { display: none; }
  .auth-left-content { max-width: 100%; }
  .auth-left-logo { width: 48px; margin-bottom: 1rem; }
  .auth-left h2 { font-size: 22px; }
  .auth-left-features { display: none; }
  .auth-left-divider { margin: 1rem auto; }
  .auth-right {
    padding: 1.5rem;
    height: auto;
    overflow-y: visible;
  }
  .auth-right-inner {
    max-width: 100%;
    background: transparent;
    border: none;
    padding: 0;
  }
}
@media (max-width: 480px) {
  .auth-left { padding: 1.5rem 1.25rem; }
  .auth-right { padding: 1.25rem; }
  .auth-birth-grid { grid-template-columns: 1fr 1fr 1fr; }
  .auth-phone { grid-template-columns: 1fr; }
  .auth-phone-prefix { display: none; }
  .auth-phone input { border-radius: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;

export default function AuthPanel({ onAuth, onBack, onModeChange, initialMode = "signin", onEvalAnon }) {
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
    <>
      <style>{authStyles}</style>
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
            <p>Conoce tu posición financiera antes de solicitar un crédito hipotecario. Sin documentos, sin claves bancarias.</p>
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
              {mode === "signin"
                ? "Ingresa tus credenciales para acceder a tu pre-evaluación."
                : "Regístrate para guardar tu score y seguimiento financiero."}
            </p>

            {!isSupabaseDataConfigured && (
              <div className="auth-right-supabase-note">
                Autenticación de respaldo activa: configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar Supabase.
              </div>
            )}

            <form ref={formRef} onSubmit={submit}>
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
                    <label className="auth-field-label" htmlFor="auth-name">Nombre</label>
                    <input id="auth-name" type="text" name="full_name" value={form.full_name} onChange={handleChange} placeholder="Ej: Isaias Carte" autoComplete="name" />
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
                  placeholder="Mínimo 6 caracteres"
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
                  <p className="auth-pwd-hint">Recomendamos 8+ caracteres con mayúsculas, minúsculas, números y símbolos.</p>
                </div>
              )}

              {showWeakPasswordConfirm && (
                <div className="auth-weak-confirm" role="alert">
                  <strong>Tu contraseña es débil. ¿Deseas continuar de todas formas?</strong>
                  <div className="auth-weak-actions">
                    <button
                      type="button"
                      className="auth-btn-gold"
                      onClick={() => {
                        weakPasswordConfirmedRef.current = true;
                        setShowWeakPasswordConfirm(false);
                        window.setTimeout(() => formRef.current?.requestSubmit(), 0);
                      }}
                    >
                      Sí, continuar
                    </button>
                    <button
                      type="button"
                      className="auth-btn-outline"
                      onClick={() => {
                        weakPasswordConfirmedRef.current = false;
                        setShowWeakPasswordConfirm(false);
                        passwordRef.current?.focus();
                      }}
                    >
                      No, mejorar
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div className="auth-field">
                  <label className="auth-field-label" htmlFor="auth-role">Tipo de usuario</label>
                  <select id="auth-role" name="role" value={form.role} onChange={handleChange}>
                    <option value={roles.user}>{roleLabels[roles.user]}</option>
                    <option value={roles.sales}>{roleLabels[roles.sales]}</option>
                    <option value={roles.admin}>{roleLabels[roles.admin]}</option>
                  </select>
                </div>
              )}

              {error && (
                <div className="auth-error" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {error}
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Validando…" : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
