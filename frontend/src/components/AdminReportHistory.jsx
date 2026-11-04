import React, { useEffect, useMemo, useState } from "react";
import { getLeadStatusHistoryForAdmin } from "../services/leadManagementService";
import { paginateRows } from "../lib/adminPagination";
import { filterReportHistory, leadFromReport } from "../lib/reportHistoryView";
import AdminPagination from "./AdminPagination";
import LeadDetailModal from "./LeadDetailModal";
import "./admin-management.css";

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });
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

export default function AdminReportHistory({ profile, evaluations = [] }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selectedLead, setSelectedLead] = useState(null);
  const openLead = (item) => setSelectedLead(leadFromReport(item, history, evaluations));
  const isGlobalAdmin = profile?.role === "admin" && !profile?.inmobiliaria_id;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getLeadStatusHistoryForAdmin().then((data) => { if (active) setHistory(data || []); })
      .catch(() => { if (active) setError("No pudimos cargar el historial de reportes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, profile?.role, profile?.inmobiliaria_id]);
  useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);
  const filtered = useMemo(() => filterReportHistory(history, searchTerm, statusFilter), [history, searchTerm, statusFilter]);
  const pagination = paginateRows(filtered, page, 12);
  const stats = [
    ["Eventos registrados", history.length],
    ["Enviados a revisión", history.filter((item) => item.new_status === "en_revision").length],
    ["Silenciados", history.filter((item) => ["silenciado", "descartado"].includes(item.new_status)).length],
    ["Reactivados / normales", history.filter((item) => ["reactivado", "normal"].includes(item.new_status)).length],
  ];
  const activeFilters = searchTerm.trim() || statusFilter !== "todos";
  return <section className="section-block admin-report-workspace">
    <header className="section-heading"><span className="eyebrow">Auditoría y trazabilidad</span><h1>Historial de reportes y cambios</h1><p>Consulta quién cambió la confiabilidad de un lead, cuándo y por qué.</p><span className="admin-management-scope">{isGlobalAdmin ? "Cobertura global" : "Reportes de tu inmobiliaria"}</span></header>
    <dl className="admin-management-metrics" aria-label="Resumen de historial">{stats.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{loading || error ? "—" : count}</dd></div>)}</dl>
    <article className="admin-surface admin-report-log">
      <div className="admin-surface__header"><div className="admin-surface__title"><h2>Bitácora de auditoría</h2><p>Eventos ordenados del más reciente al más antiguo.</p></div>{activeFilters && <button type="button" className="secondary-button" onClick={() => { setSearchTerm(""); setStatusFilter("todos"); }}>Limpiar filtros</button>}</div>
      <div className="admin-management-filters"><label>Buscar<input type="search" placeholder="Nombre, correo o motivo" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label><label>Estado registrado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="todos">Todos los estados</option><option value="sospechoso">Sospechoso</option><option value="en_revision">En revisión</option><option value="silenciado">Silenciados / descartados</option><option value="reactivado">Reactivados / normales</option></select></label></div>
      {loading ? <div className="admin-management-empty" role="status">Cargando bitácora…</div> : error ? <div className="admin-management-empty" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div> : !filtered.length ? <div className="admin-management-empty"><strong>{activeFilters ? "No hay eventos que coincidan" : "Aún no hay eventos registrados"}</strong><p>{activeFilters ? "Prueba otro nombre o estado, o limpia los filtros." : "Los reportes y cambios de confiabilidad aparecerán aquí."}</p></div> : <>
        <div className="admin-management-table-wrap" tabIndex={0} role="region" aria-label="Historial de reportes, desplazamiento vertical"><table className="admin-report-table"><thead><tr><th>Fecha</th><th>Lead</th><th>Cambio de estado</th><th>Responsable</th><th>Motivo</th></tr></thead><tbody>{pagination.rows.map((item) => <tr key={item.history_id} className={item.profile_id ? "admin-report-row is-selectable" : "admin-report-row"} onClick={(event) => { if (!event.target.closest("button, a, details, summary")) openLead(item); }}>
          <td data-label="Fecha"><time>{formatDate(item.created_at)}</time></td>
          <td data-label="Lead"><button type="button" className="admin-report-lead-button" onClick={() => openLead(item)} disabled={!item.profile_id} aria-label={`Abrir ficha de ${item.lead_name || "lead"}`}><span>{item.lead_name || "Sin nombre"}</span><i className="ti ti-arrow-up-right" aria-hidden="true" /></button><small>{item.lead_email || "Sin correo"}</small></td>
          <td data-label="Cambio de estado"><div className="admin-report-transition">{getStatusBadge(item.old_status)}<i className="ti ti-arrow-right" aria-label="a" />{getStatusBadge(item.new_status)}</div></td>
          <td data-label="Responsable"><strong>{item.changed_by_name || "Sistema"}</strong>{item.changed_by_email && <small>{item.changed_by_email}</small>}</td>
          <td data-label="Motivo">{item.reason && item.reason.length > 150 ? <details className="admin-report-reason"><summary>{item.reason.slice(0, 150)}… <span>Leer completo</span></summary><p>{item.reason}</p></details> : item.reason || "Sin motivo especificado"}</td>
        </tr>)}</tbody></table></div><AdminPagination pagination={pagination} onChange={setPage} label="eventos" />
      </>}
    </article>
    {selectedLead && <LeadDetailModal lead={selectedLead} evaluations={evaluations} role={profile?.role || "admin"} profile={profile} onClose={() => setSelectedLead(null)} onLeadUpdated={(updatedLead) => { setSelectedLead((current) => ({ ...current, ...updatedLead })); setRefresh((value) => value + 1); }} />}
  </section>;
}
