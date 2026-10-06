import React from "react";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));

export default function SuggestedAlternatives({ alternatives, onTry }) {
  if (!alternatives?.length) return null;
  return <section className="suggested-alternatives" aria-labelledby="suggested-alternatives-title"><h3 id="suggested-alternatives-title">Cómo podrías acercarte a un escenario compatible</h3><p>Estas alternativas son referenciales y no modifican tu evaluación.</p><div>{alternatives.map((alternative) => <article key={alternative.id}><h4>{alternative.title}</h4><dl><div><dt>Actual</dt><dd>{money(alternative.current)}</dd></div><div><dt>Alternativa</dt><dd>{money(alternative.suggested)}</dd></div><div><dt>Diferencia</dt><dd>+{money(alternative.difference)}</dd></div></dl><p>Impacto estimado: dividendo {money(alternative.result?.dividendo_clp)} y estado {alternative.result?.financial_status || "referencial"}.</p><button type="button" className="secondary-button" onClick={() => onTry(alternative.draft)}>Probar esta alternativa</button></article>)}</div></section>;
}
