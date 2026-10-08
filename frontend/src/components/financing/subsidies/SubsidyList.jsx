import React from "react";
import { SubsidyIcon } from "./SubsidyIcons";

export function SubsidyListItem({ subsidy, selected, compatibility, onSelect }) {
  return <article className={`subsidy-list-item ${selected ? "is-selected" : ""}`}>
    <div className={`subsidy-list-item__icon is-${subsidy.icon}`}><SubsidyIcon kind={subsidy.icon} /></div>
    <div className="subsidy-list-item__title"><strong>{subsidy.title}</strong><span>{subsidy.tag}</span><em className={compatibility?.compatible ? "is-compatible" : "is-incompatible"}>{compatibility?.compatible ? "Compatible" : "Revisar requisitos"}</em></div>
    <button type="button" className="subsidy-list-item__detail" onClick={() => onSelect(subsidy.id)}>Ver detalle <span aria-hidden="true">→</span></button>
  </article>;
}

export default function SubsidyList({ subsidies, selectedId, compatibilityById, onSelect }) {
  if (!subsidies.length) return <p className="subsidy-list__empty">No encontramos subsidios compatibles con los datos actuales. Puedes revisar todos para explorar sus requisitos.</p>;
  return <div className="subsidy-list">{subsidies.map((subsidy) => <SubsidyListItem key={subsidy.id} subsidy={subsidy} selected={subsidy.id === selectedId} compatibility={compatibilityById[subsidy.id]} onSelect={onSelect} />)}</div>;
}
