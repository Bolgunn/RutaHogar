import React, { useEffect, useRef, useState } from "react";
import FieldTooltip from "../FieldTooltip";
import { rangeSimulationOptions } from "../../lib/financing/benefitScenario";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const uf = (clp, value) => Number(value) > 0 ? Number(clp || 0) / Number(value) : 0;
const percentage = (value, total) => Number(total) > 0 ? (Number(value || 0) / Number(total)) * 100 : 0;
const ufLabel = (value) => `${Number(value || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })} UF`;
const oneDecimal = (value) => Math.round(Number(value || 0) * 10) / 10;
const preventWheel = (event) => event.currentTarget.blur();
const amountLabel = (value) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));

export function formattedAmountCursorPosition(formatted, digitsBeforeCursor) {
  if (digitsBeforeCursor === 0) return 0;
  let seenDigits = 0;
  let position = formatted.length;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) seenDigits += 1;
    if (seenDigits >= digitsBeforeCursor) { position = index + 1; break; }
  }
  return position;
}

export function normalizedDecimalInput(value, { maxIntegerDigits = 3, decimalPlaces = 2 } = {}) {
  const rawValue = String(value).replace(",", ".");
  const pattern = new RegExp(`^\\d{0,${maxIntegerDigits}}(?:\\.\\d{0,${decimalPlaces}})?$`);
  if (!pattern.test(rawValue)) return null;
  const parsed = Number(rawValue);
  return {
    rawValue,
    value: rawValue === "" || rawValue === "." ? 0 : Number.isFinite(parsed) ? parsed : null,
  };
}

function FormattedAmountInput({ value, onChange, ...props }) {
  const inputRef = useRef(null);
  const maxDigits = props.maxDigits || 12;
  const maxLength = maxDigits + Math.floor((maxDigits - 1) / 3);
  const changeValue = (event) => {
    const digitsBeforeCursor = event.target.value.slice(0, event.target.selectionStart || 0).replace(/\D/g, "").length;
    const nextRaw = event.target.value.replace(/\D/g, "").slice(0, maxDigits);
    onChange(nextRaw === "" ? 0 : Number(nextRaw));
    const formatted = amountLabel(nextRaw === "" ? 0 : nextRaw);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const position = formattedAmountCursorPosition(formatted, digitsBeforeCursor);
      input.setSelectionRange(position, position);
    });
  };
  const { maxDigits: _maxDigits, ...inputProps } = props;
  return <input {...inputProps} ref={inputRef} type="text" inputMode="numeric" autoComplete="off" maxLength={maxLength}
    value={amountLabel(value)} onChange={changeValue} />;
}

function DecimalInput({ value, onChange, maxIntegerDigits = 3, decimalPlaces = 2, ...props }) {
  const numericValue = () => Number(String(value ?? 0).replace(",", ".")) || 0;
  const [rawValue, setRawValue] = useState(() => String(numericValue()));
  const isEditing = useRef(false);
  useEffect(() => {
    if (!isEditing.current) setRawValue(String(numericValue()));
  }, [value]);
  const maxLength = maxIntegerDigits + (decimalPlaces ? decimalPlaces + 1 : 0);
  const changeValue = (event) => {
    const next = normalizedDecimalInput(event.target.value, { maxIntegerDigits, decimalPlaces });
    if (!next) return;
    setRawValue(next.rawValue);
    if (next.value !== null) onChange(next.value);
  };
  return <input {...props} type="text" inputMode="decimal" maxLength={maxLength} value={rawValue}
    onFocus={() => { isEditing.current = true; }}
    onBlur={() => { isEditing.current = false; setRawValue(String(numericValue())); }}
    onChange={changeValue} />;
}

function SummaryCard({ title, children, icon, tone = "blue" }) {
  return <article className={`financing-summary-card is-${tone}`}><header><span className="financing-summary-card__icon"><i className={`ti ${icon}`} aria-hidden="true" /></span><small>{title}</small></header>{children}</article>;
}

export default function FinancingOverview({ draft, result, ufReference }) {
  if (!draft || !result) return null;
  const ufValue = Number(ufReference?.uf_value_clp) || 0;
  const price = Number(result.precio_clp) || 0;
  const pie = Number(result.pie_clp) || 0;
  const credit = Number(result.credito_clp) || 0;
  const benefit = result.benefit || {};
  const isRange = benefit.amount_kind === "range" && Array.isArray(benefit.estimated_range_clp);
  const hasSelectedRange = benefit.amount_kind === "range_selected";
  const knownBenefit = !isRange && Number(result.subsidio_principal_clp) > 0;
  const rangeAmounts = benefit.range_reference_clp || benefit.estimated_range_clp;
  const rangeReferenceOptions = rangeSimulationOptions(rangeAmounts);
  const rangeBounds = rangeReferenceOptions.length
    ? [rangeReferenceOptions[0].amount, rangeReferenceOptions.at(-1).amount]
    : null;
  const benefitUfRange = rangeBounds ? rangeBounds.map((amount) => uf(amount, ufValue)) : null;
  const rangeLabel = benefitUfRange ? `${ufLabel(benefitUfRange[0])} a ${ufLabel(benefitUfRange[1])}` : "Rango no disponible";
  const segments = [
    { id: "pie", label: "Pie", amount: pie, tone: "pie" },
    ...(knownBenefit ? [{ id: "benefit", label: "Beneficio", amount: Number(result.subsidio_principal_clp), tone: "benefit" }] : []),
    { id: "credit", label: "Crédito referencial", amount: credit, tone: "credit" },
  ].filter((segment) => segment.amount > 0);

  return <section className="financing-overview" aria-label="Resumen del financiamiento">
    <div className="financing-summary-grid">
      <SummaryCard title="Precio de vivienda" icon="ti-home"><strong>{ufLabel(result.precio_uf)}</strong><span>{money(price)}</span></SummaryCard>
      <SummaryCard title="Tu pie" icon="ti-wallet" tone="gold"><strong>{ufLabel(uf(pie, ufValue))}</strong><span>{money(pie)} · {percentage(pie, price).toFixed(2)}% del valor</span></SummaryCard>
      <SummaryCard title="Subsidio / beneficio" icon="ti-gift" tone="blue">{isRange ? <><strong>Rango referencial</strong><span>{rangeLabel}</span></> : hasSelectedRange ? <><strong>Monto simulado</strong><span>{ufLabel(uf(result.subsidio_principal_clp, ufValue))} · referencia elegida dentro del rango</span></> : knownBenefit ? <><strong>{benefit.amount_kind === "base" ? "Aporte base" : "Monto informado"}</strong><span>{ufLabel(uf(result.subsidio_principal_clp, ufValue))} · {money(result.subsidio_principal_clp)}</span></> : <><strong>Sin subsidio</strong><span>No se descuenta del financiamiento</span></>}</SummaryCard>
      <SummaryCard title="Crédito referencial" icon="ti-file-invoice" tone="navy"><strong>{ufLabel(uf(credit, ufValue))}</strong><span>{money(credit)}</span></SummaryCard>
      <SummaryCard title="Dividendo estimado" icon="ti-calendar-month"><strong>{money(result.dividendo_clp)} / mes</strong><span>Estimación referencial</span></SummaryCard>
    </div>

    <section className="financing-composition-visual" aria-label="Composición del financiamiento">
      <header><h3>Composición del financiamiento</h3><span>Total: {ufLabel(result.precio_uf)}</span></header>
      <div className="financing-composition-bar" role="img" aria-label={segments.map((segment) => `${segment.label} ${money(segment.amount)}`).join(", ")}>
        {segments.map((segment) => <span key={segment.id} className={`is-${segment.tone}`} style={{ width: `${percentage(segment.amount, price)}%` }}>{percentage(segment.amount, price) >= 12 ? `${percentage(segment.amount, price).toFixed(0)}%` : ""}</span>)}
      </div>
      <div className="financing-composition-legend">{segments.map((segment) => <span key={segment.id}><i className={`is-${segment.tone}`} aria-hidden="true" />{segment.label} <strong>{ufLabel(uf(segment.amount, ufValue))}</strong></span>)}</div>
      {isRange ? <p className="financing-composition-range">Rango referencial: {rangeLabel}. Selecciona un monto mínimo, intermedio o máximo para usarlo en esta simulación.</p> : hasSelectedRange ? <p className="financing-composition-range">Subsidio simulado: {ufLabel(uf(result.subsidio_principal_clp, ufValue))}. Referencia elegida dentro del rango {rangeLabel}. No constituye una asignación oficial.</p> : null}
    </section>

  </section>;
}

export function FinancingAdjustments({ draft, result, ufReference, terms = [], fromSuggested = false, hasDraftChanges = false, rangeAmountControlRef, isRangeAmountHighlighted = false, onRangeAmountInteraction = () => {}, onApply, onCancel, onPieChange, onCreditChange, onRangeAmountChange, onUpdate }) {
  if (!draft || !result) return null;
  const ufValue = Number(ufReference?.uf_value_clp) || 0;
  const price = Number(result.precio_clp) || 0;
  const pie = Number(result.pie_clp) || 0;
  const credit = Number(result.credito_clp) || 0;
  const benefit = result.benefit || {};
  const isRange = benefit.amount_kind === "range" && Array.isArray(benefit.estimated_range_clp);
  const hasSelectedRange = benefit.amount_kind === "range_selected";
  const complementaryEnabled = draft.usar_renta_complementaria !== false;
  const rangeAmounts = benefit.range_reference_clp || benefit.estimated_range_clp;
  const rangeOptions = rangeSimulationOptions(rangeAmounts);
  const selectedRangeAmount = Number(benefit.selected_range_amount_clp);
  const selectedOption = rangeOptions.find((option) => option.amount === selectedRangeAmount);
  const selectableRangeOptions = hasSelectedRange && Number.isFinite(selectedRangeAmount) && !selectedOption
    ? [...rangeOptions, { kind: "saved", label: "Monto seleccionado", amount: selectedRangeAmount }]
    : rangeOptions;

  return <section className="financing-adjustments" aria-labelledby="financing-adjustments-title">
      <header><div><h3 id="financing-adjustments-title">Ajusta tus supuestos</h3><p>{fromSuggested ? "Partiste desde la configuración referencial sugerida. Puedes modificar cualquier supuesto." : "Modifica los valores para ver cómo cambia tu financiamiento."}</p></div></header>
      <div className="financing-adjustments__grid">
        <label><span>Pie en UF <FieldTooltip text="Monto que aportarás inicialmente. Al modificarlo, RutaHogar recalcula el crédito referencial." /></span><DecimalInput maxIntegerDigits={7} decimalPlaces={1} value={oneDecimal(uf(pie, ufValue))} onWheel={preventWheel} onChange={(next) => onPieChange(next * ufValue)} /></label>
        <label><span>Pie (% del valor) <FieldTooltip text="Proporción del precio de vivienda que cubrirás con tu aporte inicial." /></span><DecimalInput maxIntegerDigits={3} decimalPlaces={2} value={percentage(pie, price).toFixed(2)} onWheel={preventWheel} onChange={(next) => onPieChange((next / 100) * price)} /></label>
        {(isRange || hasSelectedRange) ? <label ref={rangeAmountControlRef} className={`financing-adjustments__range-field${isRangeAmountHighlighted ? " is-highlighted" : ""}`}><span>Monto del subsidio a simular <FieldTooltip text="Este subsidio tiene un rango referencial. Elige el monto mínimo, intermedio o máximo que quieres usar en esta simulación. No constituye una asignación oficial." /></span><select value={hasSelectedRange ? String(benefit.selected_range_amount_clp) : ""} onFocus={onRangeAmountInteraction} onChange={(event) => { onRangeAmountInteraction(); onRangeAmountChange(event.target.value === "" ? null : Number(event.target.value)); }}><option value="">Selecciona un monto</option>{selectableRangeOptions.map((option) => <option key={`${option.kind}-${option.amount}`} value={option.amount}>{option.label} · {ufLabel(uf(option.amount, ufValue))}</option>)}</select><small className="financing-adjustments__range-help">{isRangeAmountHighlighted ? "Selecciona el monto que quieres usar en esta simulación." : "Este subsidio tiene un rango referencial. Elige el monto que quieres usar en esta simulación. No constituye una asignación oficial."}</small></label> : null}
        <label><span>Crédito referencial (CLP) <FieldTooltip text="Monto que necesitarías financiar después de tu pie y de un beneficio con monto definido. No es una aprobación bancaria." /></span><FormattedAmountInput value={credit} maxDigits={12} onWheel={preventWheel} onChange={onCreditChange} /></label>
        <label><span>Plazo <FieldTooltip text="Tiempo en años para pagar el crédito. Las opciones respetan el límite de edad de esta simulación." /></span><select value={draft.plazo_anios} onChange={(event) => onUpdate("plazo_anios", Number(event.target.value))}>{terms.map((term) => <option key={term} value={term}>{term} años</option>)}</select></label>
        <label><span>Tasa referencial anual (%) <FieldTooltip text="Tasa anual usada solo para estimar el dividendo mensual. La tasa final depende de la evaluación de la entidad financiera." /></span><DecimalInput maxIntegerDigits={3} decimalPlaces={2} value={(Number(draft.tasa_anual || 0) * 100).toFixed(2)} onWheel={preventWheel} onChange={(next) => onUpdate("tasa_anual", next / 100)} /></label>
        <label><span>Ingreso mensual <FieldTooltip text="Ingreso líquido mensual considerado para revisar la carga del dividendo en este escenario." /></span><FormattedAmountInput value={draft.renta_propia_clp} maxDigits={10} onWheel={preventWheel} onChange={(value) => onUpdate("renta_propia_clp", value)} /></label>
        <label className="financing-adjustments__toggle"><input type="checkbox" checked={complementaryEnabled} onChange={(event) => onUpdate("usar_renta_complementaria", event.target.checked)} />Complementar renta <FieldTooltip text="Incluye otro ingreso mensual en la referencia. No representa una evaluación crediticia de otra persona." /></label>
        {complementaryEnabled ? <label><span>Renta complementaria <FieldTooltip text="Monto mensual que se suma al ingreso considerado solo mientras mantengas activada la complementación de renta." /></span><FormattedAmountInput value={draft.renta_complementaria_clp ?? 0} maxDigits={10} onWheel={preventWheel} onChange={(value) => onUpdate("renta_complementaria_clp", value)} /></label> : null}
      </div>
      <div className="financing-income-composition"><strong>Renta considerada: {money(result.renta_total_clp)}</strong><span>{money(draft.renta_propia_clp)} propia + {money(complementaryEnabled ? draft.renta_complementaria_clp : 0)} complementaria</span></div>
      <footer className="financing-adjustments__footer"><div>{hasDraftChanges && <button type="button" className="secondary-button compact-button" onClick={onCancel}>Cancelar</button>}<button type="button" className="primary-button compact-button" onClick={onApply} disabled={!hasDraftChanges}>Aplicar cambios</button></div></footer>
    </section>;
}
