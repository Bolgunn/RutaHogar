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
    if (!window.confirm(`¿Estás seguro de que deseas marcar este lead como ${status}?`)) return;
    setResolving(true);
    try {
      await resolveLeadStatus(leadId, profile?.id, status, reason);
      setLeads((current) => current.filter((l) => l.id !== leadId));
      alert(`Lead actualizado a estado: ${status}`);
    } catch (err) {
      alert("Error al actualizar lead: " + err.message);
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <article className="admin-surface admin-panel-side-card">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Leads sospechosos en revisión</h2>
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
          <h2>Leads sospechosos en revisión</h2>
          <p>Leads reportados por ejecutivos comerciales por posibles inconsistencias. Puedes reactivarlos o descartarlos.</p>
        </div>
        <span className="admin-tag admin-tag--warning">{leads.length} casos</span>
      </div>

      {!leads.length ? (
        <div className="admin-compact-empty">
          <strong>No hay leads en revisión en este momento.</strong>
          <p>Los reportes de ejecutivos aparecerán aquí para revisión manual.</p>
        </div>
      ) : (
        <div className="admin-list admin-list--dense">
          {leads.map((lead) => (
            <article className="admin-list-item" key={lead.id} style={{ alignItems: "flex-start" }}>
              <div className="admin-list-item__main" style={{ minWidth: "300px" }}>
                <strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong>
                <span>{lead.email} | {lead.phone || "Sin teléfono"} | RUT: {lead.rut || "Sin RUT"}</span>
                {lead.report_reason && (
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--color-surface-mixed)", borderRadius: "4px", fontSize: "0.85rem" }}>
                    <strong>Motivo del reporte:</strong> {lead.report_reason}
                  </div>
                )}
              </div>
              <div className="admin-list-item__meta" style={{ flex: 1, minWidth: "150px" }}>
                <span>Reportado: {formatDate(lead.reported_at || lead.created_at)}</span>
              </div>
              <div className="admin-action-grid" style={{ width: "auto" }}>
                <button 
                  type="button" 
                  className="secondary-button compact-button" 
                  style={{ color: "var(--color-success)" }}
                  onClick={() => handleResolve(lead.id, "reactivado", "Lead revisado y marcado como válido")}
                  disabled={resolving}
                >
                  <i className="ti ti-check" /> Reactivar
                </button>
                <button 
                  type="button" 
                  className="secondary-button compact-button" 
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => handleResolve(lead.id, "descartado", "Lead descartado por inconsistencias graves (Borrado Lógico)")}
                  disabled={resolving}
                >
                  <i className="ti ti-trash" /> Descartar (Soft delete)
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
