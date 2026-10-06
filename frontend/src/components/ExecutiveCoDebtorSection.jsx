import React from "react";

import { formatFormValue } from "../constants";
import { formatClp } from "../utils/helpers";

const confirmedFields = [
  ["ingreso_mensual_complementario", "Ingreso mensual", formatClp],
  ["deuda_mensual_complementario", "Deuda mensual", formatClp],
  ["tipo_contrato_complementario", "Tipo de contrato", formatFormValue],
  ["continuidad_laboral_complementario", "Continuidad laboral", formatFormValue],
  ["morosidad_complementario", "Morosidad", formatFormValue],
];

const statusCopy = {
  not_confirmed: ["No confirmado", "Datos declarados por el lead"],
  pending: ["Pendiente de confirmación", "Datos declarados por el lead"],
  expired: ["Invitación expirada", "Datos declarados por el lead"],
  confirmed: ["Co-deudor confirmado", "Antecedentes aportados por el co-deudor"],
  revoked: ["Consentimiento revocado", ""],
};

export function ExecutiveCoDebtorSection({ coDebtor }) {
  if (!coDebtor) return null;
  const [statusLabel, sourceLabel] = statusCopy[coDebtor.status] || statusCopy.not_confirmed;

  return <section className={`admin-panel-card executive-co-debtor executive-co-debtor--${coDebtor.status}`} aria-labelledby="executive-co-debtor-title">
    <div className="admin-panel-card__header">
      <div>
        <span className="eyebrow">Complemento de renta</span>
        <h3 id="executive-co-debtor-title">Co-deudor</h3>
      </div>
      <span className={`status-pill executive-co-debtor__status is-${coDebtor.status}`}>{statusLabel}</span>
    </div>

    {coDebtor.status === "revoked" ? <p className="executive-co-debtor__copy">Los antecedentes del co-deudor ya no están disponibles y no se utilizarán en futuras evaluaciones.</p> : <>
      <p className="executive-co-debtor__source"><strong>Procedencia:</strong> {sourceLabel}</p>
      {coDebtor.status === "pending" && <p className="executive-co-debtor__copy">El complemento todavía no está confirmado; el score existente puede haber usado antecedentes declarados por el lead.</p>}
      {coDebtor.status === "expired" && <p className="executive-co-debtor__copy">El complemento todavía no está confirmado; el score existente puede haber usado antecedentes declarados por el lead.</p>}
      {coDebtor.status === "confirmed" && <>
        <dl className="admin-definition-list executive-co-debtor__details">
          {confirmedFields.map(([field, label, formatter]) => <div key={field} className="admin-definition-row"><dt>{label}</dt><dd>{formatter(coDebtor.confirmed?.[field])}</dd></div>)}
          {coDebtor.relation?.value && <div className="admin-definition-row"><dt>Relación</dt><dd>{formatFormValue(coDebtor.relation.value)}<small>Declarada por el lead</small></dd></div>}
        </dl>
      </>}
    </>}
  </section>;
}

export default ExecutiveCoDebtorSection;
