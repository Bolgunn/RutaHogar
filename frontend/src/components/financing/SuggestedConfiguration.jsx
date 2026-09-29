import React from "react";
import SectionNumber from "./SectionNumber";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const oneDecimal = (value) => Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function SuggestedConfiguration({ draft, result, suggestedDraft, suggestedResult, benefit, onUse }) {
  if (!draft || !result || !suggestedDraft || !suggestedResult) return null;
  const price = Number(suggestedResult.precio_clp) || 0;
  const piePercent = price > 0 ? (Number(suggestedResult.pie_clp || 0) / price) * 100 : 0;
  const income = Number(suggestedResult.renta_total_clp) || 0;
  const complementaryIncome = suggestedDraft.usar_renta_complementaria !== false ? Number(suggestedDraft.renta_complementaria_clp) || 0 : 0;
  const benefitLabel = benefit?.selected ? benefit?.entry?.name || benefit?.entry?.title || benefit.selected : "Sin subsidio seleccionado";
  return <section className="suggested-configuration" aria-labelledby="suggested-configuration-title">
    <header><SectionNumber number="3" /><div><h3 id="suggested-configuration-title">Configuración referencial sugerida</h3><p>Referencia basada en tu vivienda, evaluación y los supuestos actuales.</p></div></header>
    <article className="suggested-configuration__card">
      <div className="suggested-configuration__values"><div><small>Pie sugerido</small><strong>{money(suggestedResult.pie_clp)}</strong><span>{oneDecimal(piePercent)}% del valor</span></div><div><small>Plazo</small><strong>{suggestedDraft.plazo_anios} años</strong><span>Tasa {oneDecimal(Number(suggestedDraft.tasa_anual || 0) * 100)}% anual</span></div><div><small>Crédito referencial</small><strong>{money(suggestedResult.credito_clp)}</strong><span>Renta {money(income)}{complementaryIncome > 0 ? ` · Complementaria ${money(complementaryIncome)}` : ""}</span></div><div><small>Subsidio seleccionado</small><strong>{benefitLabel}</strong><span>{suggestedResult.financial_status}</span></div></div>
      <details className="suggested-configuration__explanation"><summary>Ver cómo se calculó</summary><p>Se consideraron el precio de la vivienda, tu pie e ingresos declarados, la renta complementaria si está activa, el plazo, la tasa referencial y el subsidio que seleccionaste. No se agregó ningún subsidio automáticamente.</p></details>
      <button type="button" className="primary-button" onClick={() => onUse(suggestedDraft)}>Usar esta configuración</button>
    </article>
  </section>;
}
