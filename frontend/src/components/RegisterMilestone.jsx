import React, { useState } from "react";
import { formatClp } from "../services/monthlyPlanService";

const MILESTONE_TYPES = [
  {
    id: "ahorro",
    icon: "ti ti-piggy-bank",
    title: "Aumento de Ahorro",
    desc: "He logrado ahorrar más dinero para mi pie.",
  },
  {
    id: "deuda",
    icon: "ti ti-credit-card",
    title: "Reducción de Deuda",
    desc: "He pagado parte o la totalidad de mis deudas.",
  },
  {
    id: "laboral",
    icon: "ti ti-briefcase",
    title: "Mejora Laboral",
    desc: "He cambiado mi tipo de contrato o antigüedad.",
  },
];

const continuityOptions = [
  { value: "menos_6_meses", label: "Menos de 6 meses" },
  { value: "entre_6_y_12_meses", label: "Entre 6 y 12 meses" },
  { value: "entre_1_y_3_anios", label: "Entre 1 y 3 años" },
  { value: "mas_3_anios", label: "Más de 3 años" },
];

export default function RegisterMilestone({ evaluation, onBack, onRegister }) {
  const [activeType, setActiveType] = useState(null);
  const [newSavings, setNewSavings] = useState("");
  const [newDebt, setNewDebt] = useState("");
  const [newContinuity, setNewContinuity] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputData = evaluation?.input || {};
  const currentSavings = Number(inputData.ahorro_disponible) || 0;
  const currentDebt = Number(inputData.deuda_mensual) || 0;
  const currentContinuity = inputData.continuidad_laboral || "";

  const handleAhorroSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const savingsVal = Number(newSavings);
    if (!Number.isFinite(savingsVal) || savingsVal < 0 || newSavings === "") {
      setError("El nuevo ahorro debe ser un número válido mayor o igual a 0.");
      return;
    }
    if (savingsVal <= currentSavings) {
      setError(
        `El nuevo monto de ahorro debe ser superior a tu ahorro declarado previamente (${formatClp(currentSavings)}).`
      );
      return;
    }
    setIsSubmitting(true);
    await onRegister({ ahorro_disponible: savingsVal });
    setIsSubmitting(false);
  };

  const handleDeudaSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const debtVal = Number(newDebt);
    if (!Number.isFinite(debtVal) || debtVal < 0 || newDebt === "") {
      setError("La deuda debe ser un número válido mayor o igual a 0.");
      return;
    }
    if (debtVal >= currentDebt) {
      setError(
        `El nuevo monto debe ser inferior a tu deuda declarada previamente (${formatClp(currentDebt)}).`
      );
      return;
    }
    setIsSubmitting(true);
    await onRegister({ deuda_mensual: debtVal });
    setIsSubmitting(false);
  };

  const handleLaboralSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!newContinuity) {
      setError("Selecciona una opción de continuidad laboral.");
      return;
    }
    if (newContinuity === currentContinuity) {
      setError("Debes seleccionar una continuidad diferente a la actual.");
      return;
    }
    setIsSubmitting(true);
    await onRegister({ continuidad_laboral: newContinuity });
    setIsSubmitting(false);
  };

  return (
    <section className="section-block milestone-panel">
      <div className="page-head">
        <button type="button" className="milestone-back" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
          Volver al Plan de Mejora
        </button>
        <span className="eyebrow">Registro de avance</span>
        <h1>Registrar un Avance Financiero</h1>
        <p>
          Selecciona el área en la que lograste un hito para recalcular tu perfil y
          plan de mejora.
        </p>
      </div>

      <div className="milestone-type-grid">
        {MILESTONE_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`milestone-type-card ${activeType === type.id ? "is-active" : ""}`}
            onClick={() => { setActiveType(type.id); setError(""); }}
          >
            <i className={`ti ${type.icon}`} aria-hidden="true" />
            <div>
              <h3>{type.title}</h3>
              <p>{type.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="milestone-form-area">
        {activeType === "ahorro" && (
          <form onSubmit={handleAhorroSubmit} className="milestone-form">
            <div className="milestone-form-header">
              <h3>Actualiza tu Ahorro Disponible</h3>
              <p className="field-help">
                Actualmente tienes declarado: <strong>{formatClp(currentSavings)}</strong>
              </p>
            </div>
            <label className="simulator-field">
              Nuevo Ahorro Disponible Total (CLP)
              <input
                type="number"
                min="0"
                value={newSavings}
                onChange={(e) => setNewSavings(e.target.value)}
                placeholder="Ej. 15.000.000"
                autoFocus
              />
            </label>
            {error && <div className="warning-note">{error}</div>}
            <div className="milestone-form-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Calculando nuevo score…" : "Registrar y Recalcular"}
              </button>
            </div>
          </form>
        )}

        {activeType === "deuda" && (
          <form onSubmit={handleDeudaSubmit} className="milestone-form">
            <div className="milestone-form-header">
              <h3>Actualiza tu Deuda Mensual</h3>
              <p className="field-help">
                Actualmente pagas al mes: <strong>{formatClp(currentDebt)}</strong>
              </p>
            </div>
            <label className="simulator-field">
              Nueva Deuda Mensual Total (CLP)
              <input
                type="number"
                min="0"
                value={newDebt}
                onChange={(e) => setNewDebt(e.target.value)}
                placeholder="Ej. 150.000"
                autoFocus
              />
            </label>
            {error && <div className="warning-note">{error}</div>}
            <div className="milestone-form-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Calculando nuevo score…" : "Registrar y Recalcular"}
              </button>
            </div>
          </form>
        )}

        {activeType === "laboral" && (
          <form onSubmit={handleLaboralSubmit} className="milestone-form">
            <div className="milestone-form-header">
              <h3>Actualiza tu Continuidad Laboral</h3>
              <p className="field-help">
                Continuidad actual: <strong>{continuityOptions.find(o => o.value === currentContinuity)?.label || "No especificada"}</strong>
              </p>
            </div>
            <label className="simulator-field">
              Nueva Continuidad Laboral
              <select
                value={newContinuity}
                onChange={(e) => setNewContinuity(e.target.value)}
                autoFocus
              >
                <option value="">Selecciona una opción</option>
                {continuityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            {error && <div className="warning-note">{error}</div>}
            <div className="milestone-form-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Calculando nuevo score…" : "Registrar y Recalcular"}
              </button>
            </div>
          </form>
        )}

        {!activeType && (
          <div className="milestone-empty-state">
            <i className="ti ti-hand-click" aria-hidden="true" />
            <p>Selecciona una opción de arriba para comenzar.</p>
          </div>
        )}
      </div>
    </section>
  );
}
