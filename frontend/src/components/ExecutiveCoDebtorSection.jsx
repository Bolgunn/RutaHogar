import React from "react";
import { formatFormValue } from "../constants";
import { historicalWarningLabels, participationLabels } from "../constants/bipersonal";
import { staffEvaluationType, staffSourceLabels, staffRiskLabels, staffRiskSeverities } from "../lib/commercial/bipersonalProjection";
import { formatClp } from "../utils/helpers";
import StaffParticipationBadge from "./StaffParticipationBadge";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const pesos = (value) => finite(value) ? formatClp(value) : "No disponible";
const units = (value) => finite(value) ? `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)} UF` : "No disponible";
function Amount({ value }) {
  return <><strong>{finite(value?.purchase_capacity_clp) ? pesos(value.purchase_capacity_clp) : units(value?.purchase_capacity_uf)}</strong>{finite(value?.purchase_capacity_clp) && finite(value?.purchase_capacity_uf) && <small>{units(value.purchase_capacity_uf)}</small>}</>;
}
function Row({ label, children }) { return <div className="admin-definition-row"><dt>{label}</dt><dd>{children}</dd></div>; }
export function ExecutiveCoDebtorSection({ coDebtor }) {
  if (!staffEvaluationType(coDebtor)) return <section className="admin-panel-card"><h3>Participación financiera</h3><p>La proyección de participación no está disponible para esta evaluación.</p></section>;
  const visible = coDebtor.visibility === "visible";
  const co = visible ? coDebtor.co_debtor : null;
  const capacity = visible ? coDebtor.capacity : null;
  const warnings = (coDebtor.warnings || []).filter((code) => historicalWarningLabels[code]);
  return <section className="admin-panel-card executive-co-debtor staff-bipersonal" aria-labelledby="executive-co-debtor-title">
    <header className="admin-panel-card__header"><h3 id="executive-co-debtor-title">Participación financiera</h3><StaffParticipationBadge projection={coDebtor} /></header>
    <p>{participationLabels[coDebtor.status] || "Estado de participación no disponible"}</p>
    {warnings.map((code) => <p className="warning-note" key={code}>{historicalWarningLabels[code]}</p>)}
    {!visible && <p className="staff-bipersonal__privacy">El desglose del co-deudor y sus aportes no están disponibles para consulta.</p>}
    <div className="staff-bipersonal__people">
      <section><h4>Titular</h4><dl className="admin-definition-list">
        <Row label="Ingreso considerado">{pesos(coDebtor.holder?.income)}</Row>
        <Row label="Deuda mensual considerada">{pesos(coDebtor.holder?.debt)}</Row>
        <Row label="Tipo de contrato">{formatFormValue(coDebtor.holder?.contract, "No disponible")}</Row>
      </dl></section>
      <section><h4>Co-deudor</h4>
        {visible && <p><strong>Procedencia:</strong> {staffSourceLabels[coDebtor.source] || "Procedencia no disponible"}</p>}
        {co && <dl className="admin-definition-list">
          <Row label="Ingreso considerado">{pesos(co.income_considered)}</Row>
          <Row label="Deuda mensual considerada">{pesos(co.debt_considered)}</Row>
          <Row label="Tipo de contrato">{formatFormValue(co.contract, "No disponible")}</Row>
          <Row label="Morosidad">{formatFormValue(co.delinquency, "No disponible")}</Row>
          {Number.isInteger(coDebtor.used_revision?.revision_number) && <Row label="Revisión utilizada">{coDebtor.used_revision.revision_number}</Row>}
          <Row label="Relación utilizada">{formatFormValue(coDebtor.relation?.value, "No disponible")}</Row>
        </dl>}
        {visible && !co && <p>Sin desglose confirmado utilizado disponible.</p>}
        {visible && coDebtor.relation?.modified_after_acceptance === true && <p>Relación modificada por el titular después de la aceptación inicial.</p>}
      </section>
    </div>
    {capacity && <section><h4>Capacidad y aporte financiero</h4><dl className="admin-definition-list">
      <Row label="Capacidad del titular solo"><Amount value={capacity.without_complement} /></Row>
      <Row label="Capacidad de la evaluación"><Amount value={capacity.with_complement} /></Row>
      <Row label="Aporte a la capacidad de compra"><Amount value={capacity.delta} /></Row>
      {(finite(capacity.delta?.income_capacity_clp) || finite(capacity.delta?.income_capacity_uf)) && <Row label="Aporte a la capacidad por renta"><Amount value={{ purchase_capacity_clp: capacity.delta.income_capacity_clp, purchase_capacity_uf: capacity.delta.income_capacity_uf }} /></Row>}
    </dl></section>}
    {visible && !capacity && <p>Comparación de capacidad y aporte no disponible.</p>}
    {visible && coDebtor.has_other_active_participations === true && <p className="staff-bipersonal__info"><strong>Co-deudor:</strong> Posee otras participaciones confirmadas vigentes</p>}
    {visible && (coDebtor.risks || []).length > 0 && <section><h4>Riesgos informados</h4><ul className="staff-bipersonal__risks">{coDebtor.risks.map((risk, index) => {
      const [label, tone] = staffRiskSeverities[risk.severity] || ["Severidad no informada", "neutral"];
      return <li className={`staff-bipersonal__risk is-${tone}`} key={index}><strong>{staffRiskLabels[risk.code] || "Riesgo informado por la evaluación"}</strong><span>{label}</span><small>{risk.scope === "co_debtor" ? "Co-deudor" : risk.scope === "evaluation" ? "Evaluación" : "Ámbito no informado"}</small></li>;
    })}</ul></section>}
    {visible && coDebtor.historical_visible_until && <p>Desglose histórico disponible hasta {new Date(coDebtor.historical_visible_until).toLocaleString("es-CL")}.</p>}
  </section>;
}
export default ExecutiveCoDebtorSection;
