import React from "react";
import { SubsidyIcon } from "./SubsidyIcons";

function DetailSection({ icon, title, children }) {
  return <section className="subsidy-detail__section"><span className="subsidy-detail__section-icon"><SubsidyIcon kind={icon} size={20} /></span><div><h4>{title}</h4>{children}</div></section>;
}

const summaryCards = [
  ["coins", "Beneficio referencial", "benefit"],
  ["coins", "Ahorro mínimo", "savings"],
  ["home", "Tipo de vivienda", "housing"],
  ["link", "Compatibilidad", "compatibility"],
];

export default function SubsidyDetailPanel({ subsidy, compatibility, isApplied, onApply, onClose }) {
  if (!subsidy) return null;
  return <aside className="subsidy-detail" aria-live="polite">
    <button type="button" className="subsidy-detail__close" aria-label="Cerrar detalle del subsidio" onClick={onClose}>×</button>
    <div className="subsidy-detail__heading"><div className={`subsidy-detail__icon is-${subsidy.icon}`}><SubsidyIcon kind={subsidy.icon} /></div><div><h3>{subsidy.title}</h3><span>{subsidy.tag}</span></div>{subsidy.officialUrl ? <a className="subsidy-detail__official-link" href={subsidy.officialUrl} target="_blank" rel="noreferrer" aria-label={`Ver información oficial de ${subsidy.title}`} title="Ver información oficial"><i className="ti ti-external-link" aria-hidden="true" /></a> : null}</div>
    <p className="subsidy-detail__intro">{subsidy.description}</p>
    <div className={`subsidy-detail__compatibility ${compatibility?.compatible ? "is-compatible" : "is-incompatible"}`}><strong>{compatibility?.compatible ? "Compatible con tu perfil" : "No aplicable actualmente"}</strong>{compatibility?.reasons?.length ? <p>{compatibility.reasons.slice(0, 2).join(" ")}</p> : <p>Tu evaluación cumple los requisitos que RutaHogar puede revisar.</p>}</div>
    <DetailSection icon="users" title="Perfil recomendado"><p>{subsidy.profile}</p></DetailSection>
    <DetailSection icon="building" title="Requisitos principales"><ul>{subsidy.requirements.map((item) => <li key={item}>{item}</li>)}</ul></DetailSection>
    <div className="subsidy-detail__summary">{summaryCards.map(([icon, label, field]) => {
      const isCompatibility = field === "compatibility";
      const value = isCompatibility ? (compatibility?.compatible ? "Compatible" : "Revisar requisitos") : subsidy.summary[field];
      return <article key={field}><SubsidyIcon kind={icon} size={19} /><small>{label}</small><strong className={isCompatibility && compatibility?.compatible ? "is-compatible" : isCompatibility ? "is-incompatible" : ""}>{value}</strong></article>;
    })}</div>
    <div className="subsidy-detail__actions"><button type="button" className="primary-button" onClick={() => onApply(subsidy)}>{isApplied ? "Aplicado a esta simulación" : compatibility?.compatible ? "Seleccionar este subsidio" : "Explorar como supuesto"} <span aria-hidden="true">→</span></button>{isApplied ? <p className="subsidy-detail__applied">El resultado de crédito se actualizó.</p> : null}</div>
  </aside>;
}
