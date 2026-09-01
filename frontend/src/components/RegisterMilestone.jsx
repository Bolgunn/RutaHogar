import React, { useState } from "react";
import { formatClp } from "../services/monthlyPlanService";

function formatInteger(raw) {
  if (raw === "" || raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits === "") return "";
  return Number(digits).toLocaleString("es-CL");
}

function stripFormat(value) {
  return String(value)
    .replace(/\./g, "")
    .replace(/[^0-9]/g, "");
}

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
  const [activeType, setActiveType] = useState(null); // 'ahorro', 'deuda', 'laboral', 'renta'
  const [newSavings, setNewSavings] = useState("");
  const [newDebt, setNewDebt] = useState("");
  const [newContinuity, setNewContinuity] = useState("");
  const [newIncome, setNewIncome] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputData = evaluation?.input || {};
  const currentSavings = Number(inputData.ahorro_disponible) || 0;
  const currentDebt = Number(inputData.deuda_mensual) || 0;
  const currentContinuity = inputData.continuidad_laboral || "";
  const currentIncome = Number(inputData.ingreso_mensual) || 0;
  
  const currentMorosidadActual = inputData.morosidad_actual || "no";
  const currentMontoMorosidad = Number(inputData.monto_morosidad) || 0;

  const [newMorosidadActual, setNewMorosidadActual] = useState(currentMorosidadActual);
  const [newMontoMorosidad, setNewMontoMorosidad] = useState(currentMontoMorosidad === 0 ? "" : currentMontoMorosidad.toString());

  const handleAhorroSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const savingsVal = Number(stripFormat(newSavings));
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
    const debtVal = Number(stripFormat(newDebt));
    if (!Number.isFinite(debtVal) || debtVal < 0 || newDebt === "") {
      setError("La deuda debe ser un número válido mayor o igual a 0.");
      return;
    }
    
    const montoMorosidadVal = newMorosidadActual === "si" ? Number(stripFormat(newMontoMorosidad)) : 0;
    
    const isDebtImproved = debtVal < currentDebt;
    const isMorosidadImproved = 
      (currentMorosidadActual === "si" && newMorosidadActual === "no") ||
      (currentMorosidadActual === "si" && newMorosidadActual === "si" && montoMorosidadVal < currentMontoMorosidad);
      
    if (!isDebtImproved && !isMorosidadImproved) {
      setError("El nuevo monto o estado de morosidad debe ser inferior a lo que declaraste previamente.");
      return;
    }
    
    setIsSubmitting(true);
    await onRegister({ 
      deuda_mensual: debtVal,
      morosidad_actual: newMorosidadActual,
      monto_morosidad: montoMorosidadVal
    });
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

  const handleRentaSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const incomeVal = Number(stripFormat(newIncome));
    if (!Number.isFinite(incomeVal) || incomeVal <= 0 || newIncome === "") {
      setError("La renta debe ser un número válido mayor a 0.");
      return;
    }
    if (incomeVal === currentIncome) {
      setError(
        `El nuevo monto es idéntico a tu renta declarada previamente (${formatClp(
          currentIncome
        )}).`
      );
      return;
    }
    setIsSubmitting(true);
    await onRegister({ ingreso_mensual: incomeVal });
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

      <div className="milestone-cards-container" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <button
          className={`card-button ${activeType === 'ahorro' ? 'active' : ''}`}
          onClick={() => { setActiveType('ahorro'); setError(""); }}
          style={{ flex: "1 1 calc(50% - 1rem)", padding: "1.5rem", borderRadius: "8px", border: "none", background: activeType === 'ahorro' ? '#45a68e' : '#246354', color: "white", cursor: "pointer", textAlign: "left", transition: "background 0.2s" }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "white" }}>💰 Aumento de Ahorro</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0" }}>He logrado ahorrar más dinero para mi pie.</p>
        </button>

        <button
          className={`card-button ${activeType === 'deuda' ? 'active' : ''}`}
          onClick={() => { setActiveType('deuda'); setError(""); }}
          style={{ flex: "1 1 calc(50% - 1rem)", padding: "1.5rem", borderRadius: "8px", border: "none", background: activeType === 'deuda' ? '#45a68e' : '#246354', color: "white", cursor: "pointer", textAlign: "left", transition: "background 0.2s" }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "white" }}>💳 Reducción de Deuda</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0" }}>He pagado parte o la totalidad de mis deudas.</p>
        </button>

        <button
          className={`card-button ${activeType === 'laboral' ? 'active' : ''}`}
          onClick={() => { setActiveType('laboral'); setError(""); }}
          style={{ flex: "1 1 calc(50% - 1rem)", padding: "1.5rem", borderRadius: "8px", border: "none", background: activeType === 'laboral' ? '#45a68e' : '#246354', color: "white", cursor: "pointer", textAlign: "left", transition: "background 0.2s" }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "white" }}>💼 Mejora Laboral</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0" }}>He cambiado mi tipo de contrato o antigüedad.</p>
        </button>

        <button
          className={`card-button ${activeType === 'renta' ? 'active' : ''}`}
          onClick={() => { setActiveType('renta'); setError(""); }}
          style={{ flex: "1 1 calc(50% - 1rem)", padding: "1.5rem", borderRadius: "8px", border: "none", background: activeType === 'renta' ? '#45a68e' : '#246354', color: "white", cursor: "pointer", textAlign: "left", transition: "background 0.2s" }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "white" }}>📈 Aumento de Renta</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0" }}>Han subido mis ingresos mensuales líquidos.</p>
        </button>
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
                type="text"
                inputMode="numeric"
                value={newSavings}
                onChange={(e) => setNewSavings(formatInteger(e.target.value))}
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
              <h3>Actualiza tu Deuda y Morosidad</h3>
              <p className="field-help">
                Deuda actual declarada: <strong>{formatClp(currentDebt)}</strong><br/>
                Morosidad: <strong>{currentMorosidadActual === "si" ? formatClp(currentMontoMorosidad) : "Al día"}</strong>
              </p>
            </div>
            
            <label className="simulator-field">
              ¿Tienes morosidad actual?
              <select
                value={newMorosidadActual}
                onChange={(e) => setNewMorosidadActual(e.target.value)}
              >
                <option value="no">No, estoy al día</option>
                <option value="si">Sí, tengo atrasos</option>
              </select>
            </label>

            {newMorosidadActual === "si" && (
              <label className="simulator-field">
                Monto de morosidad (CLP)
                <input
                  type="text"
                  inputMode="numeric"
                  value={newMontoMorosidad}
                  onChange={(e) => setNewMontoMorosidad(formatInteger(e.target.value))}
                  placeholder="Ej. 500.000"
                />
              </label>
            )}

            <label className="simulator-field">
              Nueva Deuda Mensual Total (CLP)
              <input
                type="text"
                inputMode="numeric"
                value={newDebt}
                onChange={(e) => setNewDebt(formatInteger(e.target.value))}
                placeholder="Ej. 150.000"
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

        {activeType === "renta" && (
          <form onSubmit={handleRentaSubmit} className="milestone-form" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--surface-color)" }}>
            <h3>Actualiza tu Renta Mensual</h3>
            <p className="field-help" style={{ marginBottom: "1.5rem" }}>
              Actualmente tienes declarado: <strong>{formatClp(currentIncome)}</strong>
            </p>
            <label className="field-label">
              Nueva Renta Mensual Líquida (CLP)
              <input
                type="text"
                inputMode="numeric"
                value={newIncome}
                onChange={(e) => setNewIncome(formatInteger(e.target.value))}
                placeholder="Ej. 2.000.000"
                className="text-input"
                autoFocus
              />
            </label>
            {error && <div className="warning-note" style={{ marginTop: "1rem" }}>{error}</div>}
            <div style={{ marginTop: "1.5rem" }}>
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Calculando nuevo score..." : "Registrar y Recalcular"}
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
