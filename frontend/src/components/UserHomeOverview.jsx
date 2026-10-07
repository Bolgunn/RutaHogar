import React from "react";
import { formatScore } from "../utils/helpers";

export default function UserHomeOverview({ evaluation, score, summary, onNavigate, onStartEvaluation }) {
  if (!evaluation) {
    return <section className="home-start" aria-labelledby="home-start-title">
      <div className="home-start__intro">
        <span className="eyebrow">Tu primer paso</span>
        <h2 id="home-start-title">Conoce tu punto de partida</h2>
        <p>Una precalificación te ayuda a entender tu situación y qué preparar para comprar vivienda.</p>
        <button type="button" className="primary-button" onClick={onStartEvaluation}>Comenzar precalificación</button>
        <span className="home-start__hint">Ten a mano tus ingresos, deudas y ahorro disponible.</span>
      </div>
      <ol className="home-start__route" aria-label="Tu recorrido en RutaHogar">
        <li><span>01</span><div><strong>Conoce tu situación</strong><p>Obtén un resultado orientativo y comprende sus factores.</p></div></li>
        <li><span>02</span><div><strong>Prepara tu siguiente paso</strong><p>Revisa acciones para mejorar tu ahorro y tus antecedentes.</p></div></li>
        <li><span>03</span><div><strong>Explora tus alternativas</strong><p>Compara viviendas y posibles beneficios con más contexto.</p></div></li>
      </ol>
    </section>;
  }

  return <div className="home-overview">
    <section className="home-situation" aria-labelledby="home-situation-title">
      <header className="home-situation__head"><div><span className="eyebrow">Tu punto de partida</span><h2 id="home-situation-title">Tu situación actual</h2></div><span className="home-situation__date">Última evaluación<br /><strong>{summary.lastEvaluation}</strong></span></header>
      <div className="home-situation__body">
        <div className="home-situation__score">
          <span>Score orientativo</span>
          <div><strong>{score ? formatScore(score.score, "—") : "—"}</strong><span>/ 100</span></div>
          <span className="home-situation__classification">{score?.classification || "Sin clasificación"}</span>
          <button type="button" className="home-inline-link" onClick={() => onNavigate("recommendations")}>Entender mi resultado <i className="ti ti-arrow-right" aria-hidden="true" /></button>
        </div>
        <dl className="home-situation__details">
          <div><dt>Tu objetivo de vivienda</dt><dd>{summary.project}</dd></div>
          <div><dt>Capacidad de compra estimada</dt><dd>{summary.capacity}</dd></div>
          <div className="home-situation__gap"><dt>Brecha principal identificada</dt><dd>{summary.gap}</dd></div>
        </dl>
      </div>
    </section>
    <section className="home-next-step" aria-labelledby="home-next-title">
      <span className="home-next-step__icon"><i className="ti ti-route" aria-hidden="true" /></span>
      <span className="eyebrow">Tu siguiente paso</span>
      <h2 id="home-next-title">Avanza con un plan claro</h2>
      <p>Revisa tu plan de mejora para identificar las acciones que puedes trabajar según tu última evaluación.</p>
      <button type="button" className="primary-button" onClick={() => onNavigate("tracking")}>Ver mi plan de mejora <i className="ti ti-arrow-right" aria-hidden="true" /></button>
      <span className="home-next-step__note">Puedes avanzar a tu ritmo.</span>
    </section>
  </div>;
}
