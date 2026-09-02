import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildRecommendations } from "../services/recommendationService";
import { displayItemBenefit, displayItemText } from "../utils/text";

import {
  formatBooleanText,
  formatClp,
  formatScore,
  getClassificationAdjustment,
  getScoreBadgeClass,
  getUserResultFactors,
} from "../utils/helpers";
import GlossaryTerm, { splitTextWithGlossaryTerms } from "./GlossaryTerm";
import { ACADEMY_BENEFIT_CAPSULES } from "../constants/academyContent";
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
          <span className="eyebrow">Resultados de tu evaluación</span>
          <h1>Resultados de tu precalificación</h1>
        </div>
        <div className="empty-state">
          <strong>Aún no tienes una precalificación.</strong>
          <p>Realiza una precalificación para generar recomendaciones personalizadas.</p>
          <button type="button" onClick={onStartEvaluation}>Ir a precalificación</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block recommendations-panel">
      <div className="page-head">
        <div>
          <span className="eyebrow">Resultados de tu evaluación</span>
          <h1>Orientación personalizada</h1>
          <p>Lee tu resultado, identifica los factores principales y define el siguiente paso con información referencial.</p>
        </div>
      </div>

      <div className="recommendation-hero-row">
        <section className="recommendation-score-ai-card">
          <div className={`score-badge-wrap score-visual-card ${getScoreBadgeClass(data.classification)}`} style={{ "--score-value": `${Math.max(0, Math.min(100, Number(data.score) || 0))}%` }}>
            <span>Score financiero</span>
            <strong>{formatScore(data.score, "Sin score")}</strong>
            <small>{data.classification || "Sin clasificación"}</small>
          </div>
          <div className="recommendation-score-ai-card__explanation">
            <strong><i className="ti ti-sparkles"></i> Explicación con IA</strong>
            <AiExplanationBlock text={evaluation?.result?.ai_explanation} renderText={(text) => <p><LinkedText text={text} onOpenArticle={openInAcademy} /></p>} onRetry={onRetryExplanation} />
          </div>
        </section>

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

          <div className="recommendation-summary-lists">
            <section>
              <h2 className="recommendation-section-title"><i className="ti ti-lightbulb"></i> Recomendaciones personalizadas</h2>
              <ul>{data.recommendations.map((item, index) => <li key={`${displayItemText(item)}-${index}`}><i className="ti ti-circle-check recommendation-icon"></i><div>{displayItemText(item)}{displayItemBenefit(item) ? <p className="benefit"><b>Beneficio esperado: </b>{displayItemBenefit(item)}</p> : null}</div></li>)}</ul>
            </section>
            <section>
              <h2 className="recommendation-section-title"><i className="ti ti-checkbox"></i> Acciones sugeridas</h2>
              <ul>{data.actions.map((item) => <li key={item}><i className="ti ti-arrow-right recommendation-icon"></i><span className="action-text"><LinkedText text={item} onOpenArticle={openInAcademy} /></span></li>)}</ul>
            </section>
          </div>

        </div>
      </div>

      {factors.length > 0 && (
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

        </div>
      )}

      {data.housing_benefits?.applicable_benefits?.some((b) => b.eligible) && (
        <div className="simulation-teaser">
          <strong>Subsidios habitacionales</strong>
          <p>
            Descubre qu&#233; beneficios como FOGAES, DS49, DS1 o Ley 21.748 podr&#237;an ser compatibles con tu perfil.
          </p>
          <div className="simulation-teaser-actions">
            <button type="button" className="secondary-button" onClick={() => onNavigate?.("subsidios")}>
              Ver subsidios en detalle
            </button>
            {data.housing_benefits.applicable_benefits
              .filter((b) => b.eligible)
              .slice(0, 1)
              .map((b) => {
                const capsuleId = ACADEMY_BENEFIT_CAPSULES[b.academy_module];
                return capsuleId ? (
                  <button
                    key={b.type}
                    type="button"
                    className="text-button"
                    onClick={() => onNavigate?.("academia", { articleId: capsuleId })}
                  >
                    Explorar c&#225;psula: {b.name}
                  </button>
                ) : null;
              })}
          </div>
        </div>
      )}

      <div className="warning-note">
        <i className="ti ti-alert-triangle"></i>
        Esta orientación no reemplaza una evaluación bancaria formal.
      </div>

      <div className="recommendations-cta">
        <button className="primary-button" type="button" onClick={() => onNavigate?.("tracking")}>
          Ir al plan de mejora
        </button>
      </div>
    </section>
  );
}
