import React from "react";
import { historicalScenarioView, scenarioDifferences } from "../../lib/financing/scenarioComparison";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const decimal = (value, digits = 1) => Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const statusTone = (status) => status === "Compatible" ? "compatible" : status === "Cercano" ? "near" : "adjustment";
const statusRank = (status) => status === "Compatible" ? 2 : status === "Cercano" ? 1 : 0;

function numericDelta(left, right, format, preferredDirection) {
  const difference = Number(right || 0) - Number(left || 0);
  if (Math.abs(difference) < 0.005) return { label: "Sin cambio", tone: "neutral" };
  const direction = difference > 0 ? 1 : -1;
  const preferred = preferredDirection === "higher" ? 1 : preferredDirection === "lower" ? -1 : 0;
  return {
    label: `${direction > 0 ? "+" : "−"}${format(Math.abs(difference))}`,
    tone: preferred === 0 ? "neutral" : direction === preferred ? "better" : "worse",
  };
}

function textDelta(left, right) {
  return left === right ? { label: "Sin cambio", tone: "neutral" } : { label: "Dato distinto", tone: "neutral" };
}

function classificationDelta(left, right) {
  const difference = statusRank(right) - statusRank(left);
  return difference === 0 ? { label: "Sin cambio", tone: "neutral" } : difference > 0 ? { label: "Mejora", tone: "better" } : { label: "Empeora", tone: "worse" };
}

function valueRows(left, right) {
  return [
    ["Clasificación", <small className={`financing-saved__status is-${statusTone(left.status)}`}>{left.status}</small>, <small className={`financing-saved__status is-${statusTone(right.status)}`}>{right.status}</small>, classificationDelta(left.status, right.status)],
    ["Vivienda", left.project, right.project, textDelta(left.project, right.project)],
    ["Precio de vivienda", `${decimal(left.priceUf)} UF · ${money(left.price)}`, `${decimal(right.priceUf)} UF · ${money(right.price)}`, numericDelta(left.priceUf, right.priceUf, (value) => `${decimal(value)} UF`, "neutral")],
    ["Pie", `${decimal(left.pieUf)} UF · ${decimal(left.piePercent)}%`, `${decimal(right.pieUf)} UF · ${decimal(right.piePercent)}%`, numericDelta(left.pieUf, right.pieUf, (value) => `${decimal(value)} UF`, "higher")],
    ["Subsidio / beneficio", left.benefit, right.benefit, textDelta(left.benefit, right.benefit)],
    ["Monto de subsidio", left.benefitAmount > 0 ? money(left.benefitAmount) : "No incorporado", right.benefitAmount > 0 ? money(right.benefitAmount) : "No incorporado", numericDelta(left.benefitAmount, right.benefitAmount, money, "higher")],
    ["Crédito", money(left.credit), money(right.credit), numericDelta(left.credit, right.credit, money, "lower")],
    ["Plazo", `${left.term} años`, `${right.term} años`, numericDelta(left.term, right.term, (value) => `${value} años`, "neutral")],
    ["Tasa referencial", `${decimal(left.annualRate, 2)}% anual`, `${decimal(right.annualRate, 2)}% anual`, numericDelta(left.annualRate, right.annualRate, (value) => `${decimal(value, 2)} pp`, "lower")],
    ["Dividendo estimado", `${money(left.dividend)} / mes`, `${money(right.dividend)} / mes`, numericDelta(left.dividend, right.dividend, money, "lower")],
    ["Renta considerada", money(left.income), money(right.income), numericDelta(left.income, right.income, money, "higher")],
    ["Renta complementaria", left.complementaryIncome > 0 ? money(left.complementaryIncome) : "No incluye", right.complementaryIncome > 0 ? money(right.complementaryIncome) : "No incluye", numericDelta(left.complementaryIncome, right.complementaryIncome, money, "higher")],
    ["Carga financiera", `${decimal(left.burdenPercent, 2)}%`, `${decimal(right.burdenPercent, 2)}%`, numericDelta(left.burdenPercent, right.burdenPercent, (value) => `${decimal(value, 2)} pp`, "lower")],
    ["Fecha / horizonte", left.horizon, right.horizon, textDelta(left.horizon, right.horizon)],
  ];
}

export default function ScenarioComparison({ scenarios, onClose }) {
  if (!Array.isArray(scenarios) || scenarios.length !== 2) return null;
  const [left, right] = scenarios.map(historicalScenarioView);
  const differences = scenarioDifferences(scenarios[0], scenarios[1]);
  return <div className="financing-confirmation-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="financing-comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="scenario-comparison-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">Escenarios guardados</span><h3 id="scenario-comparison-title">Comparación de escenarios</h3><p>Los valores corresponden a los snapshots guardados y no se recalculan.</p></div><button type="button" className="financing-comparison-dialog__close" onClick={onClose} aria-label="Cerrar comparación">×</button></header>
      <div className="financing-comparison-table" role="table" aria-label="Comparación de escenarios guardados"><div role="row" className="financing-comparison-table__head"><span role="columnheader">Indicador</span><strong role="columnheader">{left.name}</strong><strong role="columnheader">{right.name}</strong><strong role="columnheader">Delta</strong></div>{valueRows(left, right).map(([label, leftValue, rightValue, delta]) => <div role="row" key={label}><span role="cell">{label}</span><span role="cell">{leftValue}</span><span role="cell">{rightValue}</span><strong role="cell" className={`financing-comparison-table__delta is-${delta.tone}`}>{delta.label}</strong></div>)}</div>
      <section className="financing-comparison-differences" aria-labelledby="scenario-differences-title"><h4 id="scenario-differences-title">Principales diferencias</h4>{differences.length ? <ul>{differences.map((difference) => <li key={difference}>{difference}</li>)}</ul> : <p>Los escenarios no presentan diferencias relevantes en los valores comparados.</p>}</section>
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cerrar comparación</button></footer>
    </section>
  </div>;
}
