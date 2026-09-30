import React, { useEffect, useState } from "react";
import { allowedTargets, DEFAULT_STAGE, reasonRequired, stageLabel } from "../lib/commercial/stageRules";
import { canManageLeadStage, changeCommercialStage, getCommercialStageHistory } from "../services/commercialStageService";

function formatStageDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL");
}

export function CommercialStageBadge({ stage }) {
  const value = stage || DEFAULT_STAGE;
  return <span className={`status-pill commercial-stage-pill commercial-stage-pill--${value}`}>{stageLabel(value)}</span>;
}

export default function CommercialStagePanel({ leadId, stage, role, onChanged }) {
  const current = stage || DEFAULT_STAGE;
  const [canManage, setCanManage] = useState(false);
  const [history, setHistory] = useState([]);
  const [toStage, setToStage] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setToStage("");
    setReason("");
    setError("");
    Promise.all([canManageLeadStage(leadId), getCommercialStageHistory(leadId)])
      .then(([allowed, events]) => {
        if (!active) return;
        setCanManage(allowed);
        setHistory(events);
      });
    return () => { active = false; };
  }, [leadId, current]);

  const targets = allowedTargets(current, role);
  const needsReason = Boolean(toStage) && reasonRequired(current, toStage);
  const canSubmit = canManage && toStage && (!needsReason || reason.trim()) && !saving;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const saved = await changeCommercialStage({ leadId, toStage, reason, expectedStage: current });
      onChanged?.(leadId, { stage: saved.stage, updated_at: saved.occurred_at });
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
          <p>Etapa de este lead en tu inmobiliaria. Cada cambio queda registrado con fecha, responsable y motivo.</p>
        </div>
        <CommercialStageBadge stage={current} />
      </div>

      {!canManage ? (
        <p className="admin-inline-note">Este lead no está asociado a tu inmobiliaria o no hay conexión con la base de datos: la etapa es solo de lectura.</p>
      ) : targets.length === 0 ? (
        <p className="admin-inline-note">La venta cerrada solo puede revertirla un administrador.</p>
      ) : (
        <form className="commercial-stage-panel__form" onSubmit={handleSubmit}>
          <div className="field-wrap">
            <label htmlFor="commercial-stage-target">Mover a</label>
            <select id="commercial-stage-target" value={toStage} onChange={(event) => setToStage(event.target.value)}>
              <option value="">Selecciona una etapa</option>
              {targets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
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
              <strong>{event.stage_before ? `${stageLabel(event.stage_before)} → ` : ""}{stageLabel(event.stage_after)}</strong>
              <span>{formatStageDate(event.occurred_at)} · {event.actor_role === "sistema" ? "Sistema" : event.actor_role === "ejecutivo" ? "Ejecutivo" : "Administrador"}</span>
              {event.reason && <p>{event.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
