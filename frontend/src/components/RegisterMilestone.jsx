import React, { useState } from "react";
import { formatClp } from "../services/monthlyPlanService";
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
        `El nuevo monto de ahorro debe ser superior a tu ahorro declarado previamente (${formatClp(
          currentSavings
        )}).`
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
        `El nuevo monto debe ser inferior a tu deuda declarada previamente (${formatClp(
          currentDebt
        )}).`
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
      setError(
        "Debes seleccionar una continuidad diferente a la actual."
      );
      return;
    }
    setIsSubmitting(true);
    await onRegister({ continuidad_laboral: newContinuity });
    setIsSubmitting(false);
  };

  const handleRentaSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const incomeVal = Number(newIncome);
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
    <section className="section-block milestone-registration-panel">
      <div className="section-heading">
        <button type="button" className="text-button mb-3" onClick={onBack}>
          ← Volver al Plan de Mejora
        </button>
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

      <div className="milestone-form-container">
        {activeType === "ahorro" && (
          <form onSubmit={handleAhorroSubmit} className="milestone-form" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--surface-color)" }}>
            <h3>Actualiza tu Ahorro Disponible</h3>
            <p className="field-help" style={{ marginBottom: "1.5rem" }}>
              Actualmente tienes declarado: <strong>{formatClp(currentSavings)}</strong>
            </p>
            <label className="field-label">
              Nuevo Ahorro Disponible Total (CLP)
              <input
                type="number"
                min="0"
                value={newSavings}
                onChange={(e) => setNewSavings(e.target.value)}
                placeholder="Ej. 15000000"
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

        {activeType === "deuda" && (
          <form onSubmit={handleDeudaSubmit} className="milestone-form" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--surface-color)" }}>
            <h3>Actualiza tu Deuda Mensual</h3>
            <p className="field-help" style={{ marginBottom: "1.5rem" }}>
              Actualmente pagas al mes: <strong>{formatClp(currentDebt)}</strong>
            </p>
            <label className="field-label">
              Nueva Deuda Mensual Total (CLP)
              <input
                type="number"
                min="0"
                value={newDebt}
                onChange={(e) => setNewDebt(e.target.value)}
                placeholder="Ej. 150000"
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

        {activeType === "laboral" && (
          <form onSubmit={handleLaboralSubmit} className="milestone-form" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--surface-color)" }}>
            <h3>Actualiza tu Continuidad Laboral</h3>
            <p className="field-help" style={{ marginBottom: "1.5rem" }}>
              Continuidad actual: <strong>{continuityOptions.find(o => o.value === currentContinuity)?.label || "No especificada"}</strong>
            </p>
            <label className="field-label">
              Nueva Continuidad Laboral
              <select
                value={newContinuity}
                onChange={(e) => setNewContinuity(e.target.value)}
                className="text-input"
                autoFocus
              >
                <option value="">Selecciona una opción</option>
                {continuityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {error && <div className="warning-note" style={{ marginTop: "1rem" }}>{error}</div>}
            <div style={{ marginTop: "1.5rem" }}>
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Calculando nuevo score..." : "Registrar y Recalcular"}
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
                type="number"
                min="0"
                value={newIncome}
                onChange={(e) => setNewIncome(e.target.value)}
                placeholder="Ej. 1200000"
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
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
            Selecciona una opción de arriba para comenzar.
          </div>
        )}
      </div>
    </section>
  );
}
