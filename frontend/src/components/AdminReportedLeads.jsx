import React, { useEffect, useState } from "react";
import { getLeadsInReview, resolveLeadStatus } from "../services/leadManagementService";

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

export default function AdminReportedLeads({ profile }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [currentTab, setCurrentTab] = useState("en_revision"); // "en_revision" | "silenciado"
  const [activeAction, setActiveAction] = useState(null); // { leadId, status }
  const [actionReason, setActionReason] = useState("");

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
          <h2>Control de leads reportados y silenciados</h2>
          <p>Supervisa leads reportados por ejecutivos comerciales. Puedes reactivarlos para permitir su contacto o silenciarlos para retirarlos de su perfil comercial.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid var(--color-border, #e2e8f0)", paddingBottom: "0.5rem" }}>
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
          <p>{currentTab === "en_revision" ? "Los reportes manuales o automáticos (ML) aparecerán aquí para resolución." : "Los leads que silencies o marques como descartados aparecerán aquí por si requieres reactivarlos en el futuro."}</p>
        </div>
      ) : (
        <div className="admin-list admin-list--dense">
          {visibleLeads.map((lead) => (
            <article className="admin-list-item" key={lead.id} style={{ alignItems: "flex-start" }}>
              <div className="admin-list-item__main" style={{ minWidth: "300px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong>
                  {lead.reliability_status === "silenciado" ? (
                    <span className="admin-tag admin-tag--danger" style={{ fontSize: "0.75rem" }}>Silenciado</span>
                  ) : (
                    <span className="admin-tag admin-tag--warning" style={{ fontSize: "0.75rem" }}>En revisión</span>
                  )}
                </div>
                <span>{lead.email} | {lead.phone || "Sin teléfono"} | RUT: {lead.rut || "Sin RUT"}</span>
                {lead.report_reason && (
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--color-surface-mixed)", borderRadius: "4px", fontSize: "0.85rem" }}>
                    <strong>Motivo manual:</strong> {lead.report_reason}
                  </div>
                )}
                {lead.fraud_score_probability >= 80 && (
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#fdeded", border: "1px solid #ef5350", borderRadius: "4px", fontSize: "0.85rem", color: "#d32f2f" }}>
                    <strong><i className="ti ti-robot" /> Alerta de Inconsistencia (Automática):</strong> Riesgo detectado del {lead.fraud_score_probability}%
                    {lead.shap_top_factors && (
                      <ul style={{ margin: "0.25rem 0 0 1.5rem", padding: 0 }}>
                        {Array.isArray(lead.shap_top_factors)
                          ? lead.shap_top_factors.map((factor, idx) => (
                              <li key={idx}>{typeof factor === "string" ? factor : JSON.stringify(factor)}</li>
                            ))
                          : Object.entries(lead.shap_top_factors).map(([key, value]) => (
                              <li key={key}>
                                {key}: {Number.isFinite(Number(value)) ? `impacto de ${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}` : String(value)}
                              </li>
                            ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="admin-list-item__meta" style={{ flex: 1, minWidth: "150px" }}>
                <span>Registrado: {formatDate(lead.reported_at || lead.created_at)}</span>
              </div>
              <div className="admin-action-grid" style={{ width: "auto" }}>
                {activeAction?.leadId === lead.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '250px' }}>
                    <textarea 
                      placeholder={`Motivo para cambiar a ${activeAction.status} (obligatorio)...`} 
                      className="admin-textarea"
                      value={actionReason} 
                      onChange={e => setActionReason(e.target.value)}
                      rows={2}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="secondary-button compact-button" onClick={() => setActiveAction(null)}>Cancelar</button>
                      <button type="button" className="primary-button compact-button" disabled={resolving || !actionReason.trim()} onClick={() => handleResolve(lead.id, activeAction.status, actionReason)}>Confirmar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', maxWidth: '250px' }}>
                    <button 
                      type="button" 
                      className="secondary-button compact-button" 
                      style={{ color: "var(--color-text-main, #333)" }}
                      onClick={() => { setActiveAction({ leadId: lead.id, status: 'normal' }); setActionReason(''); }}
                      disabled={resolving}
                    >
                      <i className="ti ti-user-check" /> Normal
                    </button>
                    <button 
                      type="button" 
                      className="secondary-button compact-button" 
                      style={{ color: "var(--color-warning, #ed6c02)" }}
                      onClick={() => { setActiveAction({ leadId: lead.id, status: 'en_revision' }); setActionReason(''); }}
                      disabled={resolving}
                    >
                      <i className="ti ti-alert-triangle" /> En revisión
                    </button>
                    <button 
                      type="button" 
                      className="secondary-button compact-button" 
                      style={{ color: "var(--color-success, #2e7d32)" }}
                      onClick={() => { setActiveAction({ leadId: lead.id, status: 'reactivado' }); setActionReason(''); }}
                      disabled={resolving}
                    >
                      <i className="ti ti-check" /> Reactivar
                    </button>
                    <button 
                      type="button" 
                      className="secondary-button compact-button" 
                      style={{ color: "var(--color-danger, #d32f2f)" }}
                      onClick={() => { setActiveAction({ leadId: lead.id, status: 'silenciado' }); setActionReason(''); }}
                      disabled={resolving}
                    >
                      <i className="ti ti-volume-off" /> Silenciar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
