import React from "react";
import BankingChecklist from "./BankingChecklist";
import AiExplanationBlock from "./AiExplanationBlock";
import {

  formatBooleanText,
  formatClp,
  formatPlanActionMeta,
  formatScore,
  getClassificationAdjustment,
  getClassificationTone,
  getUserResultFactors,
} from "../utils/helpers";
import { normalizeDisplayList, normalizeDisplayText } from "../utils/text";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatMonths(value) {
  if (!Number.isFinite(Number(value))) return "Sin plazo estimado";
  const months = Math.max(0, Math.round(Number(value)));
  return months === 1 ? "1 mes" : `${months} meses`;
}

function MetricItem({ label, value }) {
  return (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  );
}

export default function Result({ data, onRetryExplanation }) {
  const {
    score,
    classification,
    original_classification,
    risks = [],
    recommendations = [],
    ai_explanation,
    project_fit,
    structured_improvement_plan,
    user_explanation_deterministic,
  } = data || {};

  const tone = getClassificationTone(classification);
  const visibleRisks = normalizeDisplayList(risks);
  const briefRecommendations = normalizeDisplayList(recommendations).slice(0, 3);
  const deterministicExplanation = normalizeDisplayText(user_explanation_deterministic);
  const hasAdjustedClassification = hasValue(original_classification) && original_classification !== classification;
  const adjustment = getClassificationAdjustment(data);
  const factors = getUserResultFactors(data);
  const hasProjectFit = isPlainObject(project_fit) && Object.keys(project_fit).length > 0;
  const structuredPlan = Array.isArray(structured_improvement_plan) ? structured_improvement_plan : [];

  return (
    <div className="result-panel">
      <div className="result-header">
        <div>
          <span className="eyebrow">Resultado</span>
          <h2>Score financiero preliminar</h2>
          <p>Resultado orientativo. No corresponde a una aprobación bancaria ni reemplaza una evaluación formal.</p>
          {hasAdjustedClassification && adjustment ? (
            <div className="score-adjustment-note">
              <strong>{adjustment.message}</strong>
              {adjustment.detail ? <p>{normalizeDisplayText(adjustment.detail)}</p> : null}
            </div>
          ) : null}
        </div>
        <div className={`score-badge ${tone}`}>
          <span>Score financiero</span>
          <strong>{formatScore(score, "Sin dato")}</strong>
          <small>Clasificación final: {classification || "Sin clasificación"}</small>
        </div>
      </div>

      <div className="result-grid">
        <section>
          <strong>Explicación</strong>
          <p>{deterministicExplanation || "No hay explicación disponible para este resultado."}</p>
        </section>

        <section>
          <strong>Explicación mejorada con IA</strong>

          <AiExplanationBlock
            text={ai_explanation}
            onRetry={onRetryExplanation}
          />
        </section>

        {factors.length ? (
          <section>
            <strong>Factores determinantes de tu resultado</strong>
            <ul>
              {factors.map((factor, index) => (
                <li key={`${factor.title}-${index}`}>
                  <strong>{normalizeDisplayText(factor.title)}</strong>
                  {factor.description ? <p>{normalizeDisplayText(factor.description)}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasProjectFit ? (
          <section>
            <strong>Compatibilidad con tu objetivo inmobiliario</strong>
            <ul>
              <MetricItem label="Estado" value={normalizeDisplayText(project_fit.classification || project_fit.status || "Sin dato")} />
              <MetricItem label="Brecha de ingreso" value={formatClp(project_fit.income_gap)} />
              <MetricItem label="Brecha de pie" value={formatClp(project_fit.down_payment_gap)} />
              <MetricItem label="Compatible actualmente" value={formatBooleanText(project_fit.compatible)} />
            </ul>
          </section>
        ) : null}

        {structuredPlan.length ? (
          <section className="recommendation-section">
            <strong>Plan de mejora estructurado</strong>
            <ul>
              {structuredPlan.map((action, index) => (
                <li key={`${action.type || "action"}-${index}`}>
                  <strong>{normalizeDisplayText(action.title || "Acción recomendada")}</strong>
                  {action.description ? <p>{normalizeDisplayText(action.description)}</p> : null}
                  {formatPlanActionMeta(action).length ? (
                    <p>{formatPlanActionMeta(action).map(normalizeDisplayText).join(" · ")}</p>
                  ) : action.estimated_months ? (
                    <p>Tiempo sugerido: {formatMonths(action.estimated_months)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <strong>Puntos a revisar</strong>
          <ul>
            {visibleRisks.length ? visibleRisks.map((risk, i) => <li key={i}>{risk}</li>) : <li>No se detectan riesgos principales declarados.</li>}
          </ul>
        </section>

        <section className="recommendation-section">
          <strong>Recomendaciones breves</strong>
          <ul>
            {briefRecommendations.length ? (
              briefRecommendations.map((step, i) => (
                <li key={i}>
                  {typeof step === "string" ? step : step.text}
                  {typeof step !== "string" && step.benefit && <p className="benefit">Beneficio esperado: {step.benefit}</p>}
                </li>
              ))
            ) : (
              <li>Revisa tu situación con antecedentes formales antes de tomar una decisión.</li>
            )}
          </ul>
        </section>
      </div>

      <BankingChecklist result={data} />
    </div>
  );
}

