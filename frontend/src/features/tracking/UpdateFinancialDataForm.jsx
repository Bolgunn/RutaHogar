import React, { useRef, useState } from "react";
import { serializePatch } from "../../lib/tracking/display";
import { newTrackingCommand } from "../../services/trackingService";
import { formatFormValue } from "../../constants";
import { calculateAge } from "../../utils/helpers";

const mortgageTerms = [10, 15, 20, 25, 30];

const primaryFields = [
  { name: "ingreso_mensual", label: "Ingreso mensual", type: "currency", maxDigits: 10 },
  { name: "deuda_mensual", label: "Deuda mensual", type: "currency", maxDigits: 10 },
  { name: "ahorro_disponible", label: "Ahorro disponible", type: "currency", maxDigits: 12 },
  { name: "dividendo_estimado", label: "Dividendo estimado", type: "currency", maxDigits: 10, nullable: true },
  { name: "monto_morosidad", label: "Monto de morosidad", type: "currency", maxDigits: 12, nullable: true },
  { name: "morosidad_actual", label: "Morosidad actual", type: "select", options: ["si", "no"] },
  { name: "tipo_contrato", label: "Tipo de contrato", type: "select", options: ["indefinido", "plazo_fijo", "independiente", "honorarios_variable"] },
  { name: "continuidad_laboral", label: "Continuidad laboral", type: "select", options: [
    "menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios",
  ] },
  { name: "edad", label: "Edad", type: "number" },
  { name: "plazo_credito_hipotecario", label: "Plazo del crédito", type: "select", numeric: true, options: mortgageTerms },
];

const currencyMaxLength = (digits) => digits + Math.floor((digits - 1) / 3);

export function digitsBeforeCursor(value, cursor) {
  return String(value ?? "").slice(0, Math.max(0, cursor ?? 0)).replace(/\D/g, "").length;
}

export function cursorAfterDigits(value, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < String(value ?? "").length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen === digitCount) return index + 1;
  }
  return String(value ?? "").length;
}

export function formatTrackingCurrency(value, maxDigits = Number.POSITIVE_INFINITY) {
  const wholeValue = typeof value === "number" ? (Number.isFinite(value) ? Math.round(value) : "") : value;
  const digits = String(wholeValue ?? "").replace(/\D/g, "").slice(0, maxDigits);
  // Do not coerce while the person is editing. In particular, deleting the
  // leading 5 from 50.000 leaves 0000: Number(0000) used to collapse that to
  // 0, which made the remaining input appear to disappear. Grouping the raw
  // digits keeps the edit visible; serialization still persists it as 0.
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

function sameFieldValue(value, snapshotValue, type) {
  if (value === null) return snapshotValue == null;
  if (type === "currency" || type === "number") {
    const rawValue = type === "currency" ? String(value).replaceAll(".", "") : String(value);
    if (!rawValue.trim()) return snapshotValue == null || snapshotValue === "";
    return Number(rawValue) === Number(snapshotValue ?? 0);
  }
  return String(value ?? "") === String(snapshotValue ?? "");
}

export function hasUnsavedTrackingChanges(controls, snapshot) {
  return Object.entries(controls).some(([name, control]) => control.touched
    && !sameFieldValue(control.clear ? null : control.value, snapshot?.[name], control.type));
}

export function effectiveTrackingPatch(controls, snapshot) {
  const patch = serializePatch(controls);
  return Object.fromEntries(Object.entries(patch).filter(([name, value]) =>
    !sameFieldValue(value, snapshot?.[name], controls[name]?.type)));
}

export default function UpdateFinancialDataForm({ snapshot, previous, onSubmit, correction = false }) {
  const [controls, setControls] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const currencyRefs = useRef({});
  const change = (name, values) => {
    pending.current = null;
    setControls((old) => ({ ...old, [name]: { ...old[name], ...values, touched: true } }));
  };
  const changeCurrency = (field, event) => {
    const digitCount = digitsBeforeCursor(event.target.value, event.target.selectionStart);
    const value = formatTrackingCurrency(event.target.value, field.maxDigits);
    const cursor = cursorAfterDigits(value, digitCount);
    change(field.name, { value, type: field.type, nullable: Boolean(field.nullable), clear: false });
    requestAnimationFrame(() => {
      const input = currencyRefs.current[field.name];
      if (input && document.activeElement === input) input.setSelectionRange(cursor, cursor);
    });
  };
  const cancelChanges = () => {
    pending.current = null;
    setControls({});
    setReason("");
    setError("");
  };
  const hasUnsavedChanges = hasUnsavedTrackingChanges(controls, snapshot);
  let canSubmit = false;
  if (hasUnsavedChanges) {
    try { canSubmit = Object.keys(effectiveTrackingPatch(controls, snapshot)).length > 0; }
    catch { canSubmit = false; }
  }
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const patch = effectiveTrackingPatch(controls, snapshot);
      if (!Object.keys(patch).length) throw new Error("Modifica al menos un campo.");
      // An explicit age edit (including historical corrections) takes priority.
      const currentAge = correction || !snapshot?.birth_date ? null : calculateAge(snapshot.birth_date);
      if (!("edad" in patch) && Number.isInteger(currentAge) && currentAge !== Number(snapshot?.edad)) patch.edad = currentAge;
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
  const reasonHelpId = correction ? "tracking-correction-reason-help" : "tracking-update-reason-help";

  return <form className="tracking-update" onSubmit={submit} autoComplete="off">
    <h3>{correction ? "Corregir registro" : "Actualizar mis antecedentes"}</h3>
    <p>Solo se cambian los campos que edites. Para actualizar el avance del pie, modifica “Ahorro disponible” y guarda el cambio con su motivo.</p>
    <fieldset disabled={busy}>
      <div className="tracking-grid">{primaryFields.map((field) => {
        const value = controls[field.name]?.touched ? controls[field.name].value : snapshot?.[field.name] ?? (field.type === "currency" && !field.nullable ? 0 : "");
        const options = field.options && (value !== "" && !field.options.some((option) => String(option) === String(value))
          ? [...field.options, value] : field.options);
        return <label key={field.name}>{field.label}
          {field.type === "select" ? <select aria-label={field.label} value={value}
            onChange={(event) => change(field.name, { value: event.target.value, type: field.numeric ? "number" : field.type, nullable: false, clear: false })}>
            <option value="" disabled>Selecciona</option>
            {options.map((option) => <option key={option} value={option}>{field.name === "plazo_credito_hipotecario" ? `${option} años` : formatFormValue(option)}</option>)}
          </select> : field.type === "number" ? <input aria-label={field.label} type="number" step="1" value={value}
            onChange={(event) => change(field.name, { value: event.target.value, type: field.type, nullable: false, clear: false })} />
          : <input aria-label={field.label} type="text" inputMode="numeric" autoComplete="off"
            disabled={Boolean(controls[field.name]?.clear)}
            maxLength={currencyMaxLength(field.maxDigits)}
            ref={(input) => { currencyRefs.current[field.name] = input; }}
            value={formatTrackingCurrency(value, field.maxDigits)}
            onChange={(event) => changeCurrency(field, event)} />}
          {field.nullable && <span className="tracking-update__clear"><input type="checkbox"
            aria-label={`Borrar valor declarado: ${field.label}`} checked={Boolean(controls[field.name]?.clear)}
            onChange={(event) => change(field.name, { clear: event.target.checked, type: field.type,
              nullable: true, value: snapshot?.[field.name] ?? "" })} />Borrar valor declarado</span>}
        </label>;
      })}</div>
      <label>Motivo<textarea required rows="3" placeholder="Describe qué cambió en tus antecedentes." maxLength="500" value={reason} aria-describedby={reasonHelpId}
        onChange={(event) => { pending.current = null; setReason(event.target.value); }} /></label>
      <small id={reasonHelpId} className="tracking-update__reason-help">{reason.length}/500 caracteres</small>
      <div className="tracking-update__actions">
        {!correction && hasUnsavedChanges && <button className="secondary-button" disabled={busy} type="button" onClick={cancelChanges}>Cancelar</button>}
        <button className="primary-button" disabled={busy || !canSubmit} type="submit">{busy ? "Guardando…" : "Guardar actualización"}</button>
      </div>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
