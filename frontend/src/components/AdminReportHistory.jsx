import React, { useEffect, useMemo, useState } from "react";
import { getLeadStatusHistoryForAdmin } from "../services/leadManagementService";

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function getStatusBadge(status) {
  switch (status) {
    case "sospechoso":
      return <span className="status-pill bajo">Sospechoso</span>;
    case "en_revision":
      return <span className="status-pill medio">En revisión</span>;
    case "descartado":
    case "silenciado":
      return <span className="status-pill requiere-antecedentes">Silenciado</span>;
    case "reactivado":
    case "normal":
      return <span className="status-pill alto">Activo / Confiable</span>;
    default:
      return <span className="status-pill">{status || "Sin estado"}</span>;
  }
}

export default function AdminReportHistory({ profile }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const isGlobalAdmin = profile?.role === "admin" && !profile?.inmobiliaria_id;

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        setLoading(true);
        const data = await getLeadStatusHistoryForAdmin();
        if (active) setHistory(data || []);
      } catch (err) {
        if (active) setError(err.message || "Error al cargar el historial de reportes");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadHistory();
    return () => {
      active = false;
    };
  }, []);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchSearch =
        !searchTerm ||
        (item.lead_name && item.lead_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.lead_email && item.lead_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.reason && item.reason.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === "todos" ||
        item.new_status === statusFilter ||
        (statusFilter === "silenciado" && (item.new_status === "silenciado" || item.new_status === "descartado"));

      return matchSearch && matchStatus;
    });
  }, [history, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: history.length,
      enRevision: history.filter((h) => h.new_status === "en_revision").length,
      silenciados: history.filter((h) => h.new_status === "silenciado" || h.new_status === "descartado").length,
      reactivados: history.filter((h) => h.new_status === "reactivado" || h.new_status === "normal").length,
    };
  }, [history]);

  return (
    <section className="section-block">
      <div className="section-heading">
        <span className="eyebrow">Auditoría y Trazabilidad</span>
        <h1>Historial de reportes y cambios</h1>
        <p>
          Registro inmutable de cambios de estado, observaciones y reportes realizados sobre los leads.
        </p>
      </div>

      <section className="admin-catalog-topbar admin-section-gap">
        <div className="admin-catalog-topbar__intro">
          <span className="admin-tag">{isGlobalAdmin ? "Mesa global" : "Mesa inmobiliaria"}</span>
          <h2>Trazabilidad de leads</h2>
          <p>
            {isGlobalAdmin
              ? "Visualizando todos los cambios de confiabilidad en la plataforma."
              : "Visualizando cambios asociados a proyectos o reportes de tu inmobiliaria."}
          </p>
        </div>
      </section>

      <section className="admin-catalog-metric-strip admin-section-gap" aria-label="Resumen de historial">
        <article className="admin-panel-metric">
          <span>Total de eventos</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Reportados a revisión</span>
          <strong>{stats.enRevision}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Silenciados</span>
          <strong>{stats.silenciados}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Reactivados</span>
          <strong>{stats.reactivados}</strong>
        </article>
      </section>

      <article className="admin-surface admin-panel-side-card" style={{ gridColumn: "1 / -1" }}>
        <div className="admin-surface__header" style={{ marginBottom: "1rem" }}>
          <div className="admin-surface__title">
            <h2>Bitácora de auditoría</h2>
            <p>Monitorea quién modificó la confiabilidad de cada lead y el motivo especificado.</p>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <input
            type="text"
            className="search-input"
            style={{ flex: "1 1 240px", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #cbd5e1)" }}
            placeholder="Buscar por nombre, correo o motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select"
            style={{ padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #cbd5e1)" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="en_revision">En revisión</option>
            <option value="silenciado">Silenciados</option>
            <option value="reactivado">Reactivados / Normal</option>
          </select>
        </div>

        {loading ? (
          <div className="admin-compact-empty">
            <p>Cargando bitácora de auditoría...</p>
          </div>
        ) : error ? (
          <div className="error-message">
            <span>{error}</span>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="admin-compact-empty">
            <strong>No se encontraron registros de auditoría.</strong>
            <p>Cuando los ejecutivos o administradores reporten o actualicen leads, quedarán registrados aquí.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="leads-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border, #e2e8f0)" }}>
                  <th style={{ padding: "0.75rem" }}>Fecha</th>
                  <th style={{ padding: "0.75rem" }}>Lead</th>
                  <th style={{ padding: "0.75rem" }}>Estado previo</th>
                  <th style={{ padding: "0.75rem" }}>Nuevo estado</th>
                  <th style={{ padding: "0.75rem" }}>Registrado por</th>
                  <th style={{ padding: "0.75rem" }}>Motivo / Observación</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.history_id} style={{ borderBottom: "1px solid var(--color-border, #f1f5f9)" }}>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                      {formatDate(item.created_at)}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <div style={{ fontWeight: "600" }}>{item.lead_name || "Sin nombre"}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>{item.lead_email}</div>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {getStatusBadge(item.old_status)}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {getStatusBadge(item.new_status)}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <div style={{ fontWeight: "500" }}>{item.changed_by_name || "Sistema"}</div>
                      {item.changed_by_email && (
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>
                          {item.changed_by_email}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.9rem", maxWidth: "300px" }}>
                      {item.reason || <span style={{ color: "var(--color-text-muted, #94a3b8)" }}>Sin motivo especificado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
