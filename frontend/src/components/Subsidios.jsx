import React, { useMemo } from "react";
import { buildRecommendations } from "../services/recommendationService";
import { ACADEMY_BENEFIT_CAPSULES } from "../constants/academyContent";

function ConditionList({ items, variant }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="benefit-conditions">
      {items.map((item) => (
        <li key={item} className={`benefit-condition benefit-condition--${variant}`}>
          <span className="benefit-condition-icon">{variant === "met" ? "\u2713" : "\u2717"}</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function Subsidios({ evaluation, onNavigate }) {
  const data = useMemo(() => buildRecommendations(evaluation), [evaluation]);
  const openBenefitCapsule = (academyModule) => {
    const articleId = ACADEMY_BENEFIT_CAPSULES[academyModule];
    if (articleId) onNavigate?.("academia", { articleId });
    else onNavigate?.("academia");
  };
  const goToRecommendations = () => onNavigate?.("recommendations");

  const benefits = data?.housing_benefits?.applicable_benefits || [];
  const disclaimer = data?.housing_benefits?.disclaimer || "";
  const summary = data?.housing_benefits?.summary || "";
  const eligibleCount = benefits.filter((b) => b.eligible).length;

  if (!evaluation) {
    return (
      <section className="section-block simulation-panel">
        <div className="section-heading">
          <span className="eyebrow">Subsidios</span>
          <h1>Beneficios habitacionales</h1>
        </div>
        <div className="empty-state">
          <strong>Aún no tienes una preevaluación.</strong>
          <p>Realiza una preevaluación para ver qué beneficios habitacionales podrían ser compatibles con tu perfil.</p>
          <button type="button" onClick={() => onNavigate?.("evaluate")}>Ir a precalificación</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block simulation-panel">
      <div className="section-heading">
        <span className="eyebrow">Subsidios</span>
        <h1>Beneficios habitacionales</h1>
        <p>{summary}</p>
      </div>

      <div className="simulation-summary-bar">
        <div className="simulation-summary-stat">
          <strong>{eligibleCount}</strong>
          <span>de {benefits.length} compatibles</span>
        </div>
        <p className="simulation-summary-text">
          {eligibleCount > 0
            ? "Tu perfil podría calificar para algunos de estos beneficios. Revisa los detalles abajo."
            : "Ningún beneficio es compatible actualmente, pero algunos requisitos pueden fortalecerse."}
        </p>
      </div>

      <div className="simulation-benefits-grid">
        {benefits.map((benefit) => (
          <article
            key={benefit.type}
            className={`benefit-card ${benefit.eligible ? "benefit-card--eligible" : ""}`}
          >
            <div className="benefit-card-header">
              <h3 className="benefit-card-title">{benefit.name}</h3>
              <span className={`benefit-badge ${benefit.eligible ? "benefit-badge--eligible" : "benefit-badge--ineligible"}`}>
                {benefit.eligible ? "Compatible" : "Requiere ajustes"}
              </span>
            </div>

            <p className="benefit-card-notes">{benefit.notes}</p>

            <div className="benefit-card-details">
              {benefit.conditions_met.length > 0 && (
                <div className="benefit-card-detail-section">
                  <strong className="benefit-detail-label benefit-detail-label--met">
                    Requisitos cumplidos ({benefit.conditions_met.length})
                  </strong>
                  <ConditionList items={benefit.conditions_met} variant="met" />
                </div>
              )}
              {benefit.conditions_not_met.length > 0 && (
                <div className="benefit-card-detail-section">
                  <strong className="benefit-detail-label benefit-detail-label--pending">
                    Requisitos pendientes ({benefit.conditions_not_met.length})
                  </strong>
                  <ConditionList items={benefit.conditions_not_met} variant="pending" />
                  {!benefit.eligible && (
                    <div className="benefit-card-academy-link">
                      <button type="button" className="text-button" onClick={() => openBenefitCapsule(benefit.academy_module)}>
                        Descubre cómo cumplir este requisito en nuestra Academia Financiera
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {benefit.eligible && (
              <div className="benefit-card-actions">
                <button type="button" className="primary-button" onClick={() => openBenefitCapsule(benefit.academy_module)}>
                  Ver pasos en la Academia Financiera
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="simulation-disclaimer">
        <p>{disclaimer}</p>
      </div>

      <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <button type="button" className="secondary-button" onClick={goToRecommendations}>
          Volver a Recomendaciones
        </button>
      </div>
    </section>
  );
}
