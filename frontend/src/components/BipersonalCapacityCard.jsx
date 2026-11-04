import React from "react";
import { formatFormValue } from "../constants";
import { evaluationTypeLabels, historicalWarningLabels, participationLabels } from "../constants/bipersonal";
import { formatClp } from "../utils/helpers";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const uf = (value) => finite(value) ? `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)} UF` : "No disponible";
const clp = (value) => finite(value) ? formatClp(value) : "No disponible";
function Amount({ pesos, units }) {
  return <><strong>{finite(pesos) ? clp(pesos) : uf(units)}</strong>{finite(pesos) && finite(units) && <small>{uf(units)}</small>}</>;
}
function Field({ label, children }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }

export default function BipersonalCapacityCard({ projection, updating = false, message = "", error = "", onUpdate, onRefresh }) {
  const supported = projection?.version === "hu30-projection-v1" && evaluationTypeLabels[projection.evaluation_type];
  if (!supported) return <section className="co-debtor-section"><h2>Participación del co-deudor</h2><p>La información de participación no está disponible para este resultado.</p></section>;
  const confirmed = projection.evaluation_type === "bipersonal_confirmed";
  const visible = projection.visibility === "visible";
  const capacity = projection.capacity;
  const delta = capacity?.delta;
  const warnings = (projection.warnings || []).filter((code) => historicalWarningLabels[code]);
  const currentStatus = projection.current_participation?.status || projection.status;
  const currentConfirmed = currentStatus === "confirmed" && Boolean(projection.current_revision);
  const coincident = projection.matching_confirmed_later === true;
  const pending = currentConfirmed && projection.update_required === true && !coincident;
  return <section className="co-debtor-section bipersonal-capacity" aria-labelledby="bipersonal-title">
    <header className="co-debtor-section__header"><div><span className="eyebrow">Tu evaluación</span><h2 id="bipersonal-title">{confirmed ? "Capacidad Bipersonal" : "Participación del co-deudor"}</h2></div>{!coincident && <span className="co-debtor-section__status">{evaluationTypeLabels[projection.evaluation_type]}</span>}</header>
    <p className="bipersonal-capacity__participation" role="status">{pending
      ? "Participación confirmada — pendiente de incorporar a tu evaluación"
      : coincident ? "Participación confirmada"
      : participationLabels[currentStatus] || "Estado de participación no disponible"}</p>
    {projection.evaluation_type === "individual" && <p>Esta evaluación considera la capacidad individual del titular.</p>}
    {coincident && <><p>Los antecedentes fueron confirmados posteriormente y coinciden con los utilizados en esta evaluación.</p><p className="co-debtor-section__note">{projection.evaluation_type === "declared_complement"
      ? "Esta evaluación fue calculada originalmente con antecedentes declarados. Como la confirmación posterior coincidió con esos antecedentes, no fue necesario recalcularla."
      : "Esta evaluación conserva los antecedentes y la confirmación utilizados originalmente. La confirmación posterior coincidió con esos antecedentes, por lo que no fue necesario recalcularla."}</p></>}
    {projection.evaluation_type === "declared_complement" && !coincident && <p className="co-debtor-section__note">Esta evaluación se calculó con antecedentes declarados y no utilizó una confirmación del co-deudor. Su procedencia histórica se conserva.</p>}
    {projection.evaluation_type === "unverifiable_origin" && <p>No contamos con respaldo suficiente para presentar una capacidad bipersonal confirmada.</p>}
    {warnings.map((code) => <p className="warning-note" key={code}>{historicalWarningLabels[code]}</p>)}
    {!visible && projection.evaluation_type !== "declared_complement" && !warnings.some((code) => ["historical_details_hidden", "closure_time_unknown"].includes(code)) && <p className="warning-note">El desglose del co-deudor no está disponible para consulta.</p>}
    {visible && confirmed && <>
      <dl className="co-debtor-section__details">
        <Field label="Ingreso del titular considerado">{clp(projection.holder?.income)}</Field>
        <Field label="Ingreso del co-deudor considerado">{clp(projection.co_debtor?.income_considered)}</Field>
        <Field label="Deuda mensual del titular">{clp(projection.holder?.debt)}</Field>
        <Field label="Deuda mensual del co-deudor">{clp(projection.co_debtor?.debt_considered)}</Field>
        <Field label="Deuda mensual consolidada">{clp(projection.financial_totals?.debt)}</Field>
        <Field label="Relación utilizada">{projection.relation?.value ? formatFormValue(projection.relation.value) : "No disponible"}</Field>
        <Field label="Capacidad de compra del titular solo"><Amount pesos={capacity?.without_complement?.purchase_capacity_clp} units={capacity?.without_complement?.purchase_capacity_uf} /></Field>
        <Field label="Capacidad de compra bipersonal"><Amount pesos={capacity?.with_complement?.purchase_capacity_clp} units={capacity?.with_complement?.purchase_capacity_uf} /></Field>
        <Field label="Aporte del co-deudor a la capacidad de compra"><Amount pesos={delta?.purchase_capacity_clp} units={delta?.purchase_capacity_uf} /></Field>
        {(finite(delta?.income_capacity_uf) || finite(delta?.income_capacity_clp)) && <Field label="Aporte a la capacidad por renta"><Amount pesos={delta?.income_capacity_clp} units={delta?.income_capacity_uf} /></Field>}
      </dl>
      {finite(delta?.purchase_capacity_uf) && <p className="co-debtor-section__note">{delta.purchase_capacity_uf > 0 ? "El complemento aumenta tu capacidad de compra." : delta.purchase_capacity_uf === 0 ? "El complemento no modifica tu capacidad de compra en esta evaluación." : "La participación reduce tu capacidad de compra en esta evaluación, considerando ingresos y deudas."}</p>}
      {projection.availability === "insufficient_data" && <p>No hay información suficiente para mostrar todos los montos de esta evaluación.</p>}
      {projection.historical_visible_until && <p className="co-debtor-section__note">Desglose histórico disponible hasta {new Date(projection.historical_visible_until).toLocaleString("es-CL")}.</p>}
    </>}
    {projection.update_required === true && projection.matching_confirmed_later !== true && <div className="bipersonal-capacity__pending"><p>Hay antecedentes confirmados pendientes de incorporación. Actualiza tu evaluación cuando decidas utilizarlos.</p><button type="button" className="primary-button" onClick={onUpdate} disabled={updating}>{updating ? "Actualizando evaluación..." : "Actualizar score con datos confirmados"}</button></div>}
    {message && <p className="success-message" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {error && onRefresh && <button type="button" className="text-button" onClick={onRefresh} disabled={updating}>Refrescar estado</button>}
  </section>;
}
