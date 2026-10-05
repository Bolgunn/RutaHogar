import React, { useEffect, useState } from "react";
import { overallStage } from "../lib/commercial/overallStage";
import { allowedTargets, DEFAULT_STAGE, reasonRequired, stageLabel } from "../lib/commercial/stageRules";
import { changeCommercialStage, getCommercialStageHistory, getCommercialStageScope } from "../services/commercialStageService";

const LEAD_LEVEL = "";
const EMPTY_SCOPE = { lead_level_writable: false, lead_level: null, proyectos: [] };
const SYSTEM_REASONS = {
  proyecto_agotado: "Sistema · proyecto agotado",
  proyecto_repuesto: "Sistema · proyecto repuesto",
};

function formatStageDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL");
}

function actorLabel(event) {
  if (event.actor_role === "sistema") return SYSTEM_REASONS[event.reason] || "Sistema";
  return event.actor_role === "ejecutivo" ? "Ejecutivo" : "Administrador";
}

export function CommercialStageBadge({ records }) {
  const { stage, causa } = overallStage(records || []);
  return (
    <span className={`status-pill commercial-stage-pill commercial-stage-pill--${stage}`}>
      {stageLabel(stage)}
      {causa === "por_agotamiento" && <small> · por agotamiento</small>}
    </span>
  );
}

export default function CommercialStagePanel({ leadId, records, role, onChanged }) {
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [history, setHistory] = useState([]);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(LEAD_LEVEL);
  const [toStage, setToStage] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(LEAD_LEVEL);
  }, [leadId]);

  useEffect(() => {
    let active = true;
    Promise.all([getCommercialStageScope(leadId), getCommercialStageHistory(leadId)])
      .then(([loadedScope, events]) => {
        if (!active) return;
        setScope(loadedScope);
        setHistory(events);
      });
    return () => { active = false; };
  }, [leadId, version]);

  useEffect(() => {
    setToStage("");
    setReason("");
    setError("");
  }, [leadId, selected, version]);

  const projectRecords = scope.proyectos.filter((item) => item.stage);
  const selectedProject = scope.proyectos.find((item) => item.id === selected);
  const isLeadLevel = !selectedProject;
  const current = (isLeadLevel ? scope.lead_level?.stage : selectedProject.stage) || DEFAULT_STAGE;
  const writable = isLeadLevel ? scope.lead_level_writable : selectedProject.writable;
  const targets = allowedTargets(current, role, isLeadLevel
    ? {
      level: "lead",
      hasProjectRecords: projectRecords.length > 0,
      allProjectRecordsPerdido: projectRecords.length > 0 && projectRecords.every((item) => item.stage === "perdido"),
    }
    : { level: "proyecto" });
  const needsReason = Boolean(toStage) && reasonRequired(current, toStage);
  const canSubmit = writable && toStage && (!needsReason || reason.trim()) && !saving;
  const projectNames = Object.fromEntries(scope.proyectos.map((item) => [item.id, item.nombre]));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await changeCommercialStage({
        leadId,
        toStage,
        reason,
        expectedStage: current,
        proyectoId: selectedProject?.id,
      });
      setVersion((value) => value + 1);
      onChanged?.(leadId);
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel-card commercial-stage-panel">
      <div className="admin-panel-card__header">
        <div>
          <h3>Etapa comercial</h3>
          <p>Etapa de este lead en tu inmobiliaria: un registro general y uno por proyecto. Cada cambio queda registrado con fecha, responsable y motivo.</p>
        </div>
        <CommercialStageBadge records={records} />
      </div>

      <div className="field-wrap">
        <label htmlFor="commercial-stage-record">Registro</label>
        <select id="commercial-stage-record" value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value={LEAD_LEVEL}>Lead (general) · {stageLabel(scope.lead_level?.stage)}</option>
          {scope.proyectos.map((item) => (
            <option key={item.id} value={item.id}>{item.nombre} · {stageLabel(item.stage)}</option>
          ))}
        </select>
      </div>

      {!writable ? (
        <p className="admin-inline-note">
          {isLeadLevel
            ? "Este lead no está asociado a tu inmobiliaria o no hay conexión con la base de datos: la etapa es solo de lectura."
            : "Solo lectura: no estás vinculado a este proyecto."}
        </p>
      ) : targets.length === 0 ? (
        <p className="admin-inline-note">
          {current === "venta_cerrada"
            ? "La venta cerrada solo puede revertirla un administrador."
            : "No hay cambios de etapa disponibles para este registro."}
        </p>
      ) : (
        <form className="commercial-stage-panel__form" onSubmit={handleSubmit}>
          <div className="field-wrap">
            <label htmlFor="commercial-stage-target">Mover a</label>
            <select id="commercial-stage-target" value={toStage} onChange={(event) => setToStage(event.target.value)}>
              <option value="">Selecciona una etapa</option>
              {targets.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value === current ? `Mantener en ${item.label} (sigue vivo)` : item.label}
                </option>
              ))}
            </select>
          </div>
          {toStage && (
            <div className="field-wrap">
              <label htmlFor="commercial-stage-reason">Motivo{needsReason ? "" : " (opcional)"}</label>
              <textarea
                id="commercial-stage-reason"
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej: No responde hace 60 días. No incluyas montos ni datos financieros."
              />
            </div>
          )}
          {error && <span className="field-warning" role="alert">{error}</span>}
          <button type="submit" className="primary-button compact-button" disabled={!canSubmit}>
            {saving ? "Guardando..." : "Actualizar etapa"}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <ol className="commercial-stage-panel__history">
          {history.slice(-5).reverse().map((event) => (
            <li key={event.id}>
              <strong>
                {event.proyecto_id ? projectNames[event.proyecto_id] || "Proyecto" : "General"}
                {" · "}
                {event.stage_before === event.stage_after
                  ? `${stageLabel(event.stage_after)} (sigue vivo)`
                  : `${event.stage_before ? `${stageLabel(event.stage_before)} → ` : ""}${stageLabel(event.stage_after)}`}
              </strong>
              <span>{formatStageDate(event.occurred_at)} · {actorLabel(event)}</span>
              {event.reason && event.actor_role !== "sistema" && <p>{event.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
