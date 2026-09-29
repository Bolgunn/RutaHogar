import React from "react";
import { historicalScenarioView, scenarioDifferences } from "../../lib/financing/scenarioComparison";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const decimal = (value, digits = 1) => Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const statusTone = (status) => status === "Compatible" ? "compatible" : status === "Cercano" ? "near" : "adjustment";

function valueRows(left, right) {
  return [
    ["Clasificación", <small className={`financing-saved__status is-${statusTone(left.status)}`}>{left.status}</small>, <small className={`financing-saved__status is-${statusTone(right.status)}`}>{right.status}</small>],
    ["Vivienda", left.project, right.project],
    ["Precio de vivienda", `${decimal(left.priceUf)} UF · ${money(left.price)}`, `${decimal(right.priceUf)} UF · ${money(right.price)}`],
    ["Pie", `${decimal(left.pieUf)} UF · ${decimal(left.piePercent)}%`, `${decimal(right.pieUf)} UF · ${decimal(right.piePercent)}%`],
    ["Subsidio / beneficio", left.benefit, right.benefit],
    ["Monto de subsidio", left.benefitAmount > 0 ? money(left.benefitAmount) : "No incorporado", right.benefitAmount > 0 ? money(right.benefitAmount) : "No incorporado"],
    ["Crédito", money(left.credit), money(right.credit)],
    ["Plazo", `${left.term} años`, `${right.term} años`],
    ["Tasa referencial", `${decimal(left.annualRate, 2)}% anual`, `${decimal(right.annualRate, 2)}% anual`],
    ["Dividendo estimado", `${money(left.dividend)} / mes`, `${money(right.dividend)} / mes`],
    ["Renta considerada", money(left.income), money(right.income)],
    ["Renta complementaria", left.complementaryIncome > 0 ? money(left.complementaryIncome) : "No incluye", right.complementaryIncome > 0 ? money(right.complementaryIncome) : "No incluye"],
    ["Carga financiera", `${decimal(left.burdenPercent, 2)}%`, `${decimal(right.burdenPercent, 2)}%`],
    ["Fecha / horizonte", left.horizon, right.horizon],
  ];
}

export default function ScenarioComparison({ scenarios, onClose }) {
  if (!Array.isArray(scenarios) || scenarios.length !== 2) return null;
  const [left, right] = scenarios.map(historicalScenarioView);
  const differences = scenarioDifferences(scenarios[0], scenarios[1]);
  return <div className="financing-confirmation-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="financing-comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="scenario-comparison-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">Escenarios guardados</span><h3 id="scenario-comparison-title">Comparación de escenarios</h3><p>Los valores corresponden a los snapshots guardados y no se recalculan.</p></div><button type="button" className="financing-comparison-dialog__close" onClick={onClose} aria-label="Cerrar comparación">×</button></header>
      <div className="financing-comparison-table" role="table" aria-label="Comparación de escenarios guardados"><div role="row" className="financing-comparison-table__head"><span role="columnheader">Indicador</span><strong role="columnheader">{left.name}</strong><strong role="columnheader">{right.name}</strong></div>{valueRows(left, right).map(([label, leftValue, rightValue]) => <div role="row" key={label}><span role="cell">{label}</span><span role="cell">{leftValue}</span><span role="cell">{rightValue}</span></div>)}</div>
      <section className="financing-comparison-differences" aria-labelledby="scenario-differences-title"><h4 id="scenario-differences-title">Principales diferencias</h4>{differences.length ? <ul>{differences.map((difference) => <li key={difference}>{difference}</li>)}</ul> : <p>Los escenarios no presentan diferencias relevantes en los valores comparados.</p>}</section>
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cerrar comparación</button></footer>
    </section>
  </div>;
}
