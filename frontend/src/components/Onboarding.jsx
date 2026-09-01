import React, { useState } from "react";
import { comunasMvp } from "../constants/comunas";
import { calculateAge } from "../utils/helpers";

const normalizePropertyType = (value) =>
  value === "indiferente" || value === "aun_no_lo_se" ? "" : value || "";

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

const currentYear = new Date().getFullYear();
const dayOptions = Array.from({ length: 31 }, (_, i) => {
  const v = String(i + 1).padStart(2, "0");
  return { value: v, label: v };
});
const monthOptions = Array.from({ length: 12 }, (_, i) => {
  const v = String(i + 1).padStart(2, "0");
  return { value: v, label: v };
});
const yearOptions = Array.from({ length: currentYear - 18 - 1900 + 1 }, (_, i) => {
  const v = String(currentYear - 18 - i);
  return { value: v, label: v };
});


export default function Onboarding({ initialData, onComplete, isAnon = false, isEditing = false, onBirthDateSave }) {
  const [anonConsent, setAnonConsent] = useState(false);
  const [form, setForm] = useState({
    objetivo_principal: initialData?.objetivo_principal || "",
    tipo_propiedad: normalizePropertyType(initialData?.tipo_propiedad),
    comuna_interes: initialData?.comuna_interes || "",
    plazo_compra: initialData?.plazo_compra || "",
    comuna_alternativa: initialData?.comuna_alternativa || "",
    tiene_propiedad_vista: initialData?.tiene_propiedad_vista === true,
    birth_day: initialData?.birth_day || "",
    birth_month: initialData?.birth_month || "",
    birth_year: initialData?.birth_year || "",
  });
  const [error, setError] = useState("");

  const alternativeCommunes = form.comuna_interes
    ? comunasMvp.filter((comuna) => comuna !== form.comuna_interes)
    : [];

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "comuna_interes" && value === prev.comuna_alternativa) {
        next.comuna_alternativa = "";
      }
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    setError("");

    const required = [
      ["objetivo_principal", "Objetivo principal"],
      ["tipo_propiedad", "Tipo de propiedad"],
      ["comuna_interes", "Comuna de interés"],
      ["plazo_compra", "Plazo de compra"],
    ];
    const missing = required.filter(([key]) => !form[key]).map(([, label]) => label);

    if (missing.length) {
      setError(`Completa estos campos: ${missing.join(", ")}`);
      return;
    }

    const birthDateIso = buildBirthDateIso(form);
    if (!birthDateIso) {
      setError("Ingresa tu fecha de nacimiento completa.");
      return;
    }
    const age = calculateAge(birthDateIso);
    if (age < 18) {
      setError("Debes ser mayor de 18 años para continuar.");
      return;
    }

    if (!comunasMvp.includes(form.comuna_interes)) {
      setError("Selecciona una comuna de interés desde la lista.");
      return;
    }

    if (form.comuna_alternativa && !comunasMvp.includes(form.comuna_alternativa)) {
      setError("Selecciona una comuna alternativa desde la lista o déjala vacía.");
      return;
    }

    if (form.comuna_alternativa && form.comuna_alternativa === form.comuna_interes) {
      setError("La comuna alternativa debe ser distinta a la comuna principal.");
      return;
    }

    if (isAnon && !anonConsent) {
      setError("Debes aceptar el procesamiento de tus datos para continuar.");
      return;
    }

    if (onBirthDateSave && birthDateIso) {
      onBirthDateSave(birthDateIso);
    }

    onComplete(form);
  };

  const filledCount = [form.objetivo_principal, form.tipo_propiedad, form.comuna_interes, form.plazo_compra, form.birth_day, form.birth_month, form.birth_year].filter(Boolean).length;
  const progressPercent = Math.round((filledCount / 7) * 100);

  return (
    <div className="pre-wizard">
        {!isEditing && (
          <>
            {/* Progress */}
            <div className="pre-wizard-progress">
              <div className="pre-wizard-progress-top">
                <span className="pre-wizard-progress-label">Precalificación</span>
                <span className="pre-wizard-progress-step">Paso 1 de 4</span>
              </div>
              <div className="pre-wizard-progress-bar">
                <div className="pre-wizard-progress-fill" style={{ width: `${Math.max(progressPercent, 8)}%` }} />
              </div>
            </div>

            {/* Step indicators */}
            <div className="pre-wizard-steps">
              <div className="pre-wizard-step is-active">
                <span className="pre-wizard-step-num">1</span>
                <span className="pre-wizard-step-label">Contexto</span>
                <span className="pre-wizard-step-line" />
              </div>
              <div className="pre-wizard-step">
                <span className="pre-wizard-step-num">2</span>
                <span className="pre-wizard-step-label">Finanzas</span>
                <span className="pre-wizard-step-line" />
              </div>
              <div className="pre-wizard-step">
                <span className="pre-wizard-step-num">3</span>
                <span className="pre-wizard-step-label">Trabajo</span>
                <span className="pre-wizard-step-line" />
              </div>
              <div className="pre-wizard-step">
                <span className="pre-wizard-step-num">4</span>
                <span className="pre-wizard-step-label">Resultado</span>
              </div>
            </div>
          </>
        )}

        {/* Card */}
        <div className="pre-wizard-card">
          <div className="pre-wizard-card-header">
            <div className="pre-wizard-card-eyebrow">{isEditing ? "Editar contexto" : "Contexto inicial"}</div>
            <h2 className="pre-wizard-card-title">{isEditing ? "Actualiza tu contexto" : "Cuéntanos sobre tu objetivo"}</h2>
            <p className="pre-wizard-card-desc">
              {isEditing
                ? "Modifica los datos de contexto para recalcular tu precalificación."
                : "Estas preguntas ayudan a contextualizar tu precalificación. No reemplazan la evaluación financiera ni constituyen una aprobación formal."}
            </p>
          </div>

          <form onSubmit={submit}>
            <div className="pre-wizard-field">
              <label className="pre-wizard-field-label" htmlFor="objetivo_principal">
                ¿Cuál es tu objetivo principal?
              </label>
              <select
                id="objetivo_principal"
                name="objetivo_principal"
                value={form.objetivo_principal}
                onChange={handleChange}
              >
                <option value="">Selecciona una opción</option>
                <option value="comprar_ahora">Comprar ahora</option>
                <option value="prepararme">Prepararme para comprar más adelante</option>
                <option value="evaluar_capacidad">Evaluar mi capacidad de compra</option>
                <option value="conocer_propiedad">Conocer qué tipo de propiedad podría buscar</option>
              </select>
            </div>

            <div className="pre-wizard-grid-2">
              <div className="pre-wizard-field">
                <label className="pre-wizard-field-label" htmlFor="tipo_propiedad">
                  ¿Qué tipo de propiedad?
                </label>
                <select
                  id="tipo_propiedad"
                  name="tipo_propiedad"
                  value={form.tipo_propiedad}
                  onChange={handleChange}
                >
                  <option value="">Selecciona una opción</option>
                  <option value="casa">Casa</option>
                  <option value="departamento">Departamento</option>
                </select>
              </div>

              <div className="pre-wizard-field">
                <label className="pre-wizard-field-label" htmlFor="plazo_compra">
                  ¿En qué plazo?
                </label>
                <select
                  id="plazo_compra"
                  name="plazo_compra"
                  value={form.plazo_compra}
                  onChange={handleChange}
                >
                  <option value="">Selecciona una opción</option>
                  <option value="0_3_meses">0 a 3 meses</option>
                  <option value="3_6_meses">3 a 6 meses</option>
                  <option value="6_12_meses">6 a 12 meses</option>
                  <option value="mas_12_meses">Más de 12 meses</option>
                </select>
              </div>
            </div>

            <div className="pre-wizard-field">
              <label className="pre-wizard-field-label" htmlFor="comuna_interes">
                ¿En qué comuna te gustaría comprar?
              </label>
              <select
                id="comuna_interes"
                name="comuna_interes"
                value={form.comuna_interes}
                onChange={handleChange}
              >
                <option value="">Selecciona una comuna</option>
                {comunasMvp.map((comuna) => (
                  <option key={comuna} value={comuna}>{comuna}</option>
                ))}
              </select>
            </div>

            <div className="pre-wizard-field">
              <label className="pre-wizard-field-label" htmlFor="comuna_alternativa">
                ¿Tienes una comuna alternativa?
              </label>
              <select
                id="comuna_alternativa"
                name="comuna_alternativa"
                value={form.comuna_alternativa}
                onChange={handleChange}
                disabled={!form.comuna_interes}
              >
                <option value="">{form.comuna_interes ? "Sin comuna alternativa" : "Elige primero una comuna principal"}</option>
                {alternativeCommunes.map((comuna) => (
                  <option key={comuna} value={comuna}>{comuna}</option>
                ))}
              </select>
              <span className="pre-wizard-field-hint">Opcional. Útil si estás open a otras zonas.</span>
            </div>

            <div className="pre-wizard-divider" />

            <div className="pre-wizard-field">
              <label className="pre-wizard-field-label">Fecha de nacimiento</label>
              <div className="birth-date-grid">
                <div className="birth-date-field">
                  <select
                    id="birth_day"
                    name="birth_day"
                    value={form.birth_day}
                    onChange={handleChange}
                  >
                    <option value="">DD</option>
                    {dayOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="birth-date-field">
                  <select
                    id="birth_month"
                    name="birth_month"
                    value={form.birth_month}
                    onChange={handleChange}
                  >
                    <option value="">MM</option>
                    {monthOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="birth-date-field">
                  <select
                    id="birth_year"
                    name="birth_year"
                    value={form.birth_year}
                    onChange={handleChange}
                  >
                    <option value="">AAAA</option>
                    {yearOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="pre-wizard-field-hint">Tu edad se usa para calcular el plazo máximo del crédito hipotecario.</span>
            </div>

            <label className="pre-wizard-check-row">
              <input
                type="checkbox"
                name="tiene_propiedad_vista"
                checked={form.tiene_propiedad_vista}
                onChange={handleChange}
              />
              <span>Ya tengo una propiedad o proyecto visto</span>
            </label>

            {isAnon && (
              <label className="pre-wizard-check-row">
                <input
                  type="checkbox"
                  checked={anonConsent}
                  onChange={(e) => setAnonConsent(e.target.checked)}
                />
                <span>
                  Acepto que mis datos sean procesados para calcular mi score orientativo.
                  No se almacenan permanentemente si no creo una cuenta.
                </span>
              </label>
            )}

            <div className="pre-wizard-nav">
              <div />
              <button className="pre-wizard-btn-next" type="submit" disabled={isAnon && !anonConsent}>
                Continuar al formulario financiero
                <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            {error && <div className="pre-wizard-error">{error}</div>}
          </form>
        </div>
    </div>
  );
}
