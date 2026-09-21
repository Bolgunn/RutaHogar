import React, { useCallback, useEffect, useState } from "react";
import {
  appendTrackingEvent, confirmTrackingGoal, correctTrackingEvent, getProjection, getTracking,
} from "../../services/trackingService";
import { activeSeries, belongsToSlot, displayValue, projectionCauses } from "../../lib/tracking/display";
import UpdateFinancialDataForm from "./UpdateFinancialDataForm";
import "./tracking.css";

const date = (value) => value ? new Date(value).toLocaleString("es-CL") : "Sin fecha";
const statusLabel = (value) => value?.replaceAll("_", " ") || "Sin datos suficientes";

function Trend({ series, field, label }) {
  const points = series.filter((row) => Number.isFinite(row[field]));
  if (points.length < 2) return <p>{label}: aún no hay dos observaciones.</p>;
  const values = points.map((row) => row[field]);
  const dates = points.map((row) => new Date(row.at).getTime());
  const low = Math.min(...values), high = Math.max(...values);
  const start = Math.min(...dates), end = Math.max(...dates);
  const path = points.map((row, i) =>
    `${10 + 280 * (dates[i] - start) / (end - start || 1)},${90 - 80 * (row[field] - low) / (high - low || 1)}`).join(" ");
  return <figure><figcaption>{label}: {displayValue(values[0])} → {displayValue(values.at(-1))}</figcaption>
    <svg viewBox="0 0 300 100" role="img" aria-label={`Evolución de ${label}; solo registros activos`}>
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  </figure>;
}

export function ProgressView({ data, projection, onConfirm, onCorrect, onUpdate, busy = false }) {
  const series = activeSeries(data.active_line);
  const baseline = data.audit_line.find((row) => row.event_id === data.baseline.root_event_id);
  const initialScore = baseline?.evaluation?.score;
  const current = data.current_evaluation;
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
  return <>
    <section aria-labelledby="tracking-summary">
      <h2 id="tracking-summary">Resumen actual</h2>
      <p>Baseline: {date(data.baseline.baseline_at)}. Sus metas originales permanecen congeladas.</p>
      <p>Score: {displayValue(current?.score)} · {current?.classification || "Sin evaluación activa"}.
        {" "}Desde la primera evaluación: {initialScore != null && current
          ? displayValue(current.score - initialScore) : "Sin datos"} puntos.</p>
      {data.update_due && <p role="status" className="tracking-notice">Actualización pendiente: han pasado 30 días desde tus últimos datos.</p>}
      <dl className="tracking-grid">{[
        ["ingreso_mensual", "Ingreso mensual"], ["deuda_mensual", "Deuda mensual"], ["ahorro_disponible", "Ahorro"],
      ].map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{displayValue(data.latest_effective_snapshot?.[field])}</dd></div>)}</dl>
      <p>Capacidad estimada: {displayValue(current?.financial_indicators?.capacidad_compra_estimada_uf)} UF.
        {" "}Compatibilidad: {current?.project_fit?.classification || "Sin datos"}.</p>
      <details><summary>Todos los antecedentes vigentes</summary>
        <dl>{Object.entries(data.latest_effective_snapshot || {}).map(([field, value]) =>
          <div key={field}><dt>{field.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
      </details>
    </section>
    <section><h2>Metas originales</h2>
      {!data.goals.length && <p>El plan inicial no contiene metas.</p>}
      <div className="tracking-grid">{data.goals.map((goal) => <article className="tracking-goal" key={goal.goal_id}>
        <h3>{goal.definition.title}</h3><p>{goal.definition.description}</p>
        <p>{statusLabel(goal.action_status)} · {statusLabel(goal.temporal_status)}</p>
        <p>Inicial: {displayValue(goal.progress.initial_value)} · Actual: {displayValue(goal.progress.current_value)}</p>
        <p>Objetivo: {displayValue(goal.progress.target_value)} · Restante: {displayValue(goal.progress.remaining_value)}</p>
        {goal.progress.percentage != null && <><progress max="100" value={goal.progress.percentage} aria-label={goal.definition.title} />
          <span> {displayValue(goal.progress.percentage)}%</span></>}
        <p>Esperado a esta fecha: {displayValue(goal.schedule.expected_percentage)}%
          {goal.definition.target_at && ` · Fecha objetivo: ${date(goal.definition.target_at)}`}</p>
        {goal.evidence.ever_completed && <p>Cumplimiento previo registrado.
          {goal.evidence.currently_regressed && " La meta se ha reabierto."}</p>}
        {!goal.verification.verifiable && <button className="secondary-button" disabled={busy}
          onClick={() => perform(() => onConfirm(goal))}>
          {goal.action_status === "cumplida" ? "Revocar confirmación" : "Confirmar cumplimiento"}
        </button>}
      </article>)}</div>
    </section>
    <section><h2>Proyección observada</h2><p>Resultado derivado; no constituye una evaluación real ni una garantía.</p>
      {!projection ? <p>Cargando proyección…</p> : <>
        <p>{projection.target_compatible_at
          ? `${projection.status === "already_compatible" ? "Compatible al corte" : "Primera fecha compatible estimada"}: ${date(projection.target_compatible_at)}`
          : projectionCauses[projection.cause] || "No proyectable."}</p>
        <p>Fecha de corte: {date(projection.cutoff_at)}.</p>
        <details><summary>Observaciones, versiones y supuestos</summary>
          <pre>{JSON.stringify({ variables: projection.variables, provenance: projection.provenance }, null, 2)}</pre>
        </details>
      </>}
    </section>
    <UpdateFinancialDataForm snapshot={data.latest_effective_snapshot} previous={data.latest_event_id} onSubmit={onUpdate} />
    <section><h2>Línea de tiempo</h2><p>Los registros corregidos o anulados no participan en gráficos ni proyecciones.</p>
      <div className="tracking-grid">{[["score", "Score"], ["income", "Ingreso"], ["debt", "Deuda"], ["savings", "Ahorro"]]
        .map(([field, label]) => <Trend key={field} series={series} field={field} label={label} />)}</div>
      <div className="tracking-table"><table><caption>Historial financiero activo completo</caption>
        <thead><tr><th>Fecha</th><th>Score histórico</th><th>Clasificación</th><th>Ingreso</th><th>Deuda</th><th>Ahorro</th></tr></thead>
        <tbody>{series.map((row) => <tr key={row.id}><td>{date(row.at)}</td>
          {[row.score, row.classification, row.income, row.debt, row.savings].map((value, index) =>
            <td key={index}>{displayValue(value)}</td>)}</tr>)}</tbody>
      </table></div>
      {data.active_line.map((row) => <details key={row.event_id}><summary>Antecedentes completos: {date(row.effective_at)}</summary>
        <pre>{JSON.stringify(row.snapshot, null, 2)}</pre>
      </details>)}
    </section>
    <section><h2>Historial y correcciones</h2>
      <button type="button" className="secondary-button" onClick={() => setAudit(!audit)}>
        {audit ? "Ocultar auditoría" : "Ver auditoría completa"}
      </button>
      {audit && <ol>{data.audit_line.map((row) => <li key={row.event_id}>
        <p>{date(row.effective_at)} · {row.reason} ·
          {data.excluded_from_metrics.includes(row.event_id) ? " Corregido/anulado; solo auditoría" : " Activo"}</p>
        <p>Registrado: {date(row.recorded_at)}</p>
        <details><summary>Snapshot original y relaciones</summary><pre>{JSON.stringify(row, null, 2)}</pre></details>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => { setTarget(row); setAnnulReason(""); setAnnulCommand(null); }}>
          {belongsToSlot(row, data.baseline.root_event_id, data.audit_line) ? "Corregir baseline" : "Corregir o anular"}
        </button>
      </li>)}</ol>}
      {target && <div>
        <p>Registro seleccionado: {date(target.effective_at)}. Se conservará íntegro para auditoría.</p>
        <UpdateFinancialDataForm key={target.event_id} correction snapshot={target.recorded_complete_snapshot}
          onSubmit={async (command) => {
            await onCorrect(target, { event_id: command.event_id, effective_at: command.effective_at,
              reason: command.reason, correction_effect: "replace", patch: { ...target.patch, ...command.patch } });
            setTarget(null);
          }} />
        {targetIsBaseline ? <p>El baseline no se anula: corrige sus antecedentes mediante reemplazo.</p> : <>
          <label>Motivo de anulación<input value={annulReason}
            onChange={(e) => { setAnnulReason(e.target.value); setAnnulCommand(null); }} /></label>
          <button type="button" className="secondary-button" disabled={busy || !annulReason.trim()}
            onClick={() => perform(async () => {
              const command = annulCommand || { event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
                reason: annulReason, correction_effect: "annul", patch: {} };
              setAnnulCommand(command);
              await onCorrect(target, command);
              setTarget(null);
            })}>Anular lógicamente</button>
        </>}
        <button type="button" onClick={() => setTarget(null)}>Cancelar</button>
      </div>}
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  </>;
}

export default function ProgressPage({ compact = false, onOpenProgress, onStartEvaluation, onChanged }) {
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
    if (!compact) getProjection().then((result) => { if (active) setProjection(result); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [compact, version]);
  const mutate = useCallback(async (operation) => {
    setBusy(true);
    try {
      await operation();
      setVersion((value) => value + 1);
      onChanged?.();
    } finally { setBusy(false); }
  }, [onChanged]);
  return <main className="tracking-page">
    <h1>{compact ? "Plan de mejora" : "Mi progreso"}</h1>
    {error && <p role="alert">{error} <button onClick={() => setVersion((value) => value + 1)}>Reintentar</button></p>}
    {!data && !error && <p role="status">Cargando seguimiento…</p>}
    {data?.status === "not_started" && <section>
      <p>Aún no existe un seguimiento. Tu próxima evaluación válida fijará el plan y las metas originales.</p>
      <button className="primary-button" onClick={onStartEvaluation}>Realizar evaluación</button>
    </section>}
    {data?.status === "active" && (compact ? <section>
      <p>Tu plan original fue establecido el {date(data.baseline.baseline_at)} y se conserva sin cambios.</p>
      {data.goals.map((goal) => <article key={goal.goal_id}><h2>{goal.definition.title}</h2>
        <p>{goal.definition.description}</p><p>{statusLabel(goal.action_status)}</p></article>)}
      {data.update_due && <p role="status">Actualización pendiente: han pasado 30 días.</p>}
      <button className="primary-button" onClick={onOpenProgress}>Mi progreso</button>
    </section> : <ProgressView data={data} projection={projection} busy={busy}
      onUpdate={(command) => mutate(() => appendTrackingEvent(command))}
      onCorrect={(target, command) => mutate(() => correctTrackingEvent(target.event_id, command))}
      onConfirm={(goal) => mutate(() => confirmTrackingGoal(goal.goal_id, {
        event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
        reason: "Confirmación del usuario", confirmed: goal.action_status !== "cumplida",
      }))} />)}
  </main>;
}
