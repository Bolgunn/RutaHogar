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
import { displayItemBenefit, displayItemText, normalizeDisplayList, normalizeDisplayText } from "../utils/text";

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

function ScoreDial({ score, max = 100 }) {
  const numericScore = Number(score);
  const safeScore = Number.isFinite(numericScore) ? Math.min(Math.max(numericScore, 0), max) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / max) * circumference;

  return (
    <div className="hero-dial">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="hero-dial__track" cx="60" cy="60" r={radius} />
        <circle
          className="hero-dial__value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="hero-dial__center">
        <strong>{formatScore(score, "—")}</strong>
        <span>/{max}</span>
      </div>
    </div>
  );
}

function factorDotClass(score) {
  if (!Number.isFinite(Number(score))) return "";
  const n = Number(score);
  if (n >= 70) return "ok";
  if (n >= 40) return "warn";
  return "bad";
}

function MetricItem({ label, value }) {
  return (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  );
}

export default function Result({ data, onNavigate, onRetryExplanation }) {
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
  const badgeClass = tone === "high" ? "alto" : tone === "medium" ? "medio" : tone === "low" ? "bajo" : "accent";
  const scoreValue = `${Math.max(0, Math.min(100, Number(score) || 0))}%`;

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
        <div className={`score-badge score-visual-card score-${badgeClass} ${tone}`} style={{ "--score-value": scoreValue }}>
          <span>Score financiero</span>
          <strong>{formatScore(score, "Sin dato")}</strong>
          <small>Clasificación final: {classification || "Sin clasificación"}</small>
        </div>
      </div>

      <div className="result-grid">
        <section className="result-section-card">
          <strong>Explicación</strong>
          <p>{deterministicExplanation || "No hay explicación disponible para este resultado."}</p>
        </section>

        <section className="result-section-card">
          <strong>Explicación mejorada con IA</strong>

          <AiExplanationBlock
            text={ai_explanation}
            onRetry={onRetryExplanation}
          />
        </section>

        {factors.length ? (
          <section className="result-section-card" style={{ gridColumn: "1 / -1" }}>
            <strong>Factores determinantes de tu resultado</strong>
            <ul className="factor-list">
              {factors.map((factor, index) => (
                <li className="factor-item" key={`${factor.title}-${index}`}>
                  <span className={`factor-dot ${factorDotClass(factor.score)}`} />
                  <div className="factor-info">
                    <span className="factor-name">{normalizeDisplayText(factor.title)}</span>
                    {factor.description ? <span className="factor-desc">{normalizeDisplayText(factor.description)}</span> : null}
                  </div>
                  {Number.isFinite(Number(factor.score)) && (
                    <span className="factor-score">{factor.score}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasProjectFit ? (
          <section className="result-section-card">
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
          <section className="result-section-card" style={{ gridColumn: "1 / -1" }}>
            <strong>Plan de mejora estructurado</strong>
            <div className="next-steps-grid">
              {structuredPlan.map((action, index) => {
                const impactLevel = action.impact_level || action.priority || "";
                const impactClass = impactLevel === "Alto" || impactLevel === "alto" ? "alto"
                  : impactLevel === "Medio" || impactLevel === "medio" ? "medio" : "bajo";
                return (
                  <div className={`plan-card plan-card--${impactClass}`} key={`${action.type || "action"}-${index}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 14, color: "var(--rh-text)" }}>
                        {normalizeDisplayText(action.title || "Acción recomendada")}
                      </strong>
                      {impactLevel && (
                        <span className={`impact-badge impact-badge--${impactClass}`}>
                          {impactLevel}
                        </span>
                      )}
                    </div>
                    {action.description ? (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--rh-text-secondary)", lineHeight: 1.5 }}>
                        {normalizeDisplayText(action.description)}
                      </p>
                    ) : null}
                    {formatPlanActionMeta(action).length ? (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--rh-text-muted)" }}>
                        {formatPlanActionMeta(action).map(normalizeDisplayText).join(" · ")}
                      </p>
                    ) : action.estimated_months ? (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--rh-text-muted)" }}>
                        Tiempo sugerido: {formatMonths(action.estimated_months)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="result-section-card">
          <strong>Puntos a revisar</strong>
          <ul>
            {visibleRisks.length ? visibleRisks.map((risk, i) => <li key={i}>{risk}</li>) : <li>No se detectan riesgos principales declarados.</li>}
          </ul>
        </section>

        <section className="result-section-card">
          <strong>Recomendaciones breves</strong>
          <ul>
            {briefRecommendations.length ? (
              briefRecommendations.map((step, i) => (
                <li key={i}>
                  {displayItemText(step)}
                  {displayItemBenefit(step) ? (
                    <p className="benefit">Beneficio esperado: {displayItemBenefit(step)}</p>
                  ) : null}
                </li>
              ))
            ) : (
              <li>Revisa tu situación con antecedentes formales antes de tomar una decisión.</li>
            )}
          </ul>
        </section>
      </div>

      <BankingChecklist result={data} onNavigate={onNavigate} />
    </div>
  );
}
