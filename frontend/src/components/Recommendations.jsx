import React, { useEffect, useMemo, useRef, useState } from "react";
import BankingChecklist from "./BankingChecklist";
import { buildRecommendations } from "../services/recommendationService";

import {
  formatBooleanText,
  formatClp,
  formatScore,
  getClassificationAdjustment,
  getScoreBadgeClass,
  getUserResultFactors,
} from "../utils/helpers";
import GlossaryTerm, { splitTextWithGlossaryTerms } from "./GlossaryTerm";
import AiExplanationBlock from "./AiExplanationBlock";

function PlanCarousel({ children }) {
  const stripRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = stripRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, []);

  const scrollByPage = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 280) * direction;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className={`plan-carousel ${canPrev ? "has-prev" : ""} ${canNext ? "has-next" : ""}`}>
      <button
        type="button"
        className="plan-carousel-arrow is-left"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label="Anterior"
      >
        <i className="ti ti-chevron-left" aria-hidden="true" />
      </button>
      <div className="plan-carousel-strip" ref={stripRef}>
        {children}
      </div>
      <button
        type="button"
        className="plan-carousel-arrow is-right"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label="Siguiente"
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}

function hasObjectData(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function LinkedText({ text, onOpenArticle }) {
  return splitTextWithGlossaryTerms(text).map((part, i) =>
    typeof part === "string" ? (
      <React.Fragment key={i}>{part}</React.Fragment>
    ) : (
      <GlossaryTerm key={i} term={part.term} onOpenArticle={onOpenArticle} />
    )
  );
}

export default function Recommendations({ evaluation, onStartEvaluation, onNavigate, onRetryExplanation }) {
  const data = useMemo(() => buildRecommendations(evaluation), [evaluation]);
  const adjustment = useMemo(() => getClassificationAdjustment(data), [data]);
  const factors = useMemo(() => getUserResultFactors(data), [data]);

  const openInAcademy = () => onNavigate?.("academia");

  if (!data) {
    return (
      <section className="section-block recommendations-panel">
        <div className="section-heading">
          <span className="eyebrow">Recomendaciones inteligentes</span>
          <h1>Orientación personalizada</h1>
        </div>
        <div className="empty-state">
          <strong>Aún no tienes una preevaluación.</strong>
          <p>Realiza una preevaluación para generar recomendaciones personalizadas.</p>
          <button type="button" onClick={onStartEvaluation}>Ir a precalificación</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block recommendations-panel">
      <div className="page-head">
        <div>
          <span className="eyebrow">Recomendaciones inteligentes</span>
          <h1>Orientación personalizada</h1>
          <p>Resumen basado en tu última preevaluación, incluyendo compatibilidad, factores principales y recomendaciones generales.</p>
        </div>
      </div>

      <div className="recommendation-hero-row">
        <div className={`score-badge-wrap ${getScoreBadgeClass(data.classification)}`}>
          <span>Score financiero</span>
          <strong>{formatScore(data.score, "Sin score")}</strong>
          <small>Clasificación final: {data.classification || "Sin clasificación"}</small>
        </div>

        <div className="recommendation-hero-explanations">
          <div className="recommendation-summary">
            <p>{data.summary}</p>
            {adjustment ? (
              <div className="score-adjustment-note">
                <strong>{adjustment.message}</strong>
                {adjustment.detail ? <p>{adjustment.detail}</p> : null}
              </div>
            ) : null}
          </div>

          {data.user_explanation_deterministic ? (
            <section className="recommendation-ai">
              <strong><i className="ti ti-info-circle"></i> Explicación orientativa</strong>
              <p>{data.user_explanation_deterministic}</p>
            </section>
          ) : null}

          <section className="recommendation-ai">
            <strong><i className="ti ti-sparkles"></i> Explicación mejorada con IA</strong>
            <AiExplanationBlock
              text={evaluation?.result?.ai_explanation}
              renderText={(t) => (
                <p>
                  <LinkedText text={t} onOpenArticle={openInAcademy} />
                </p>
              )}
              onRetry={onRetryExplanation}
            />
          </section>
        </div>
      </div>

      {(factors.length || hasObjectData(data.project_fit)) && (
        <div className="recommendation-metrics-row">
          {factors.length ? (
            <section className="recommendation-metrics-card">
              <h2 className="recommendation-section-title"><i className="ti ti-chart-bar"></i> Factores determinantes</h2>
              <ul className="factor-list">
                {factors.map((factor, index) => (
                  <li className="factor-item" key={`${factor.title}-${index}`}>
                    <span className={`factor-dot ${Number(factor.score) >= 70 ? "ok" : Number(factor.score) >= 40 ? "warn" : "bad"}`} />
                    <div className="factor-info">
                      <span className="factor-name">{factor.title}</span>
                      {factor.description ? <span className="factor-desc">{factor.description}</span> : null}
                    </div>
                    {Number.isFinite(Number(factor.score)) && (
                      <span className="factor-score">{factor.score}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasObjectData(data.project_fit) ? (
            <section className="recommendation-metrics-card">
              <h2 className="recommendation-section-title"><i className="ti ti-home-heart"></i> Compatibilidad inmobiliaria</h2>
              <ul className="project-fit-list">
                <li className="project-fit-item">
                  <span className="project-fit-label">Estado</span>
                  <span className="project-fit-value">{data.project_fit.classification || data.project_fit.status || "Sin dato"}</span>
                </li>
                <li className="project-fit-item">
                  <span className="project-fit-label">Brecha de ingreso</span>
                  <span className="project-fit-value">{formatClp(data.project_fit.income_gap)}</span>
                </li>
                <li className="project-fit-item">
                  <span className="project-fit-label">Brecha de pie</span>
                  <span className="project-fit-value">{formatClp(data.project_fit.down_payment_gap)}</span>
                </li>
                <li className="project-fit-item">
                  <span className="project-fit-label">Compatible actualmente</span>
                  <span className="project-fit-value">{formatBooleanText(data.project_fit.compatible)}</span>
                </li>
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <div className="recommendation-grid">
        <section>
          <h2 className="recommendation-section-title"><i className="ti ti-lightbulb"></i> Recomendaciones personalizadas</h2>
          <ul>
            {data.recommendations.map((item) => (
              <li key={item.text}>
                <i className="ti ti-circle-check recommendation-icon"></i>
                <div>
                  {item.text}
                  {item.benefit && <p className="benefit"><b>Beneficio esperado: </b>{item.benefit}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="recommendation-section-title"><i className="ti ti-checkbox"></i> Acciones sugeridas</h2>
          <ul>
            {data.actions.map((item) => (
              <li key={item}><i className="ti ti-arrow-right recommendation-icon"></i><span className="action-text"><LinkedText text={item} onOpenArticle={openInAcademy} /></span></li>
            ))}
          </ul>
        </section>
      </div>

      {evaluation?.result?.improvement_plan?.length > 0 && (
        <div className="improvement-plan-section">
          <h2><i className="ti ti-road"></i> Plan de mejora estratégico</h2>
          <p>Priorizado por impacto según tu perfil actual.</p>
          <PlanCarousel>
            {evaluation.result.improvement_plan.map((item, idx) => {
              const impactLevel = item.impact_level || "";
              const impactClass = impactLevel === "Alto" ? "alto" : impactLevel === "Medio" ? "medio" : "bajo";
              return (
                <div className={`plan-card plan-card--${impactClass}`} key={idx}>
                  <div className="plan-card-header">
                    <strong>{item.category}</strong>
                    <span className={`impact-badge impact-badge--${impactClass}`}>
                      Impacto: {item.impact_level}
                    </span>
                  </div>
                  <p className="plan-card-desc">{item.description}</p>
                  {item.expected_benefit && (
                    <div className="plan-card-benefit">
                      <strong>Beneficio esperado:</strong> {item.expected_benefit}
                    </div>
                  )}
                </div>
              );
            })}
          </PlanCarousel>
        </div>
      )}

      {evaluation && <BankingChecklist evaluation={evaluation} onNavigate={onNavigate} />}

      <div className="recommendations-cta">
        <button className="primary-button" type="button" onClick={() => onNavigate?.("tracking")}>
          Ir al plan de mejora
        </button>
      </div>
    </section>
  );
}
