import React from "react";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));

export default function SuggestedAlternatives({ alternatives, onTry }) {
  if (!alternatives?.length) return null;
  return (
    <section className="suggested-alternatives" aria-labelledby="suggested-alternatives-title">
      <h3 id="suggested-alternatives-title">Alternativas para acercarte a tu objetivo</h3>
      <p>Prueba un ajuste antes de aplicarlo.</p>
      <div>{alternatives.map((alternative) => (
        <article key={alternative.id}>
          <header><span className="suggested-alternatives__icon"><i className="ti ti-adjustments" aria-hidden="true" /></span><h4>{alternative.title}</h4></header>
          <dl>
            <div><dt>Actual</dt><dd>{money(alternative.current)}</dd></div>
            <div><dt>Alternativa</dt><dd>{money(alternative.suggested)}</dd></div>
            <div><dt>Diferencia</dt><dd>+{money(alternative.difference)}</dd></div>
          </dl>
          <footer>
            <p><span>Dividendo estimado</span><strong>{money(alternative.result?.dividendo_clp)} / mes</strong><span>{alternative.result?.financial_status || "Referencial"}</span></p>
            <button type="button" className="secondary-button" onClick={() => onTry(alternative.draft)}>Probar ajuste <i className="ti ti-arrow-right" aria-hidden="true" /></button>
          </footer>
        </article>
      ))}</div>
    </section>
  );
}
