import React, { useCallback, useEffect, useState } from "react";
import {
  appendTrackingEvent, confirmTrackingGoal, correctTrackingEvent, getProjection, getTracking,
} from "../../services/trackingService";
import {
  belongsToSlot, displayValue, filterSeriesByPeriod,
  projectName, projectionExplanation, trackingProjectContext,
} from "../../lib/tracking/display";
import {
  evolutionSeries, expectedProgressLine, sourceForChartField,
} from "../../lib/tracking/evolution";
import { formatGoalValue, goalPresentation } from "../../lib/tracking/goalPresentation";
import { formatFormValue } from "../../constants";
import UpdateFinancialDataForm from "./UpdateFinancialDataForm";
import "./tracking.css";

const TRACKING_TIME_ZONE = "America/Santiago";
const FINANCIAL_HISTORY_PREVIEW_LIMIT = 10;

export const dateTime = (value) => value
  ? new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: TRACKING_TIME_ZONE })
  : "Sin fecha";
export const dateOnly = (value) => value
  ? new Date(value).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  : "Sin fecha";

export function financialHistoryRows(rows, expanded = false) {
  const history = Array.isArray(rows) ? rows : [];
  return expanded ? history : history.slice(-FINANCIAL_HISTORY_PREVIEW_LIMIT);
}

const statusLabels = {
  cumplida: "Cumplida", en_progreso: "En progreso", en_curso: "En curso", pendiente: "Pendiente", vencida: "Fuera de plazo",
  dentro_de_lo_esperado: "Dentro de lo esperado", adelantado: "Adelantado", atrasado: "Atrasado",
  al_dia: "Al día", adelantada: "Adelantada", atrasada: "Atrasada",
  compatible: "Compatible", cercano: "Cercano", no_compatible: "Aún no compatible",
};
const statusLabel = (value) => statusLabels[value] || value?.replaceAll("_", " ") || "Sin datos suficientes";
const evolutionPeriods = [
  ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"], ["all", "Todo"],
];

function Trend({ series, field, label }) {
  const points = series.filter((row) => Number.isFinite(row[field]));
  if (!points.length) return <figure className="progress-trend progress-trend--empty">
    <figcaption>{label}</figcaption><p>Sin datos en este período.</p>
  </figure>;
  if (points.length === 1) return <figure className="progress-trend progress-trend--empty">
    <figcaption><span>{label}</span><strong>{displayValue(points[0][field])}</strong></figcaption>
    <p>1 dato disponible en este período.</p>
  </figure>;
  const values = points.map((row) => row[field]);
  const dates = points.map((row) => new Date(row.at).getTime());
  const low = Math.min(...values), high = Math.max(...values);
  const start = Math.min(...dates), end = Math.max(...dates);
  const path = points.map((row, index) =>
    `${10 + 280 * (dates[index] - start) / (end - start || 1)},${90 - 80 * (row[field] - low) / (high - low || 1)}`).join(" ");
  return <figure className="progress-trend">
    <figcaption><span>{label}</span><strong>{displayValue(values[0])} → {displayValue(values.at(-1))}</strong></figcaption>
    <svg viewBox="0 0 300 100" role="img" aria-label={`Evolución de ${label}`}>
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  </figure>;
}

function chartValue(value, field) {
  if (value == null) return "Sin datos";
  if (field === "score" || field === "capacity") return displayValue(value);
  return `$${displayValue(value)}`;
}

function signedDelta(value, field) {
  if (value == null) return null;
  return `${value > 0 ? "+" : ""}${chartValue(value, field)}`;
}

export function tooltipPlacement({ x, y }) {
  const horizontal = x < 72 ? "start" : x > 228 ? "end" : "center";
  const vertical = y < 38 ? "below" : "above";
  return {
    horizontal,
    vertical,
    style: {
      top: `${y}%`,
      ...(horizontal === "start" ? { left: "6px" }
        : horizontal === "end" ? { right: "6px" }
          : { left: `${x / 3}%` }),
    },
  };
}

export function PointTooltip({ point, field, label, placement, tooltipId }) {
  const valueDelta = point.deltas?.[field];
  return <div className={`progress-trend-tooltip progress-trend-tooltip--${placement.horizontal} progress-trend-tooltip--${placement.vertical}`}
    id={tooltipId} style={placement.style} role="tooltip">
    <strong>{dateOnly(point.at)}</strong>
    <span><b>{label}:</b> {chartValue(point[field], field)}
      {valueDelta != null && <> <em>({signedDelta(valueDelta, field)})</em></>}
    </span>
    {field !== "score" && point.score != null && <span><b>Score:</b> {displayValue(point.score)}
      {point.deltas?.score != null && <> <em>({signedDelta(point.deltas.score, "score")})</em></>}
    </span>}
    {point.classificationChange && <span><b>Clasificación:</b> {point.classificationChange.from} → {point.classificationChange.to}</span>}
    {point.capacity != null && point.deltas?.capacity != null && <span><b>Capacidad de compra:</b> {displayValue(point.capacity)} UF
      <em> ({signedDelta(point.deltas.capacity, "capacity")} UF)</em>
    </span>}
    {point.compatibilityChange && <span><b>Compatibilidad:</b> {point.compatibilityChange.from} → {point.compatibilityChange.to}</span>}
  </div>;
}

function EvolutionTrend({ series, field, label, expected = [] }) {
  const [activePoint, setActivePoint] = useState(null);
  const points = series.filter((row) => Number.isFinite(row[field]) && Number.isFinite(new Date(row.at).getTime()));
  if (!points.length) return <figure className="progress-trend progress-trend--empty">
    <figcaption>{label}</figcaption><p>Sin datos en este período.</p>
  </figure>;
  const expectedPoints = expected.filter((point) => Number.isFinite(point?.value) && Number.isFinite(new Date(point.at).getTime()));
  const values = [...points.map((row) => row[field]), ...expectedPoints.map((point) => point.value)];
  const dates = [...points.map((row) => new Date(row.at).getTime()), ...expectedPoints.map((point) => new Date(point.at).getTime())];
  const low = Math.min(...values), high = Math.max(...values);
  const start = Math.min(...dates), end = Math.max(...dates);
  const position = (at, value) => ({
    x: end === start ? 150 : 10 + 280 * (new Date(at).getTime() - start) / (end - start),
    y: high === low ? 50 : 90 - 80 * (value - low) / (high - low),
  });
  const path = points.map((row) => {
    const { x, y } = position(row.at, row[field]);
    return `${x},${y}`;
  }).join(" ");
  const expectedPath = expectedPoints.map((point) => {
    const { x, y } = position(point.at, point.value);
    return `${x},${y}`;
  }).join(" ");
  const focused = activePoint && points.find((point) => point.id === activePoint.id);
  const focusedPosition = focused ? position(focused.at, focused[field]) : null;

  return <figure className="progress-trend">
    <figcaption><span>{label}</span><strong>{chartValue(points[0][field], field)} → {chartValue(points.at(-1)[field], field)}</strong></figcaption>
    <div className="progress-trend__chart">
      <svg viewBox="0 0 300 100" role="group" aria-label={`Evolución de ${label}`}>
        {expectedPath && <polyline className="progress-trend__expected" points={expectedPath} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke">
          <title>Progreso esperado</title>
        </polyline>}
        {points.length > 1 && <polyline points={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
        {points.map((point) => {
          const { x, y } = position(point.at, point[field]);
          const isActive = focused?.id === point.id;
          return <circle key={point.id} className="progress-trend__point" cx={x} cy={y} r="4.5" tabIndex="0"
            role="img" aria-label={`${dateOnly(point.at)}. ${label}: ${chartValue(point[field], field)}.`}
            aria-describedby={isActive ? `trend-tooltip-${field}` : undefined}
            onMouseEnter={() => setActivePoint({ id: point.id, mode: "pointer" })}
            onMouseLeave={() => setActivePoint((active) => active?.mode === "pointer" ? null : active)}
            onFocus={() => setActivePoint({ id: point.id, mode: "focus" })}
            onBlur={() => setActivePoint((active) => active?.mode === "focus" ? null : active)}
            onKeyDown={(event) => { if (event.key === "Escape") { setActivePoint(null); event.currentTarget.blur(); } }} />;
        })}
      </svg>
      {focused && <PointTooltip point={focused} field={field} label={label} placement={tooltipPlacement(focusedPosition)}
        tooltipId={`trend-tooltip-${field}`} />}
    </div>
    {expectedPath && <span className="progress-trend__legend"><i aria-hidden="true" /> Progreso esperado</span>}
  </figure>;
}

const historyFieldDefinitions = Object.freeze([
  { field: "ingreso_mensual", label: "Ingreso mensual", format: "clp" },
  { field: "deuda_mensual", label: "Deuda mensual", format: "clp" },
  { field: "ahorro_disponible", label: "Ahorro disponible", format: "clp" },
  { field: "morosidad_actual", label: "Morosidad actual" },
  { field: "tipo_contrato", label: "Tipo de contrato" },
  { field: "continuidad_laboral", label: "Continuidad laboral" },
  { field: "project_goal", label: "Proyecto objetivo", format: "project" },
  { field: "plazo_compra", label: "Plazo de compra" },
]);

const hasHistoricalValue = (value) => value !== undefined && value !== null && value !== "";

export function formatHistoricalProjectGoal(projectGoal) {
  if (!projectGoal || typeof projectGoal !== "object" || Array.isArray(projectGoal)) return null;
  const name = typeof projectGoal.nombre === "string" ? projectGoal.nombre.trim() : "";
  const price = [projectGoal.precio_min_uf, projectGoal.precio_max_uf]
    .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  const priceText = price == null ? "" : `${displayValue(price)} UF`;
  return [name, priceText].filter(Boolean).join(" · ") || null;
}

export function formatTrackingSnapshotValue(field, value, format) {
  if (format === "project") return formatHistoricalProjectGoal(value);
  if (format === "clp") return `$${displayValue(value)}`;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return formatFormValue(value, "Sin datos");
}

export function historySnapshotFields(snapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return historyFieldDefinitions.map((definition) => {
    const value = source[definition.field];
    if (!hasHistoricalValue(value)) return null;
    const formattedValue = formatTrackingSnapshotValue(definition.field, value, definition.format);
    return formattedValue ? { ...definition, value: formattedValue } : null;
  }).filter(Boolean);
}

export function isUpdatedField(row, field) {
  return row?.event_kind !== "baseline"
    && Object.prototype.hasOwnProperty.call(row?.patch || {}, field);
}

export function historicalEvaluationSummary(row) {
  const evaluation = row?.evaluation;
  if (!evaluation || typeof evaluation !== "object") return [];
  const summary = [];
  if (hasHistoricalValue(evaluation.score)) summary.push({ label: "Score", value: displayValue(evaluation.score) });
  if (hasHistoricalValue(evaluation.classification)) summary.push({ label: "Clasificación", value: evaluation.classification });
  const capacity = evaluation.financial_indicators?.capacidad_compra_estimada_uf;
  if (typeof capacity === "number" && Number.isFinite(capacity)) {
    summary.push({ label: "Capacidad", value: `${displayValue(capacity)} UF` });
  }
  return summary;
}

export function correctionTargetForClick(currentTarget, row) {
  return currentTarget?.event_id === row.event_id ? null : row;
}

export function canBulkAnnul(row, baselineEventId, auditLine) {
  return !belongsToSlot(row, baselineEventId, auditLine);
}

export function bulkAnnulSuccessMessage(count) {
  return `${count} registro${count === 1 ? " fue eliminado" : "s fueron eliminados"} de tu historial visible y evolución.`;
}

export function goalsStatusMessage(goals) {
  const count = Array.isArray(goals) ? goals.length : 0;
  if (!count) return "No hay metas pendientes: la evaluación inicial no detectó bloqueadores que requieran un plan de mejora.";
  return `${count} ${count === 1 ? "meta fue generada" : "metas fueron generadas"} desde los bloqueadores de la evaluación inicial. Mostramos todas las metas de tu plan.`;
}

function HistoricalRecordDetails({ row }) {
  const fields = historySnapshotFields(row.recorded_complete_snapshot || row.snapshot);
  const summary = historicalEvaluationSummary(row);
  return <>
    {fields.length > 0 && <dl className="progress-data-list">{fields.map(({ field, label, value }) => <div key={field}>
      <dt>{label}</dt><dd>{value}</dd>
      {isUpdatedField(row, field) && <small>Actualizado</small>}
    </div>)}</dl>}
    {summary.length > 0 && <p className="progress-recorded-result"><strong>Resultado de esta evaluación</strong>
      <span>{summary.map((item, index) => <React.Fragment key={item.label}>
        {index > 0 && " · "}<b>{item.label}</b> {item.value}
      </React.Fragment>)}</span>
    </p>}
  </>;
}

function SectionHeading({ id, eyebrow, title, description }) {
  return <div className="progress-section-heading">
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2 id={id}>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}

export function activeBaselineForComparison(data) {
  const baseline = (data.active_line || []).find(
    (row) => (row.root_event_id ?? row.event_id) === data.baseline.root_event_id,
  );
  if (!baseline || baseline.evaluation) return baseline;
  // A correction records its recalculation as the separately identified
  // evaluation immediately following that active correction. Keep the logical
  // baseline slot, but use that recalculation instead of falling back to the
  // superseded source baseline.
  const recalculation = (data.audit_line || []).find(
    (row) => row.event_kind === "evaluation" && row.previous === baseline.event_id && row.evaluation,
  );
  return recalculation ? { ...baseline, evaluation: recalculation.evaluation } : baseline;
}

export function ProgressView({ data, projection, projectionError = "", onRetryProjection, onConfirm, onUpdate, onOpenHistory, onOpenProject, busy = false }) {
  const series = evolutionSeries(data.active_line, data.baseline.target_project_snapshot);
  // The initial slot can have a replacement correction. Its active version,
  // not the immutable source event, is the baseline for score comparison.
  const baseline = activeBaselineForComparison(data);
  const initialScore = baseline?.evaluation?.score;
  const current = data.current_evaluation;
  const projectContext = trackingProjectContext(data);
  const scoreChange = initialScore != null && current ? current.score - initialScore : null;
  const [actionError, setActionError] = useState("");
  const [evolutionPeriod, setEvolutionPeriod] = useState("all");
  const [financialHistoryExpanded, setFinancialHistoryExpanded] = useState(false);
  const visibleSeries = filterSeriesByPeriod(series, evolutionPeriod, data.cutoff_at);
  const shownFinancialHistory = financialHistoryRows(visibleSeries, financialHistoryExpanded);
  const hasMoreFinancialHistory = visibleSeries.length > FINANCIAL_HISTORY_PREVIEW_LIMIT;
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const perform = async (operation) => {
    setActionError("");
    try { await operation(); } catch (failure) { setActionError(failure.message); }
  };

  return <div className="progress-content">
    <section className="progress-summary" aria-labelledby="tracking-summary">
      <div className="progress-summary__copy">
        <span className="eyebrow">Estado actual</span>
        <h2 id="tracking-summary">Tu avance financiero</h2>
        <p>Comparamos tus datos actuales con el plan creado el {dateOnly(data.baseline.baseline_at)}.</p>
        {data.update_due && <div role="status" className="tracking-notice">
          <i className="ti ti-clock-exclamation" aria-hidden="true" />
          <span><strong>Es momento de actualizar.</strong> Han pasado 30 días desde tus últimos datos.</span>
        </div>}
      </div>
      <div className="progress-score-card">
        <span>Score actual</span><strong>{displayValue(current?.score)}</strong>
        <small>{current?.classification || "Sin evaluación activa"}</small>
        {scoreChange != null && <em className={scoreChange >= 0 ? "is-positive" : "is-negative"}>
          {scoreChange >= 0 ? "+" : ""}{displayValue(scoreChange)} puntos desde el inicio
        </em>}
      </div>
      <dl className="progress-metrics">
        {[["ingreso_mensual", "Ingreso mensual", "ti-wallet"], ["deuda_mensual", "Deuda mensual", "ti-credit-card"],
          ["ahorro_disponible", "Ahorro disponible", "ti-pig-money"]].map(([field, label, icon]) => <div key={field}>
          <i className={`ti ${icon}`} aria-hidden="true" /><dt>{label}</dt>
          <dd>{displayValue(data.latest_effective_snapshot?.[field])}</dd>
        </div>)}
      </dl>
      <div className="progress-summary__projection" role="status">
        <i className="ti ti-calendar-stats" aria-hidden="true" />
        <div className="progress-summary__projection-copy">
          <span>Proyección del objetivo</span>
          {!projection ? <>{projectionError ? <>
            <strong>La proyección no está disponible por ahora</strong><p>{projectionError}</p>
            {onRetryProjection && <button type="button" className="text-button" onClick={onRetryProjection}>Reintentar proyección</button>}
          </> : <><strong>Calculando proyección…</strong><p>Aún no está lista porque estamos revisando tus observaciones y el objetivo del plan.</p></>}</> : <>
            <strong>{projection.target_compatible_at
              ? projection.status === "already_compatible"
                ? `Objetivo compatible al ${dateOnly(projection.target_compatible_at)}`
                : `Fecha compatible estimada: ${dateOnly(projection.target_compatible_at)}`
              : "Aún no podemos estimar una fecha"}</strong>
            {!projection.target_compatible_at && <p>
              {projectionExplanation(projection)}
            </p>}
          </>}
        </div>
        <dl>
          <div><dt>Capacidad estimada</dt><dd>{displayValue(current?.financial_indicators?.capacidad_compra_estimada_uf)} UF</dd></div>
          <div><dt>Compatibilidad actual</dt><dd>{statusLabel(current?.project_fit?.classification)}</dd></div>
        </dl>
      </div>
      <div className="progress-summary__foot">
        <p><strong>Proyecto objetivo:</strong> {projectContext.frozenTarget?.id && onOpenProject
          ? <button type="button" className="text-button progress-summary__project-link"
              onClick={() => onOpenProject(projectContext.frozenTarget.id)}>{projectName(projectContext.frozenTarget)}</button>
          : projectName(projectContext.frozenTarget)}</p>
        {projectContext.hasDifferentLatestPreference && <p><strong>Última preferencia evaluada:</strong> {projectName(projectContext.latestPreference)}</p>}
      </div>
    </section>

    <section className="progress-section" aria-labelledby="progress-goals">
      <SectionHeading id="progress-goals" eyebrow="Plan original" title="Mis metas"
        description="Las metas fijadas al iniciar el plan se conservan para que puedas medir avances comparables." />
      <p className="progress-goals__summary" role="status">{goalsStatusMessage(goals)}</p>
      {!goals.length && <div className="empty-state"><strong>Este plan no contiene metas pendientes.</strong></div>}
      <div className="progress-goals">{goals.map((goal) => {
        const presentation = goalPresentation(goal.definition);
        return <article className="progress-goal-card" key={goal.goal_id}>
        <div className="progress-goal-card__head"><div>
          <h3>{presentation.title}</h3>
          <div className="progress-goal-card__statuses">
            <span className={`progress-status progress-status--${goal.action_status}`}>{statusLabel(goal.action_status)}</span>
            {goal.temporal_status && <span className="progress-temporal-status">
              <i className="ti ti-clock" aria-hidden="true" /> {statusLabel(goal.temporal_status)}
            </span>}
          </div>
        </div>
          {goal.progress.percentage != null && <div className="progress-goal-card__percentage">
            <strong>{displayValue(goal.progress.percentage)}%</strong><span>completado</span>
          </div>}
        </div>
        <p className="progress-goal-card__description">{presentation.description}</p>
        {goal.progress.percentage != null && <progress max="100" value={goal.progress.percentage} aria-label={presentation.title} />}
        <dl className="progress-goal-values">
          <div><dt>Actual</dt><dd>{formatGoalValue(goal.progress.current_value, goal.definition.unit)}</dd></div>
          <div><dt>Objetivo</dt><dd>{formatGoalValue(goal.progress.target_value, goal.definition.unit)}</dd></div>
          <div><dt>Restante</dt><dd>{formatGoalValue(goal.progress.remaining_value, goal.definition.unit)}</dd></div>
        </dl>
        {(goal.schedule.expected_percentage != null || goal.definition.target_at) && <p className="progress-goal-card__schedule">
          {goal.schedule.expected_percentage != null && `Esperado hoy: ${displayValue(goal.schedule.expected_percentage)}%`}
          {goal.schedule.expected_percentage != null && goal.definition.target_at && " · "}
          {goal.definition.target_at && `Meta al ${dateOnly(goal.definition.target_at)}`}
        </p>}
        {goal.evidence.ever_completed && <p className="progress-inline-note">Cumplimiento registrado previamente.
          {goal.evidence.currently_regressed && " Esta meta volvió a quedar pendiente."}</p>}
        {!goal.verification.verifiable && <button className="secondary-button" disabled={busy}
          onClick={() => perform(() => onConfirm(goal))}>
          {goal.action_status === "cumplida" ? "Revocar confirmación" : "Confirmar cumplimiento"}
        </button>}
      </article>;
      })}</div>
      {actionError && <p role="alert" className="warning-note">{actionError}</p>}
    </section>

    <UpdateFinancialDataForm snapshot={data.latest_effective_snapshot} previous={data.latest_event_id} onSubmit={onUpdate} />

    <section className="progress-section" aria-labelledby="progress-timeline">
      <div className="progress-evolution__head">
        <SectionHeading id="progress-timeline" eyebrow="Evolución" title="Mi evolución" />
        <fieldset className="progress-period-filter">
          <legend>Período</legend>
          {evolutionPeriods.map(([value, label]) => <label key={value}>
            <input type="radio" name="evolution-period" value={value} checked={evolutionPeriod === value}
              onChange={() => setEvolutionPeriod(value)} />
            <span>{label}</span>
          </label>)}
        </fieldset>
      </div>
      <div className="progress-trends">{[["score", "Score"], ["income", "Ingreso"], ["debt", "Deuda"], ["savings", "Ahorro"]]
        .map(([field, label]) => <EvolutionTrend key={field} series={visibleSeries} field={field} label={label}
          expected={expectedProgressLine(goals, sourceForChartField(field), data.baseline.baseline_at)} />)}</div>
      <details className="progress-history"><summary>Ver historial financiero</summary>
        <div className="tracking-table"><table><caption>Datos del período seleccionado</caption>
          <thead><tr><th>Fecha</th><th>Score</th><th>Clasificación</th><th>Ingreso</th><th>Deuda</th><th>Ahorro</th></tr></thead>
          <tbody>{shownFinancialHistory.map((row) => <tr key={row.id}><td>{dateTime(row.at)}</td>
            {[row.score, row.classification, row.income, row.debt, row.savings].map((value, index) =>
              <td key={index}>{displayValue(value)}</td>)}</tr>)}</tbody>
        </table></div>
        {hasMoreFinancialHistory && <button type="button" className="text-button progress-history__more"
          aria-expanded={financialHistoryExpanded} onClick={() => setFinancialHistoryExpanded((expanded) => !expanded)}>
          {financialHistoryExpanded ? "Mostrar solo los últimos 10" : `Ver todo el historial (${visibleSeries.length})`}
        </button>}
        <div className="progress-history__actions">
          <button type="button" className="secondary-button" onClick={onOpenHistory}>
            <i className="ti ti-history" aria-hidden="true" /> Ver y corregir historial
          </button>
        </div>
      </details>
    </section>
  </div>;
}

export function TrackingHistoryView({ data, onCorrect, busy = false, initialTarget = null }) {
  const [target, setTarget] = useState(initialTarget);
  const [annulReason, setAnnulReason] = useState("");
  const [annulCommand, setAnnulCommand] = useState(null);
  const [bulkAnnulMode, setBulkAnnulMode] = useState(false);
  const [selectedForAnnul, setSelectedForAnnul] = useState([]);
  const [bulkAnnulReason, setBulkAnnulReason] = useState("");
  const [bulkAnnulCommands, setBulkAnnulCommands] = useState({});
  const [bulkAnnulSubmitting, setBulkAnnulSubmitting] = useState(false);
  const [bulkAnnulSuccess, setBulkAnnulSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const perform = async (operation) => {
    setActionError("");
    try { await operation(); } catch (failure) { setActionError(failure.message); }
  };

  const correctionEditor = (selectedTarget) => {
    const targetIsBaseline = belongsToSlot(selectedTarget, data.baseline.root_event_id, data.audit_line);
    return <div className="progress-correction" id={`progress-correction-${selectedTarget.event_id}`}>
      <h3>Corregir registro del {dateOnly(selectedTarget.effective_at)}</h3>
      <p>El registro original se conservará en el historial de cambios.</p>
      <UpdateFinancialDataForm key={selectedTarget.event_id} correction snapshot={selectedTarget.recorded_complete_snapshot}
        onSubmit={async (command) => {
          await onCorrect(selectedTarget, { event_id: command.event_id, effective_at: command.effective_at,
            reason: command.reason, correction_effect: "replace", patch: { ...selectedTarget.patch, ...command.patch } });
          setTarget(null);
        }} />
      {targetIsBaseline ? <p className="progress-inline-note">La evaluación inicial no se puede anular. Puedes corregir sus datos registrados.</p> : <div className="progress-annul">
        <label>Motivo de anulación<textarea rows="4" maxLength="500" value={annulReason}
          onChange={(event) => { setAnnulReason(event.target.value); setAnnulCommand(null); }} /></label>
        <button type="button" className="secondary-button" disabled={busy || !annulReason.trim()}
          onClick={() => perform(async () => {
            const command = annulCommand || { event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
              reason: annulReason, correction_effect: "annul", patch: {} };
            setAnnulCommand(command);
            await onCorrect(selectedTarget, command);
            setTarget(null);
          })}>Anular lógicamente</button>
      </div>}
    </div>;
  };

  // Every non-baseline source can be logically annulled, including a prior
  // version. It remains in audit_line, while lineage excludes its slot from
  // the evolution series and metrics. Baseline corrections remain protected:
  // annulling that root would leave the tracking plan without its required
  // initial state.
  const canAnnulRow = (row) => canBulkAnnul(row, data.baseline.root_event_id, data.audit_line);
  const annullableRows = data.audit_line.filter(canAnnulRow);
  const selectedRows = data.audit_line.filter((row) => selectedForAnnul.includes(row.event_id) && canAnnulRow(row));
  const resetBulkAnnul = () => {
    setBulkAnnulMode(false);
    setSelectedForAnnul([]);
    setBulkAnnulReason("");
    setBulkAnnulCommands({});
  };
  const toggleBulkRow = (eventId) => setSelectedForAnnul((current) => current.includes(eventId)
    ? current.filter((id) => id !== eventId) : [...current, eventId]);
  const toggleAllBulkRows = () => setSelectedForAnnul((current) => current.length === annullableRows.length
    ? [] : annullableRows.map((row) => row.event_id));
  const bulkAnnul = async () => {
    setActionError("");
    setBulkAnnulSuccess("");
    if (!bulkAnnulReason.trim()) {
      setActionError("Indica el motivo de la anulación.");
      return;
    }
    if (!selectedRows.length) {
      setActionError("Selecciona al menos un registro para anular.");
      return;
    }
    const commands = { ...bulkAnnulCommands };
    selectedRows.forEach((row) => {
      commands[row.event_id] ||= {
        event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
        reason: bulkAnnulReason, correction_effect: "annul", patch: {},
      };
    });
    setBulkAnnulCommands(commands);
    // Each request is an immutable logical annulment of its selected source
    // record. Sequential execution preserves lineage and lets a retry reuse
    // the same idempotency keys if the connection fails partway through.
    const count = selectedRows.length;
    setBulkAnnulSubmitting(true);
    try {
      for (const row of selectedRows) await onCorrect(row, commands[row.event_id]);
      resetBulkAnnul();
      setBulkAnnulSuccess(bulkAnnulSuccessMessage(count));
    } catch (failure) {
      setActionError(failure.message || "No pudimos eliminar los registros seleccionados.");
    } finally {
      setBulkAnnulSubmitting(false);
    }
  };

  return <section className="progress-section progress-audit" aria-labelledby="progress-audit">
    <SectionHeading id="progress-audit" eyebrow="Historial" title="Historial de cambios"
      description="Revisa los datos registrados y corrige un registro sin borrar su historia." />
    <div className="progress-audit__bulk-actions">
      {!bulkAnnulMode ? <button type="button" className="secondary-button" disabled={busy}
        onClick={() => { setBulkAnnulMode(true); setTarget(null); setAnnulReason(""); setAnnulCommand(null); setBulkAnnulSuccess(""); }}>
        <i className="ti ti-trash" aria-hidden="true" /> Seleccionar registros para anular
      </button> : <>
        <p>Selecciona los registros que quieras quitar de la evolución. La evaluación inicial se conserva.</p>
        <button type="button" className="text-button progress-audit__select-all" disabled={busy || !annullableRows.length}
          onClick={toggleAllBulkRows}>{selectedRows.length === annullableRows.length ? "Quitar selección" : `Seleccionar todos (${annullableRows.length})`}</button>
        <label>Motivo de anulación múltiple<textarea rows="4" maxLength="500" value={bulkAnnulReason}
          onChange={(event) => { setBulkAnnulReason(event.target.value); setBulkAnnulCommands({}); }} /></label>
        <div><button type="button" className="secondary-button" disabled={busy || bulkAnnulSubmitting} onClick={resetBulkAnnul}>Cancelar</button>
          <button type="button" className="secondary-button progress-audit__bulk-delete" disabled={busy || bulkAnnulSubmitting || !selectedRows.length || !bulkAnnulReason.trim()}
            onClick={bulkAnnul}><i className="ti ti-trash" aria-hidden="true" /> Anular {selectedRows.length || ""} registro{selectedRows.length === 1 ? "" : "s"}</button></div>
      </>}
    </div>
    {bulkAnnulSubmitting && <p className="progress-audit__feedback" role="status" aria-live="polite"><span className="loading-spinner" />
      Eliminando {selectedRows.length} registro{selectedRows.length === 1 ? "" : "s"}…</p>}
    {bulkAnnulSuccess && <p className="progress-audit__feedback is-success" role="status" aria-live="polite"><i className="ti ti-check" aria-hidden="true" /> {bulkAnnulSuccess}</p>}
    <ol className="progress-audit-list">{data.audit_line.map((row) => <li key={row.event_id} id={`progress-audit-record-${row.event_id}`}>
      <div className="progress-audit-record__head">
        <div className="progress-audit-record__meta"><strong>{dateTime(row.effective_at)}</strong><p>{row.reason}</p>
          <span>{data.excluded_from_metrics.includes(row.event_id) ? "Versión anterior" : "Registro vigente"}</span></div>
        {!bulkAnnulMode && <button type="button" className="secondary-button progress-audit-record__correct" disabled={busy}
          aria-controls={`progress-correction-${row.event_id}`} aria-expanded={target?.event_id === row.event_id}
          onClick={() => {
            setTarget((currentTarget) => correctionTargetForClick(currentTarget, row));
            setAnnulReason(""); setAnnulCommand(null);
          }}>
          Corregir registro
        </button>}
      </div>
      <details className="progress-recorded-data"><summary>Ver datos registrados</summary>
        <HistoricalRecordDetails row={row} />
      </details>
      {bulkAnnulMode && canAnnulRow(row) && <label className="progress-audit-record__select">
        <span>Seleccionar para anular</span><input type="checkbox" checked={selectedForAnnul.includes(row.event_id)} disabled={busy}
          onChange={() => toggleBulkRow(row.event_id)} aria-label={`Seleccionar registro del ${dateTime(row.effective_at)} para anular`} />
      </label>}
      {target?.event_id === row.event_id && correctionEditor(row)}
    </li>)}</ol>
    {actionError && <p role="alert" className="warning-note">{actionError}</p>}
  </section>;
}

export default function ProgressPage({ onOpenHistory, onOpenProject, onStartEvaluation, onChanged }) {
  const [data, setData] = useState(null);
  const [projection, setProjection] = useState(null);
  const [projectionError, setProjectionError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setProjection(null);
    setProjectionError("");
    getTracking().then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); });
    getProjection().then((result) => { if (active) setProjection(result); })
      .catch((failure) => { if (active) setProjectionError(failure.message || "No pudimos calcularla en este momento."); });
    return () => { active = false; };
  }, [version]);
  const mutate = useCallback(async (operation) => {
    setBusy(true);
    try { await operation(); setVersion((value) => value + 1); onChanged?.(); }
    finally { setBusy(false); }
  }, [onChanged]);

  return <main className="section-block progress-page">
    <div className="page-head progress-page__head"><div>
      <span className="eyebrow">Seguimiento mensual</span><h1>Mi progreso</h1>
      <p>Actualiza tus antecedentes, revisa tus metas y observa cómo evoluciona tu preparación.</p>
    </div></div>
    {error && <div className="warning-note" role="alert"><i className="ti ti-alert-triangle" aria-hidden="true" />
      <span>{error}</span><button className="text-button" onClick={() => setVersion((value) => value + 1)}>Reintentar</button></div>}
    {!data && !error && <div className="progress-loading" role="status"><span className="loading-spinner" /> Cargando seguimiento…</div>}
    {data?.status === "not_started" && <section className="progress-empty">
      <i className="ti ti-chart-line" aria-hidden="true" /><h2>Tu seguimiento comenzará con una evaluación</h2>
      <p>La primera evaluación válida fijará el plan y sus metas originales.</p>
      <button className="primary-button" onClick={onStartEvaluation}>Realizar evaluación</button>
    </section>}
    {data?.status === "active" && <ProgressView data={data} projection={projection} projectionError={projectionError} busy={busy}
      onRetryProjection={() => setVersion((value) => value + 1)}
      onOpenHistory={onOpenHistory}
      onOpenProject={onOpenProject}
      onUpdate={(command) => mutate(() => appendTrackingEvent(command))}
      onConfirm={(goal) => mutate(() => confirmTrackingGoal(goal.goal_id, {
        event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
        reason: "Confirmación del usuario", confirmed: goal.action_status !== "cumplida",
      }))} />}
  </main>;
}

export function TrackingHistoryPage({ onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    getTracking().then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [version]);
  const mutate = useCallback(async (operation) => {
    setBusy(true);
    try { await operation(); setVersion((value) => value + 1); onChanged?.(); }
    finally { setBusy(false); }
  }, [onChanged]);

  return <main className="section-block progress-page">
    <div className="page-head progress-page__head"><div>
      <span className="eyebrow">Seguimiento mensual</span><h1>Ver y corregir historial</h1>
      <p>Consulta los cambios registrados y corrige un dato cuando sea necesario.</p>
    </div></div>
    {error && <div className="warning-note" role="alert"><i className="ti ti-alert-triangle" aria-hidden="true" />
      <span>{error}</span><button className="text-button" onClick={() => setVersion((value) => value + 1)}>Reintentar</button></div>}
    {!data && !error && <div className="progress-loading" role="status"><span className="loading-spinner" /> Cargando historial…</div>}
    {data?.status === "not_started" && <section className="progress-empty">
      <i className="ti ti-history" aria-hidden="true" /><h2>Aún no hay historial disponible</h2>
    </section>}
    {data?.status === "active" && <TrackingHistoryView data={data} busy={busy}
      onCorrect={(target, command) => mutate(() => correctTrackingEvent(target.event_id, command))} />}
  </main>;
}
