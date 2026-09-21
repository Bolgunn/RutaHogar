import React, { useRef, useState } from "react";
import { serializePatch } from "../../lib/tracking/display";
import { newTrackingCommand } from "../../services/trackingService";

const primaryFields = [
  ["ingreso_mensual", "Ingreso mensual", "number", false],
  ["deuda_mensual", "Deuda mensual", "number", false],
  ["ahorro_disponible", "Ahorro disponible", "number", false],
  ["dividendo_estimado", "Dividendo estimado", "number", true],
  ["monto_morosidad", "Monto de morosidad", "number", true],
  ["morosidad_actual", "Morosidad actual", "select", false, ["si", "no"]],
  ["tipo_contrato", "Tipo de contrato", "select", false, ["indefinido", "plazo_fijo", "independiente", "honorarios_variable"]],
  ["continuidad_laboral", "Continuidad laboral", "select", false,
    ["menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios"]],
  ["edad", "Edad", "number", false],
  ["plazo_credito_hipotecario", "Plazo del crédito", "number", false],
];

export default function UpdateFinancialDataForm({ snapshot, previous, onSubmit, correction = false }) {
  const [controls, setControls] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const change = (name, values) => {
    pending.current = null;
    setControls((old) => ({ ...old, [name]: { ...old[name], ...values, touched: true } }));
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const patch = serializePatch(controls);
      if (!Object.keys(patch).length) throw new Error("Modifica al menos un campo.");
      if (!reason.trim()) throw new Error("Indica el motivo de la actualización.");
      if (!pending.current) pending.current = { ...newTrackingCommand(patch, previous), reason };
      setBusy(true);
      await onSubmit(pending.current);
      pending.current = null;
      setControls({});
      setReason("");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <form className="tracking-update" onSubmit={submit}>
    <h3>{correction ? "Corrección del registro" : "Actualizar mis antecedentes"}</h3>
    <p>Solo se cambian los campos que edites. Puedes registrar aumentos o disminuciones reales.</p>
    <fieldset disabled={busy}>
      <div className="tracking-grid">{primaryFields.map(([name, label, type, nullable, options]) =>
        <label key={name}>{label}
          {options ? <select aria-label={label} value={controls[name]?.value ?? snapshot?.[name] ?? ""}
            onChange={(e) => change(name, { value: e.target.value, type, nullable, clear: false })}>
            <option value="" disabled>Selecciona</option>
            {options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
          </select> : <input aria-label={label} type={type} step="any"
            value={controls[name]?.value ?? snapshot?.[name] ?? ""}
            disabled={controls[name]?.clear}
            onChange={(e) => change(name, { value: e.target.value, type, nullable, clear: false })} />}
          {nullable && <span><input type="checkbox" checked={Boolean(controls[name]?.clear)}
            onChange={(e) => change(name, { clear: e.target.checked, type, nullable, value: snapshot?.[name] ?? "" })} />
            Borrar valor declarado</span>}
        </label>)}</div>
      <label>Motivo<input required value={reason} onChange={(e) => { pending.current = null; setReason(e.target.value); }} /></label>
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar actualización"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
