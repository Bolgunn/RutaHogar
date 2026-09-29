import React, { useCallback, useEffect, useState } from "react";
import {
  appendTrackingEvent, confirmTrackingGoal, correctTrackingEvent, getProjection, getTracking,
} from "../../services/trackingService";
import {
  activeSeries, belongsToSlot, displayValue, filterSeriesByPeriod,
  projectName, projectionCauses, trackingProjectContext,
} from "../../lib/tracking/display";
import UpdateFinancialDataForm from "./UpdateFinancialDataForm";
import "./tracking.css";

const dateTime = (value) => value
  ? new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
  : "Sin fecha";
const dateOnly = (value) => value
  ? new Date(value).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  : "Sin fecha";

const statusLabels = {
  cumplida: "Cumplida", en_progreso: "En progreso", en_curso: "En curso", pendiente: "Pendiente", vencida: "Fuera de plazo",
  dentro_de_lo_esperado: "Dentro de lo esperado", adelantado: "Adelantado", atrasado: "Atrasado",
  al_dia: "Al día", adelantada: "Adelantada", atrasada: "Atrasada",
  compatible: "Compatible", cercano: "Cercano", no_compatible: "Aún no compatible",
};
const statusLabel = (value) => statusLabels[value] || value?.replaceAll("_", " ") || "Sin datos suficientes";
const snapshotLabels = {
  ingreso_mensual: "Ingreso mensual", deuda_mensual: "Deuda mensual", ahorro_disponible: "Ahorro disponible",
  dividendo_estimado: "Dividendo estimado", monto_morosidad: "Monto de morosidad",
  morosidad_actual: "Morosidad actual", tipo_contrato: "Tipo de contrato",
  continuidad_laboral: "Continuidad laboral", edad: "Edad",
  plazo_credito_hipotecario: "Plazo del crédito", project_goal: "Proyecto objetivo",
};
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

function SectionHeading({ id, eyebrow, title, description }) {
  return <div className="progress-section-heading">
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2 id={id}>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}

export function ProgressView({ data, projection, onConfirm, onUpdate, onOpenHistory, busy = false }) {
  const series = activeSeries(data.active_line);
  const baseline = data.audit_line.find((row) => row.event_id === data.baseline.root_event_id);
  const initialScore = baseline?.evaluation?.score;
  const current = data.current_evaluation;
  const projectContext = trackingProjectContext(data);
  const scoreChange = initialScore != null && current ? current.score - initialScore : null;
  const [actionError, setActionError] = useState("");
  const [evolutionPeriod, setEvolutionPeriod] = useState("all");
  const visibleSeries = filterSeriesByPeriod(series, evolutionPeriod, data.cutoff_at);
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
          {!projection ? <strong>Calculando proyección…</strong> : <>
            <strong>{projection.target_compatible_at
              ? projection.status === "already_compatible"
                ? `Objetivo compatible al ${dateOnly(projection.target_compatible_at)}`
                : `Fecha compatible estimada: ${dateOnly(projection.target_compatible_at)}`
              : "Aún no podemos estimar una fecha"}</strong>
            {!projection.target_compatible_at && <p>
              {projectionCauses[projection.cause] || "Registra nuevos antecedentes para actualizar esta proyección."}
            </p>}
          </>}
        </div>
        <dl>
          <div><dt>Capacidad estimada</dt><dd>{displayValue(current?.financial_indicators?.capacidad_compra_estimada_uf)} UF</dd></div>
          <div><dt>Compatibilidad actual</dt><dd>{statusLabel(current?.project_fit?.classification)}</dd></div>
        </dl>
      </div>
      <div className="progress-summary__foot">
        <p><strong>Objetivo de proyección:</strong> {projectName(projectContext.frozenTarget)}</p>
        {projectContext.hasDifferentLatestPreference && <p><strong>Última preferencia evaluada:</strong> {projectName(projectContext.latestPreference)}</p>}
      </div>
    </section>

    <section className="progress-section" aria-labelledby="progress-goals">
      <SectionHeading id="progress-goals" eyebrow="Plan original" title="Mis metas"
        description="Las metas fijadas al iniciar el plan se conservan para que puedas medir avances comparables." />
      {!data.goals.length && <div className="empty-state"><strong>Este plan no contiene metas.</strong></div>}
      <div className="progress-goals">{data.goals.map((goal) => <article className="progress-goal-card" key={goal.goal_id}>
        <div className="progress-goal-card__head"><div>
          <h3>{goal.definition.title}</h3>
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
        {goal.progress.percentage != null && <progress max="100" value={goal.progress.percentage} aria-label={goal.definition.title} />}
        <dl className="progress-goal-values">
          <div><dt>Actual</dt><dd>{displayValue(goal.progress.current_value)}</dd></div>
          <div><dt>Objetivo</dt><dd>{displayValue(goal.progress.target_value)}</dd></div>
          <div><dt>Restante</dt><dd>{displayValue(goal.progress.remaining_value)}</dd></div>
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
      </article>)}</div>
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
        .map(([field, label]) => <Trend key={field} series={visibleSeries} field={field} label={label} />)}</div>
      <details className="progress-history"><summary>Ver historial financiero</summary>
        <div className="tracking-table"><table><caption>Datos del período seleccionado</caption>
          <thead><tr><th>Fecha</th><th>Score</th><th>Clasificación</th><th>Ingreso</th><th>Deuda</th><th>Ahorro</th></tr></thead>
          <tbody>{visibleSeries.map((row) => <tr key={row.id}><td>{dateTime(row.at)}</td>
            {[row.score, row.classification, row.income, row.debt, row.savings].map((value, index) =>
              <td key={index}>{displayValue(value)}</td>)}</tr>)}</tbody>
        </table></div>
        <div className="progress-history__actions">
          <button type="button" className="secondary-button" onClick={onOpenHistory}>
            <i className="ti ti-history" aria-hidden="true" /> Ver y corregir historial
          </button>
        </div>
      </details>
    </section>
  </div>;
}

export function TrackingHistoryView({ data, onCorrect, busy = false }) {
  const [target, setTarget] = useState(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulCommand, setAnnulCommand] = useState(null);
  const [actionError, setActionError] = useState("");
  const targetIsBaseline = target && belongsToSlot(target, data.baseline.root_event_id, data.audit_line);
  const perform = async (operation) => {
    setActionError("");
    try { await operation(); } catch (failure) { setActionError(failure.message); }
  };

  return <section className="progress-section progress-audit" aria-labelledby="progress-audit">
    <SectionHeading id="progress-audit" eyebrow="Historial" title="Historial de cambios"
      description="Revisa los datos registrados y corrige un registro sin borrar su historia." />
    <ol className="progress-audit-list">{data.audit_line.map((row) => <li key={row.event_id}>
      <div><strong>{dateTime(row.effective_at)}</strong><p>{row.reason}</p>
        <span>{data.excluded_from_metrics.includes(row.event_id) ? "Versión anterior" : "Registro vigente"}</span></div>
      <details className="progress-recorded-data"><summary>Ver datos registrados</summary>
        <dl className="progress-data-list">{Object.entries(row.recorded_complete_snapshot || row.snapshot || {}).map(([field, value]) =>
          <div key={field}><dt>{snapshotLabels[field] || field.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
      </details>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => { setTarget(row); setAnnulReason(""); setAnnulCommand(null); }}>
        Corregir registro
      </button>
    </li>)}</ol>
    {target && <div className="progress-correction">
      <h3>Corregir registro del {dateOnly(target.effective_at)}</h3>
      <p>El registro original se conservará en el historial de cambios.</p>
      <UpdateFinancialDataForm key={target.event_id} correction snapshot={target.recorded_complete_snapshot}
        onSubmit={async (command) => {
          await onCorrect(target, { event_id: command.event_id, effective_at: command.effective_at,
            reason: command.reason, correction_effect: "replace", patch: { ...target.patch, ...command.patch } });
          setTarget(null);
        }} />
      {targetIsBaseline ? <p className="progress-inline-note">La evaluación inicial no se puede anular. Puedes corregir sus datos registrados.</p> : <div className="progress-annul">
        <label>Motivo de anulación<input value={annulReason}
          onChange={(event) => { setAnnulReason(event.target.value); setAnnulCommand(null); }} /></label>
        <button type="button" className="secondary-button" disabled={busy || !annulReason.trim()}
          onClick={() => perform(async () => {
            const command = annulCommand || { event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
              reason: annulReason, correction_effect: "annul", patch: {} };
            setAnnulCommand(command);
            await onCorrect(target, command);
            setTarget(null);
          })}>Anular lógicamente</button>
      </div>}
      <button type="button" className="text-button" onClick={() => setTarget(null)}>Cancelar</button>
    </div>}
    {actionError && <p role="alert" className="warning-note">{actionError}</p>}
  </section>;
}

export default function ProgressPage({ onOpenHistory, onStartEvaluation, onChanged }) {
  const [data, setData] = useState(null);
  const [projection, setProjection] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    getTracking().then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); });
    getProjection().then((result) => { if (active) setProjection(result); })
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
    {data?.status === "active" && <ProgressView data={data} projection={projection} busy={busy}
      onOpenHistory={onOpenHistory}
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
