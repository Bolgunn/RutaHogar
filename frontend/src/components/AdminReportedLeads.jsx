import React, { useEffect, useState } from "react";
import { getLeadsInReview, resolveLeadStatus } from "../services/leadManagementService";
import LeadDetailModal from "./LeadDetailModal";
import { getClassificationClass } from "../utils/helpers";
import "./admin-reported-leads.css";

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

function getReliabilityBadgeCard(status) {
  switch (status) {
    case "sospechoso": return <span className="status-pill bajo">Sospechoso</span>;
    case "en_revision": return <span className="status-pill medio">En revisión</span>;
    case "descartado":
    case "silenciado": return <span className="status-pill requiere-antecedentes">Silenciado</span>;
    case "reactivado": return <span className="status-pill alto">Reactivado</span>;
    case "normal": default: return <span className="status-pill alto">Normal</span>;
  }
}

const STATUS_LABELS = {
  normal: "Normal",
  en_revision: "En revisión",
  reactivado: "Reactivado",
  silenciado: "Silenciado",
};

export default function AdminReportedLeads({ profile, evaluations = [] }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [currentTab, setCurrentTab] = useState("en_revision"); // "en_revision" | "silenciado"
  const [activeAction, setActiveAction] = useState(null); // { leadId, status }
  const [actionReason, setActionReason] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLeadsInReview()
      .then((data) => {
        if (active) setLeads(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleResolve = async (leadId, status, reason) => {
    setResolving(true);
    try {
      await resolveLeadStatus(leadId, profile?.id, status, reason);
      
      setLeads((current) => 
        current.map((l) => l.id === leadId ? { ...l, reliability_status: status } : l)
      );

      setActiveAction(null);
      setActionReason("");
      alert(`Lead actualizado a estado: ${status}`);
    } catch (err) {
      alert("Error al actualizar lead: " + err.message);
    } finally {
      setResolving(false);
    }
  };

  const getEnrichedLead = (lead) => {
    const ev = (evaluations || []).find(
      (e) => (e.user_id && e.user_id === lead.id) || e.id === lead.id
    );
    return {
      ...(ev || {}),
      ...lead,
      user_id: lead.id,
      result: ev?.result || lead.result || {},
      input: ev?.input || lead.input || {},
      onboarding: ev?.onboarding || lead.onboarding || {},
      report_reason: lead.report_reason,
      reported_at: lead.reported_at,
      fraud_score_probability: lead.fraud_score_probability,
      shap_top_factors: lead.shap_top_factors,
      reliability_status: lead.reliability_status || ev?.reliability_status,
    };
  };

  const leadsEnRevision = leads.filter((l) => l.reliability_status === "en_revision" || l.reliability_status === "sospechoso");
  const leadsSilenciados = leads.filter((l) => l.reliability_status === "silenciado" || l.reliability_status === "descartado");
  const visibleLeads = currentTab === "en_revision" ? leadsEnRevision : leadsSilenciados;

  if (loading) {
    return (
      <article className="admin-surface admin-panel-side-card">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Control de leads reportados</h2>
            <p>Cargando casos...</p>
          </div>
        </div>
      </article>
    );
  }

  if (error) {
    return (
      <article className="admin-surface admin-panel-side-card">
        <p className="leads-hint is-error">{error}</p>
      </article>
    );
  }

  return (
    <article className="admin-surface admin-panel-side-card" style={{ gridColumn: "1 / -1" }}>
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <span className="eyebrow">Gestión de confiabilidad</span>
          <h2>Control de leads reportados y silenciados</h2>
          <p>Supervisa leads reportados por ejecutivos comerciales. Haz clic en cualquier tarjeta para abrir la ficha comercial completa, o usa las acciones directas para cambiar su estado.</p>
        </div>
        <span className="executive-leads-inbox__cue">Selecciona un lead para ver su ficha comercial</span>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid var(--rh-border, #e2e8f0)", paddingBottom: "0.5rem" }}>
        <button
          type="button"
          className={`secondary-button compact-button ${currentTab === "en_revision" ? "is-active" : ""}`}
          style={currentTab === "en_revision" ? { fontWeight: "bold", borderColor: "var(--color-primary, #246354)", color: "var(--color-primary, #246354)" } : {}}
          onClick={() => setCurrentTab("en_revision")}
        >
          <i className="ti ti-alert-triangle" /> En revisión ({leadsEnRevision.length})
        </button>
        <button
          type="button"
          className={`secondary-button compact-button ${currentTab === "silenciado" ? "is-active" : ""}`}
          style={currentTab === "silenciado" ? { fontWeight: "bold", borderColor: "var(--color-danger, #d32f2f)", color: "var(--color-danger, #d32f2f)" } : {}}
          onClick={() => setCurrentTab("silenciado")}
        >
          <i className="ti ti-volume-off" /> Silenciados ({leadsSilenciados.length})
        </button>
      </div>

      {!visibleLeads.length ? (
        <div className="admin-compact-empty">
          <strong>{currentTab === "en_revision" ? "No hay leads en revisión en este momento." : "No hay leads silenciados ni sospechosos actualmente."}</strong>
          <p>{currentTab === "en_revision" ? "Los reportes manuales o automáticos aparecerán aquí para resolución." : "Los leads que silencies o descartes aparecerán aquí por si requieres reactivarlos en el futuro."}</p>
        </div>
      ) : (
        <div className="executive-leads-list executive-leads-list--scroll" aria-label="Control de leads reportados y silenciados">
          {visibleLeads.map((lead) => {
            const enrichedLead = getEnrichedLead(lead);
            return (
              <article
                className={`executive-lead-card admin-reported-lead ${activeAction?.leadId === lead.id ? "is-editing" : ""}`}
                key={lead.id}
                role="button"
                tabIndex="0"
                onClick={() => setSelectedLead(enrichedLead)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedLead(enrichedLead);
                  }
                }}
                aria-label={`Ver ficha comercial de ${lead.full_name || lead.email || "lead"}`}
              >
                <div className="executive-lead-card__identity">
                  <div>
                    <h3>{lead.full_name || lead.email || "Lead sin nombre"}</h3>
                    <p>{lead.email || "Sin correo registrado"}</p>
                  </div>
                  <div className="executive-lead-card__status">
                    {getReliabilityBadgeCard(lead.reliability_status || "normal")}
                    {enrichedLead.result?.classification && (
                      <span className={`status-pill ${getClassificationClass(enrichedLead.result.classification)}`}>
                        {enrichedLead.result.classification}
                      </span>
                    )}
                    <small>Registrado: {formatDate(lead.reported_at || lead.created_at)}</small>
                  </div>
                </div>

                <dl className="executive-lead-card__facts">
                  <div>
                    <dt>Contacto</dt>
                    <dd>{lead.phone || "Sin teléfono"}</dd>
                    <dd><small>RUT: {lead.rut || "Sin RUT"}</small></dd>
                  </div>
                  <div>
                    <dt>Comuna</dt>
                    <dd>{enrichedLead.input?.comuna_objetivo || enrichedLead.onboarding?.comuna_interes || "Sin dato"}</dd>
                  </div>
                  {lead.report_reason && (
                    <div className="executive-lead-card__fact--wide">
                      <dt>Motivo del reporte</dt>
                      <dd>{lead.report_reason}</dd>
                    </div>
                  )}
                  {lead.fraud_score_probability >= 80 && (
                    <div className="executive-lead-card__fact--wide admin-reported-lead__alert">
                      <dt style={{ color: "#d32f2f", margin: 0 }}>
                        <i className="ti ti-robot" /> Alerta de Inconsistencia (Riesgo {lead.fraud_score_probability}%)
                      </dt>
                      <dd style={{ color: "#c62828", fontSize: "0.82rem", marginTop: "2px" }}>
                        {Array.isArray(lead.shap_top_factors)
                          ? lead.shap_top_factors.join(", ")
                          : lead.shap_top_factors && typeof lead.shap_top_factors === "object"
                            ? Object.entries(lead.shap_top_factors).map(([k, v]) => `${k} (${v})`).join(", ")
                            : "Riesgo alto detectado por motor de integridad"}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="executive-lead-card__actions" onClick={(e) => e.stopPropagation()}>
                  {activeAction?.leadId === lead.id ? (
                    <div className="admin-reported-lead__edit">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "var(--rh-navy, #1e293b)" }}>
                        <span>Cambiar a: <strong>{STATUS_LABELS[activeAction.status] || activeAction.status}</strong></span>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--rh-text-muted, #64748b)", cursor: "pointer", fontSize: "0.8rem", textDecoration: "underline" }}
                          onClick={() => setActiveAction(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                      <textarea 
                        placeholder={`Motivo para cambiar a ${STATUS_LABELS[activeAction.status] || activeAction.status} (obligatorio)...`} 
                        className="admin-textarea"
                        value={actionReason} 
                        onChange={e => setActionReason(e.target.value)}
                        rows={2}
                        style={{ width: "100%", borderRadius: "6px", border: "1px solid rgba(19,43,74,0.2)", padding: "6px 8px", fontSize: "0.85rem", resize: "vertical" }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: "flex-end" }}>
                        <button type="button" className="secondary-button compact-button" onClick={() => setActiveAction(null)}>Cancelar</button>
                        <button
                          type="button"
                          className="primary-button compact-button"
                          disabled={resolving || !actionReason.trim()}
                          onClick={() => handleResolve(lead.id, activeAction.status, actionReason)}
                        >
                          Confirmar cambio
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-reported-lead__controls">
                      <select
                        value=""
                        onChange={(e) => {
                          const nextStatus = e.target.value;
                          if (nextStatus) {
                            setActiveAction({ leadId: lead.id, status: nextStatus });
                            setActionReason("");
                          }
                        }}
                        disabled={resolving}
                        style={{
                          minHeight: "34px",
                          padding: "0 10px",
                          border: "1px solid rgba(19,43,74,0.2)",
                          borderRadius: "6px",
                          backgroundColor: "var(--rh-surface, #ffffff)",
                          color: "var(--rh-navy, #1e293b)",
                          fontSize: "0.84rem",
                          fontWeight: "500",
                          cursor: "pointer",
                        }}
                        aria-label={`Cambiar confiabilidad de ${lead.full_name || lead.email || "lead"}`}
                      >
                        <option value="">Cambiar estado...</option>
                        <option value="normal" disabled={lead.reliability_status === "normal"}>Normal</option>
                        <option value="en_revision" disabled={lead.reliability_status === "en_revision"}>En revisión</option>
                        <option value="reactivado" disabled={lead.reliability_status === "reactivado"}>Reactivar</option>
                        <option value="silenciado" disabled={lead.reliability_status === "silenciado"}>Silenciar</option>
                      </select>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => setSelectedLead(enrichedLead)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "600" }}
                      >
                        Ver ficha <i className="ti ti-chevron-right" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          evaluations={evaluations}
          role={profile?.role || "admin"}
          profile={profile}
          onLeadUpdated={(updatedLead) => {
            setLeads((current) =>
              current.map((l) =>
                l.id === updatedLead.id || l.id === updatedLead.user_id
                  ? { ...l, reliability_status: updatedLead.reliability_status }
                  : l
              )
            );
            setSelectedLead((prev) => (prev ? { ...prev, ...updatedLead } : null));
          }}
        />
      )}
    </article>
  );
}
