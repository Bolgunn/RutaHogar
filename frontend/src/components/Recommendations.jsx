import React, { useMemo, useState } from "react";
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

export default function Recommendations({ evaluation, onStartEvaluation, onNavigate }) {
  const data = useMemo(() => buildRecommendations(evaluation), [evaluation]);
  const adjustment = useMemo(() => getClassificationAdjustment(data), [data]);
  const factors = useMemo(() => getUserResultFactors(data), [data]);

  // HU12 - E3: los términos financieros detectados en el texto abren la Academia.
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
      <div className="section-heading">
        <span className="eyebrow">Recomendaciones inteligentes</span>
        <h1>Orientación personalizada</h1>
        <p>Resumen basado en tu última preevaluación, incluyendo compatibilidad, factores principales y recomendaciones generales.</p>
      </div>

      <div className="recommendation-summary">
        <div className={`score-badge-wrap ${getScoreBadgeClass(data.classification)}`}>
          <span>Score financiero</span>
          <strong>{formatScore(data.score, "Sin score")}</strong>
          <small>Clasificación final: {data.classification || "Sin clasificación"}</small>
        </div>
        <div>
          <p>{data.summary}</p>
          {adjustment ? (
            <div className="score-adjustment-note">
              <strong>{adjustment.message}</strong>
              {adjustment.detail ? <p>{adjustment.detail}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      {data.user_explanation_deterministic ? (
        <section className="recommendation-ai" style={{ marginBottom: "1.5rem" }}>
          <strong>Explicación orientativa</strong>
          <p>{data.user_explanation_deterministic}</p>
        </section>
      ) : null}

      {evaluation?.result?.ai_explanation ? (
        <section className="recommendation-ai" style={{ marginBottom: "1.5rem" }}>
          <strong>Explicación mejorada con IA</strong>
          <p>{evaluation.result.ai_explanation}</p>
        </section>
      ) : null}

      {(factors.length || hasObjectData(data.project_fit)) && (
        <div className="recommendation-grid">
          {factors.length ? (
            <section>
              <strong>Factores determinantes de tu resultado</strong>
              <ul>
                {factors.map((factor, index) => (
                  <li key={`${factor.title}-${index}`}>
                    <strong>{factor.title}</strong>
                    {factor.description ? <p>{factor.description}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasObjectData(data.project_fit) ? (
            <section>
              <strong>Compatibilidad con tu objetivo inmobiliario</strong>
              <ul>
                <li>Estado: {data.project_fit.classification || data.project_fit.status || "Sin dato"}</li>
                <li>Brecha de ingreso: {formatClp(data.project_fit.income_gap)}</li>
                <li>Brecha de pie: {formatClp(data.project_fit.down_payment_gap)}</li>
                <li>Compatible actualmente: {formatBooleanText(data.project_fit.compatible)}</li>
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <div className="recommendation-grid">
        <section>
          <strong>Recomendaciones personalizadas</strong>
          <ul>
            {data.recommendations.map((item) => (
              <li key={item}><LinkedText text={item} onOpenArticle={openInAcademy} /></li>
            ))}
          </ul>
        </section>

        <section>
          <strong>Acciones sugeridas</strong>
          <ul>
            {data.actions.map((item) => (
              <li key={item}><LinkedText text={item} onOpenArticle={openInAcademy} /></li>
            ))}
          </ul>
        </section>
      </div>


      <div className="warning-note">
        Esta orientación no reemplaza una evaluación bancaria formal.
      </div>

      <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <button className="primary-button" type="button" onClick={() => onNavigate?.("tracking")}>
          Ir al plan de mejora
        </button>
      </div>
    </section>
  );
}
