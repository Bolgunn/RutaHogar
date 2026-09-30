import React from "react";
import { plazoLabels as timelineLabels, propertyLabels } from "../constants";

export default function ObjectiveReview({ evaluation, onBack }) {
  const onboarding = evaluation?.onboarding || {};
  const input = evaluation?.input || {};

  return (
    <section className="section-block objective-review">
      <button className="secondary-button compact-button" type="button" onClick={onBack}>Volver al Plan de Mejora</button>

      <div className="section-heading compact">
        <span className="eyebrow">Revisión de objetivo</span>
        <h1>Revisar alternativas</h1>
        <p>Si el objetivo se ve exigente, considera ajustar plazo, comuna, tipo de propiedad o dividendo esperado.</p>
      </div>

      <div className="profile-grid">
        <section className="profile-card">
          <strong>Objetivo actual</strong>
          <dl className="profile-details">
            <div>
              <dt>Comuna objetivo</dt>
              <dd>{onboarding.comuna_interes || input.comuna_objetivo || "No declarada"}</dd>
            </div>
            <div>
              <dt>Comuna alternativa</dt>
              <dd>{onboarding.comuna_alternativa || "No declarada"}</dd>
            </div>
            <div>
              <dt>Tipo de propiedad</dt>
              <dd>{propertyLabels[onboarding.tipo_propiedad] || "No declarado"}</dd>
            </div>
            <div>
              <dt>Plazo actual</dt>
              <dd>{timelineLabels[onboarding.plazo_compra] || "No declarado"}</dd>
            </div>
            <div>
              <dt>Dividendo esperado</dt>
              <dd>{input.dividendo_estimado ? `$${Number(input.dividendo_estimado).toLocaleString("es-CL")}` : "No declarado"}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-card">
          <strong>Orientación</strong>
          <p>
            No es necesario cambiar tu objetivo de inmediato. Usa esta revisión para comparar alternativas
            antes de repetir una precalificación o iniciar una evaluación bancaria formal.
          </p>
          <ul>
            <li>Revisar si el plazo declarado da espacio suficiente para ahorrar.</li>
            <li>Comparar comuna objetivo y comuna alternativa.</li>
            <li>Evaluar un dividendo esperado más holgado si el objetivo se siente exigente.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
