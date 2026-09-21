import React, { useCallback, useEffect, useState } from "react";
import {
  appendTrackingEvent, confirmTrackingGoal, correctTrackingEvent, getProjection, getTracking,
} from "../../services/trackingService";
import { activeSeries, belongsToSlot, displayValue, projectName, projectionCauses, trackingProjectContext } from "../../lib/tracking/display";
import UpdateFinancialDataForm from "./UpdateFinancialDataForm";
import "./tracking.css";

const dateTime = (value) => value
  ? new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
  : "Sin fecha";
const dateOnly = (value) => value
  ? new Date(value).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  : "Sin fecha";

const statusLabels = {
  cumplida: "Cumplida", en_curso: "En curso", pendiente: "Pendiente", vencida: "Fuera de plazo",
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

function Trend({ series, field, label }) {
  const points = series.filter((row) => Number.isFinite(row[field]));
  if (points.length < 2) return <figure className="progress-trend progress-trend--empty">
    <figcaption>{label}</figcaption><p>Aún falta una segunda observación.</p>
  </figure>;
  const values = points.map((row) => row[field]);
  const dates = points.map((row) => new Date(row.at).getTime());
  const low = Math.min(...values), high = Math.max(...values);
  const start = Math.min(...dates), end = Math.max(...dates);
  const path = points.map((row, index) =>
    `${10 + 280 * (dates[index] - start) / (end - start || 1)},${90 - 80 * (row[field] - low) / (high - low || 1)}`).join(" ");
  return <figure className="progress-trend">
    <figcaption><span>{label}</span><strong>{displayValue(values[0])} → {displayValue(values.at(-1))}</strong></figcaption>
    <svg viewBox="0 0 300 100" role="img" aria-label={`Evolución de ${label}; solo registros activos`}>
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

export function ProgressView({ data, projection, onConfirm, onCorrect, onUpdate, busy = false }) {
  const series = activeSeries(data.active_line);
  const baseline = data.audit_line.find((row) => row.event_id === data.baseline.root_event_id);
  const initialScore = baseline?.evaluation?.score;
  const current = data.current_evaluation;
  const projectContext = trackingProjectContext(data);
  const scoreChange = initialScore != null && current ? current.score - initialScore : null;
  const [audit, setAudit] = useState(false);
  const [target, setTarget] = useState(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulCommand, setAnnulCommand] = useState(null);
  const [actionError, setActionError] = useState("");
  const targetIsBaseline = target && belongsToSlot(target, data.baseline.root_event_id, data.audit_line);
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
      <div className="progress-summary__foot">
        <p><strong>Capacidad estimada:</strong> {displayValue(current?.financial_indicators?.capacidad_compra_estimada_uf)} UF</p>
        <p><strong>Objetivo de proyección:</strong> {projectName(projectContext.frozenTarget)}</p>
        {projectContext.hasDifferentLatestPreference && <p><strong>Última preferencia evaluada:</strong> {projectName(projectContext.latestPreference)}</p>}
        <p><strong>Compatibilidad de la última evaluación:</strong> {statusLabel(current?.project_fit?.classification)}</p>
      </div>
      <details className="progress-technical"><summary>Ver todos mis antecedentes vigentes</summary>
        <dl className="progress-data-list">{Object.entries(data.latest_effective_snapshot || {}).map(([field, value]) =>
          <div key={field}><dt>{snapshotLabels[field] || field.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
      </details>
    </section>

    <section className="progress-section" aria-labelledby="progress-goals">
      <SectionHeading id="progress-goals" eyebrow="Plan original" title="Mis metas"
        description="Las metas fijadas al iniciar el plan se conservan para que puedas medir avances comparables." />
      {!data.goals.length && <div className="empty-state"><strong>Este plan no contiene metas.</strong></div>}
      <div className="progress-goals">{data.goals.map((goal) => <article className="progress-goal-card" key={goal.goal_id}>
        <div className="progress-goal-card__head"><div><span className="progress-status">{statusLabel(goal.action_status)}</span>
          <h3>{goal.definition.title}</h3></div>
          {goal.progress.percentage != null && <strong>{displayValue(goal.progress.percentage)}%</strong>}
        </div>
        <p>{goal.definition.description}</p>
        {goal.progress.percentage != null && <progress max="100" value={goal.progress.percentage} aria-label={goal.definition.title} />}
        <dl className="progress-goal-values">
          <div><dt>Inicio</dt><dd>{displayValue(goal.progress.initial_value)}</dd></div>
          <div><dt>Actual</dt><dd>{displayValue(goal.progress.current_value)}</dd></div>
          <div><dt>Objetivo</dt><dd>{displayValue(goal.progress.target_value)}</dd></div>
          <div><dt>Restante</dt><dd>{displayValue(goal.progress.remaining_value)}</dd></div>
        </dl>
        <p className="progress-goal-card__schedule">Avance esperado hoy: {displayValue(goal.schedule.expected_percentage)}%
          {goal.definition.target_at && ` · Meta al ${dateOnly(goal.definition.target_at)}`}</p>
        {goal.evidence.ever_completed && <p className="progress-inline-note">Cumplimiento registrado previamente.
          {goal.evidence.currently_regressed && " Esta meta volvió a quedar pendiente."}</p>}
        {!goal.verification.verifiable && <button className="secondary-button" disabled={busy}
          onClick={() => perform(() => onConfirm(goal))}>
          {goal.action_status === "cumplida" ? "Revocar confirmación" : "Confirmar cumplimiento"}
        </button>}
      </article>)}</div>
    </section>

    <section className="progress-section progress-projection" aria-labelledby="progress-projection">
      <SectionHeading id="progress-projection" eyebrow="Estimación" title="Proyección observada"
        description="Se calcula con tu evolución registrada; es orientativa y no constituye una evaluación bancaria." />
      {!projection ? <p role="status">Calculando proyección…</p> : <div className="progress-projection__result">
        <i className="ti ti-calendar-stats" aria-hidden="true" /><div>
          <strong>{projection.target_compatible_at
            ? `${projection.status === "already_compatible" ? "Compatible al corte" : "Primera fecha compatible estimada"}: ${dateOnly(projection.target_compatible_at)}`
            : projectionCauses[projection.cause] || "No proyectable por ahora."}</strong>
          <p>Datos considerados hasta el {dateOnly(projection.cutoff_at)}.</p>
        </div>
      </div>}
      {projection && <details className="progress-technical"><summary>Ver supuestos técnicos</summary>
        <pre>{JSON.stringify({ variables: projection.variables, provenance: projection.provenance }, null, 2)}</pre>
      </details>}
    </section>

    <UpdateFinancialDataForm snapshot={data.latest_effective_snapshot} previous={data.latest_event_id} onSubmit={onUpdate} />

    <section className="progress-section" aria-labelledby="progress-timeline">
      <SectionHeading id="progress-timeline" eyebrow="Evolución" title="Línea de tiempo"
        description="Los gráficos y la proyección usan solo registros vigentes; las correcciones permanecen en auditoría." />
      <div className="progress-trends">{[["score", "Score"], ["income", "Ingreso"], ["debt", "Deuda"], ["savings", "Ahorro"]]
        .map(([field, label]) => <Trend key={field} series={series} field={field} label={label} />)}</div>
      <details className="progress-history"><summary>Ver historial financiero</summary>
        <div className="tracking-table"><table><caption>Historial financiero activo completo</caption>
          <thead><tr><th>Fecha</th><th>Score</th><th>Clasificación</th><th>Ingreso</th><th>Deuda</th><th>Ahorro</th></tr></thead>
          <tbody>{series.map((row) => <tr key={row.id}><td>{dateTime(row.at)}</td>
            {[row.score, row.classification, row.income, row.debt, row.savings].map((value, index) =>
              <td key={index}>{displayValue(value)}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
      <details className="progress-technical"><summary>Ver snapshots vigentes</summary>
        {data.active_line.map((row) => <details key={row.event_id}><summary>{dateTime(row.effective_at)}</summary>
          <pre>{JSON.stringify(row.snapshot, null, 2)}</pre></details>)}
      </details>
    </section>

    <section className="progress-section progress-audit" aria-labelledby="progress-audit">
      <SectionHeading id="progress-audit" eyebrow="Trazabilidad" title="Historial y correcciones"
        description="Cada versión se conserva. Corregir un registro no borra el original." />
      <button type="button" className="secondary-button" onClick={() => setAudit(!audit)}>
        <i className="ti ti-history" aria-hidden="true" /> {audit ? "Ocultar auditoría" : "Ver auditoría completa"}
      </button>
      {audit && <ol className="progress-audit-list">{data.audit_line.map((row) => <li key={row.event_id}>
        <div><strong>{dateTime(row.effective_at)}</strong><p>{row.reason}</p>
          <span>{data.excluded_from_metrics.includes(row.event_id) ? "Solo auditoría" : "Registro vigente"}</span></div>
        <details className="progress-technical"><summary>Detalles técnicos</summary><pre>{JSON.stringify(row, null, 2)}</pre></details>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => { setTarget(row); setAnnulReason(""); setAnnulCommand(null); }}>
          {belongsToSlot(row, data.baseline.root_event_id, data.audit_line) ? "Corregir baseline" : "Corregir o anular"}
        </button>
      </li>)}</ol>}
      {target && <div className="progress-correction">
        <h3>Corregir registro del {dateOnly(target.effective_at)}</h3>
        <p>El registro original se conservará íntegro para auditoría.</p>
        <UpdateFinancialDataForm key={target.event_id} correction snapshot={target.recorded_complete_snapshot}
          onSubmit={async (command) => {
            await onCorrect(target, { event_id: command.event_id, effective_at: command.effective_at,
              reason: command.reason, correction_effect: "replace", patch: { ...target.patch, ...command.patch } });
            setTarget(null);
          }} />
        {targetIsBaseline ? <p className="progress-inline-note">El baseline no se anula: corrige sus antecedentes mediante reemplazo.</p> : <div className="progress-annul">
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
    </section>
  </div>;
}

export default function ProgressPage({ onBack, onStartEvaluation, onChanged }) {
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
      {onBack && <button type="button" className="progress-back text-button" onClick={onBack}>
        <i className="ti ti-arrow-left" aria-hidden="true" /> Volver al plan de mejora
      </button>}
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
      onUpdate={(command) => mutate(() => appendTrackingEvent(command))}
      onCorrect={(target, command) => mutate(() => correctTrackingEvent(target.event_id, command))}
      onConfirm={(goal) => mutate(() => confirmTrackingGoal(goal.goal_id, {
        event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
        reason: "Confirmación del usuario", confirmed: goal.action_status !== "cumplida",
      }))} />}
  </main>;
}
