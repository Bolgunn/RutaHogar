import React, { useState } from "react";
import { formatClp } from "../services/monthlyPlanService";
import FieldTooltip from "./FieldTooltip";

function formatInteger(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("es-CL") : "";
}

function stripFormat(value) {
  return String(value).replace(/\./g, "").replace(/[^0-9]/g, "");
}

const MILESTONE_TYPES = [
  { id: "ahorro", icon: "ti ti-piggy-bank", title: "Aumento de Ahorro", desc: "He logrado ahorrar más dinero para mi pie." },
  { id: "deuda", icon: "ti ti-credit-card", title: "Reducción de Deuda", desc: "He pagado parte o la totalidad de mis deudas." },
  { id: "laboral", icon: "ti ti-briefcase", title: "Mejora Laboral", desc: "He cambiado mi tipo de contrato o antigüedad." },
  { id: "renta", icon: "ti ti-trending-up", title: "Aumento de Renta", desc: "Han subido mis ingresos mensuales líquidos." },
];

const continuityOptions = [
  { value: "menos_6_meses", label: "Menos de 6 meses" },
  { value: "entre_6_y_12_meses", label: "Entre 6 y 12 meses" },
  { value: "entre_1_y_3_anios", label: "Entre 1 y 3 años" },
  { value: "mas_3_anios", label: "Más de 3 años" },
];

const complementFields = ["ingreso_mensual_complementario", "deuda_mensual_complementario", "continuidad_laboral_complementario"];

export default function RegisterMilestone({ evaluation, onBack, onRegister }) {
  const [activeType, setActiveType] = useState(null);
  const [source, setSource] = useState("personal");
  const [newSavings, setNewSavings] = useState("");
  const [newDebt, setNewDebt] = useState("");
  const [newContinuity, setNewContinuity] = useState("");
  const [newIncome, setNewIncome] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputData = evaluation?.input || {};
  const hasComplement = inputData.complemento_renta === true || inputData.complemento_renta === "si" || complementFields.some((field) => inputData[field] != null);
  const isComplement = source === "complemento";
  const currentSavings = Number(inputData.ahorro_disponible) || 0;
  const currentDebt = Number(isComplement ? inputData.deuda_mensual_complementario : inputData.deuda_mensual) || 0;
  const currentContinuity = isComplement ? inputData.continuidad_laboral_complementario || "" : inputData.continuidad_laboral || "";
  const currentIncome = Number(isComplement ? inputData.ingreso_mensual_complementario : inputData.ingreso_mensual) || 0;
  const currentMorosidadActual = inputData.morosidad_actual || "no";
  const currentMontoMorosidad = Number(inputData.monto_morosidad) || 0;
  const [newMorosidadActual, setNewMorosidadActual] = useState(currentMorosidadActual);
  const [newMontoMorosidad, setNewMontoMorosidad] = useState(currentMontoMorosidad ? String(currentMontoMorosidad) : "");

  const submit = async (data) => {
    setIsSubmitting(true);
    await onRegister(data);
    setIsSubmitting(false);
  };

  const handleAhorroSubmit = async (event) => {
    event.preventDefault(); setError("");
    const value = Number(stripFormat(newSavings));
    if (!Number.isFinite(value) || value < 0 || !newSavings) return setError("El nuevo ahorro debe ser un número válido mayor o igual a 0.");
    if (value <= currentSavings) return setError(`El nuevo monto de ahorro debe ser superior a tu ahorro declarado previamente (${formatClp(currentSavings)}).`);
    await submit({ ahorro_disponible: value });
  };

  const handleDeudaSubmit = async (event) => {
    event.preventDefault(); setError("");
    const value = Number(stripFormat(newDebt));
    if (!Number.isFinite(value) || value < 0 || !newDebt) return setError("La deuda debe ser un número válido mayor o igual a 0.");
    if (isComplement) {
      if (value >= currentDebt) return setError("La nueva deuda mensual debe ser inferior a la declarada previamente.");
      await submit({ deuda_mensual_complementario: value });
      return;
    }
    const moraValue = newMorosidadActual === "si" ? Number(stripFormat(newMontoMorosidad)) : 0;
    const moraImproved = (currentMorosidadActual === "si" && newMorosidadActual === "no") || (currentMorosidadActual === "si" && newMorosidadActual === "si" && moraValue < currentMontoMorosidad);
    if (value >= currentDebt && !moraImproved) return setError("El nuevo monto o estado de morosidad debe ser inferior a lo que declaraste previamente.");
    await submit({ deuda_mensual: value, morosidad_actual: newMorosidadActual, monto_morosidad: moraValue });
  };

  const handleLaboralSubmit = async (event) => {
    event.preventDefault(); setError("");
    if (!newContinuity) return setError("Selecciona una opción de continuidad laboral.");
    if (newContinuity === currentContinuity) return setError("Debes seleccionar una continuidad diferente a la actual.");
    await submit({ [isComplement ? "continuidad_laboral_complementario" : "continuidad_laboral"]: newContinuity });
  };

  const handleRentaSubmit = async (event) => {
    event.preventDefault(); setError("");
    const value = Number(stripFormat(newIncome));
    if (!Number.isFinite(value) || value <= 0 || !newIncome) return setError("La renta debe ser un número válido mayor a 0.");
    if (value === currentIncome) return setError(`El nuevo monto es idéntico a tu renta declarada previamente (${formatClp(currentIncome)}).`);
    await submit({ [isComplement ? "ingreso_mensual_complementario" : "ingreso_mensual"]: value });
  };

  const activeMilestone = MILESTONE_TYPES.find((type) => type.id === activeType);
  const supportsComplement = hasComplement && ["deuda", "laboral", "renta"].includes(activeType);
  const continuityLabel = continuityOptions.find((option) => option.value === currentContinuity)?.label || "No especificada";
  const formHandler = { ahorro: handleAhorroSubmit, deuda: handleDeudaSubmit, laboral: handleLaboralSubmit, renta: handleRentaSubmit }[activeType];

  const selectType = (type) => { setActiveType(type); setSource("personal"); setError(""); };

  return <section className="section-block milestone-panel">
    <div className="page-head">
      <button type="button" className="milestone-back" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true" />Volver al Plan de Mejora</button>
      <span className="eyebrow">Registro de avance</span><h1>Registrar avances financieros</h1>
      <p>Actualiza un cambio real para recalcular tu perfil y plan de mejora referencial.</p>
    </div>
    <div className="milestone-choice-heading"><span className="eyebrow">Elige el cambio</span><h2>¿Qué avanzó desde tu última calificación?</h2></div>
    <div className="milestone-type-grid">{MILESTONE_TYPES.map((type) => <button key={type.id} type="button" className={`milestone-type-card ${activeType === type.id ? "is-active" : ""}`} aria-pressed={activeType === type.id} onClick={() => selectType(type.id)}><i className={type.icon} aria-hidden="true" /><span><h3>{type.title}</h3><p>{type.desc}</p></span></button>)}</div>
    {activeType && <div className="milestone-form-area"><form onSubmit={formHandler} className="milestone-form">
      <div className="milestone-form-header"><div className="milestone-form-header__icon"><i className={activeMilestone.icon} aria-hidden="true" /></div><div><span className="eyebrow">{isComplement ? "Quien complementa renta" : "Mi información"}</span><h3>{activeMilestone.title}</h3><p>Ingresa el valor actualizado para este antecedente.</p></div></div>
      {supportsComplement && <fieldset className="milestone-source"><legend>¿De quién es este avance?</legend><div className="milestone-source__options"><button type="button" className={source === "personal" ? "is-active" : ""} aria-pressed={source === "personal"} onClick={() => { setSource("personal"); setError(""); }}>Mi información</button><button type="button" className={source === "complemento" ? "is-active" : ""} aria-pressed={source === "complemento"} onClick={() => { setSource("complemento"); setError(""); }}>Quien complementa renta</button></div></fieldset>}
      {activeType === "ahorro" && <><div className="milestone-current-value"><span>Ahorro disponible declarado</span><strong>{formatClp(currentSavings)}</strong></div><div className="milestone-field"><label htmlFor="milestone-savings">Nuevo ahorro disponible total (CLP) <FieldTooltip text="Indica el total disponible hoy para el pago inicial, incluyendo recursos propios, APV o Cuenta 2 utilizables." /></label><input id="milestone-savings" type="text" inputMode="numeric" value={newSavings} onChange={(event) => setNewSavings(formatInteger(event.target.value))} placeholder="Ej. 15.000.000" autoFocus /></div></>}
      {activeType === "deuda" && <><div className="milestone-current-value"><span>Deuda mensual declarada</span><strong>{formatClp(currentDebt)}</strong></div>{isComplement ? <p className="field-help">Para quien complementa renta se actualiza solo la deuda mensual; no existe un monto de morosidad complementario persistido.</p> : <div className="milestone-form-grid"><div className="milestone-field"><label htmlFor="milestone-morosidad">¿Tienes morosidad actual? <FieldTooltip text="La morosidad corresponde a pagos vencidos o atrasados que aún debes regularizar." /></label><select id="milestone-morosidad" value={newMorosidadActual} onChange={(event) => setNewMorosidadActual(event.target.value)}><option value="no">No, estoy al día</option><option value="si">Sí, tengo atrasos</option></select></div>{newMorosidadActual === "si" && <div className="milestone-field"><label htmlFor="milestone-morosidad-monto">Monto de morosidad (CLP)</label><input id="milestone-morosidad-monto" type="text" inputMode="numeric" value={newMontoMorosidad} onChange={(event) => setNewMontoMorosidad(formatInteger(event.target.value))} placeholder="Ej. 500.000" /></div>}</div>}<div className="milestone-field"><label htmlFor="milestone-debt">Nueva deuda mensual total (CLP) <FieldTooltip text="Incluye cuotas vigentes de créditos, tarjetas, líneas de crédito y otros compromisos mensuales." /></label><input id="milestone-debt" type="text" inputMode="numeric" value={newDebt} onChange={(event) => setNewDebt(formatInteger(event.target.value))} placeholder="Ej. 150.000" autoFocus /></div></>}
      {activeType === "laboral" && <><div className="milestone-current-value"><span>Continuidad laboral declarada</span><strong>{continuityLabel}</strong></div><div className="milestone-field"><label htmlFor="milestone-continuity">Nueva continuidad laboral <FieldTooltip text="Corresponde al tiempo continuo en tu empleo o actividad laboral actual." /></label><select id="milestone-continuity" value={newContinuity} onChange={(event) => setNewContinuity(event.target.value)} autoFocus><option value="">Selecciona una opción</option>{continuityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></>}
      {activeType === "renta" && <><div className="milestone-current-value"><span>Renta mensual líquida declarada</span><strong>{formatClp(currentIncome)}</strong></div><div className="milestone-field"><label htmlFor="milestone-income">Nueva renta mensual líquida (CLP) <FieldTooltip text="Indica el ingreso líquido mensual que recibes regularmente después de descuentos." /></label><input id="milestone-income" type="text" inputMode="numeric" value={newIncome} onChange={(event) => setNewIncome(formatInteger(event.target.value))} placeholder="Ej. 2.000.000" autoFocus /></div></>}
      {error && <div className="warning-note milestone-form-error" role="alert">{error}</div>}
      <div className="milestone-form-actions"><button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Calculando nuevo score..." : "Registrar y recalcular"}</button></div>
    </form></div>}
  </section>;
}
