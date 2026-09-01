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

function ConditionGroup({ items, variant, label }) {
  if (!items || items.length === 0) return null;
  return (
    <details className={`benefit-condition-group benefit-condition-group--${variant}`}>
      <summary>
        <strong className={`benefit-detail-label benefit-detail-label--${variant}`}>{label}</strong>
        <span>{items.length}</span>
      </summary>
      <ConditionList items={items} variant={variant} />
    </details>
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
  const hasBenefitsAssessment = Array.isArray(data?.housing_benefits?.applicable_benefits);
  const disclaimer = data?.housing_benefits?.disclaimer || "";
  const summary = data?.housing_benefits?.summary || "";
  const eligibleCount = benefits.filter((b) => b.eligible).length;

  if (!evaluation) {
    return (
      <section className="section-block simulation-panel subsidios-page">
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
    <section className="section-block simulation-panel subsidios-page">
      <div className="section-heading">
        <span className="eyebrow">Subsidios</span>
        <h1>Beneficios habitacionales</h1>
        {summary && <p>{summary}</p>}
      </div>

      {hasBenefitsAssessment ? <>
        <div className="simulation-summary-bar">
          <div className="simulation-summary-stat">
            <strong>{eligibleCount}<small>/{benefits.length}</small></strong>
            <span>beneficios compatibles</span>
          </div>
          <div className="simulation-summary-copy">
            <strong>{eligibleCount > 0 ? "Alternativas compatibles para revisar" : "Sin alternativas compatibles por ahora"}</strong>
            <p className="simulation-summary-text">
              {eligibleCount > 0
                ? "Consulta los requisitos y pasos de cada beneficio."
                : "Revisa los requisitos pendientes para saber qué puedes fortalecer."}
            </p>
          </div>
        </div>

        {disclaimer && (
          <div className="simulation-disclaimer">
            <strong>Importante</strong>
            <p>{disclaimer}</p>
          </div>
        )}

        <div className="simulation-benefits-grid">
          {benefits.map((benefit) => (
          <article
            key={benefit.type}
            className={`benefit-card ${benefit.eligible ? "benefit-card--eligible" : ""}`}
          >
            <div className="benefit-card-header">
              <div>
                <h3 className="benefit-card-title">{benefit.name}</h3>
                <p className="benefit-card-notes">{benefit.notes}</p>
              </div>
              <span className={`benefit-badge ${benefit.eligible ? "benefit-badge--eligible" : "benefit-badge--ineligible"}`}>
                {benefit.eligible ? "Compatible" : "Requiere ajustes"}
              </span>
            </div>

            <div className="benefit-card-details">
              <ConditionGroup
                items={benefit.conditions_met}
                variant="met"
                label={`Cumples ${benefit.conditions_met.length} requisito${benefit.conditions_met.length === 1 ? "" : "s"}`}
              />
              <ConditionGroup
                items={benefit.conditions_not_met}
                variant="pending"
                label={`Por revisar ${benefit.conditions_not_met.length} requisito${benefit.conditions_not_met.length === 1 ? "" : "s"}`}
              />
            </div>

            {benefit.eligible && (
              <div className="benefit-card-actions">
                <button type="button" className="primary-button" onClick={() => openBenefitCapsule(benefit.academy_module)}>
                  Ver pasos en Academia
                </button>
              </div>
            )}
            {!benefit.eligible && benefit.conditions_not_met.length > 0 && (
              <div className="benefit-card-academy-link">
                <button type="button" className="text-button" onClick={() => openBenefitCapsule(benefit.academy_module)}>
                  Ver guía para avanzar
                </button>
              </div>
            )}
          </article>
          ))}
        </div>

      </> : <div className="empty-state"><strong>Esta evaluación no incluye el análisis de subsidios.</strong><p>Realiza una nueva preevaluación para generar el detalle de beneficios habitacionales.</p><button type="button" onClick={() => onNavigate?.("evaluate")}>Realizar nueva preevaluación</button></div>}

      <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <button type="button" className="secondary-button" onClick={goToRecommendations}>
          Volver a Recomendaciones
        </button>
      </div>
    </section>
  );
}
