import React, { useEffect, useMemo, useState } from "react";
import { getScoringHistoryByEvaluation } from "../services/getScoringHistory";
import { getAvailableProjects } from "../services/projectService";
import { comunasDeclaradas, matchLeadToProjects } from "../lib/matching/leadProjectMatching";
import { rankLeadsForProject } from "../lib/matching/leadRanking";
import { displayItemBenefit, displayItemText } from "../utils/text";
import { formatScore, getClassificationClass } from "../utils/helpers";

const DATE_RANGES = [
  { label: "Cualquier fecha", value: "todos" },
  { label: "Últimas 24 horas", value: "24h" },
  { label: "Última semana", value: "semana" },
  { label: "Último mes", value: "mes" },
];
const AGE_RANGES = [
  { label: "Todas las edades", min: 0, max: Infinity },
  { label: "18 - 25 años", min: 18, max: 25 },
  { label: "25 - 35 años", min: 25, max: 35 },
  { label: "35 - 45 años", min: 35, max: 45 },
  { label: "45 - 55 años", min: 45, max: 55 },
  { label: "55+ años", min: 55, max: Infinity },
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

function threshold(range) {
  const hours = { "24h": 24, semana: 24 * 7, mes: 24 * 30 }[range];
  return hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : null;
}

function DetailRow({ label, children }) {
  return <div className="admin-definition-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function DashboardLeads({ evaluations, inmobiliariaId, ejecutivo }) {
  const [classification, setClassification] = useState("Alto");
  const [commune, setCommune] = useState("todas");
  const [age, setAge] = useState(0);
  const [date, setDate] = useState("todos");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [sortBy, setSortBy] = useState("afinidad");
  const [showExcluded, setShowExcluded] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [history, setHistory] = useState([]);

  const executiveId = ejecutivo?.id ?? null;
  const executiveEmail = ejecutivo?.email ?? null;
  const executiveScope = useMemo(
    () => executiveId || executiveEmail ? { id: executiveId, email: executiveEmail } : null,
    [executiveId, executiveEmail],
  );

  useEffect(() => {
    let active = true;
    setProjectsLoaded(false);
    setProjectsError("");
    getAvailableProjects({ inmobiliariaId, ejecutivo: executiveScope })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjectsError("No se pudo cargar el catálogo de proyectos."); })
      .finally(() => { if (active) setProjectsLoaded(true); });
    return () => { active = false; };
  }, [inmobiliariaId, executiveScope]);

  useEffect(() => {
    if (!selectedLead) { setHistory([]); return; }
    let active = true;
    getScoringHistoryByEvaluation(selectedLead.id)
      .then((items) => { if (active) setHistory(items); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [selectedLead]);

  const communes = useMemo(() => [...new Set(evaluations.flatMap((item) => [
    item.input?.comuna_objetivo || item.onboarding?.comuna_interes,
    item.onboarding?.comuna_alternativa,
  ]).filter(Boolean))].sort(), [evaluations]);
  const counts = useMemo(() => evaluations.reduce((result, item) => {
    if (item.result?.classification in result) result[item.result.classification] += 1;
    return result;
  }, { Alto: 0, Medio: 0, Bajo: 0 }), [evaluations]);
  const selectedProject = useMemo(
    () => projects.find((item) => String(item.id) === projectId) || null,
    [projects, projectId],
  );
  const defaultClassification = selectedProject ? "todos" : "Alto";
  const filtered = useMemo(() => {
    const dateThreshold = threshold(date);
    const ageRange = AGE_RANGES[age];
    const term = search.trim().toLowerCase();
    return evaluations.filter((item) => {
      const mainCommune = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      if (classification !== "todos" && item.result?.classification !== classification) return false;
      if (commune !== "todas" && mainCommune !== commune && item.onboarding?.comuna_alternativa !== commune) return false;
      if (item.input?.edad != null && (item.input.edad < ageRange.min || item.input.edad >= ageRange.max)) return false;
      if (ageRange.min && item.input?.edad == null) return false;
      if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;
      return !term || `${item.full_name || ""} ${item.email || ""}`.toLowerCase().includes(term);
    });
  }, [evaluations, classification, commune, age, date, search]);
  const { ranked, descartados, requiereAntecedentes } = useMemo(
    () => rankLeadsForProject(filtered, selectedProject, sortBy),
    [filtered, selectedProject, sortBy],
  );
  const selectedMatch = useMemo(() => {
    if (!selectedLead || !selectedProject) return null;
    const { matches, excluidos } = matchLeadToProjects(selectedLead, [selectedProject]);
    return matches[0] || excluidos[0] || null;
  }, [selectedLead, selectedProject]);
  const activeFilters = classification !== defaultClassification || commune !== "todas" || age || date !== "todos" || search;
  const clearFilters = () => { setClassification(defaultClassification); setCommune("todas"); setAge(0); setDate("todos"); setSearch(""); };
  const selectProject = (nextId) => { setProjectId(nextId); setClassification(nextId ? "todos" : "Alto"); };

  const row = ({ lead, match }) => (
    <tr key={lead.id} className="lead-row" onClick={() => setSelectedLead(lead)}>
      {!selectedProject && <td>{formatDate(lead.created_at)}</td>}
      <td><button type="button" className="lead-row-open" onClick={(event) => { event.stopPropagation(); setSelectedLead(lead); }}>{lead.full_name || lead.email || "Sin nombre"}</button></td>
      <td>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Sin dato"}</td>
      <td><span className={`status-pill ${getClassificationClass(lead.result?.classification)}`}>{lead.result?.classification || "Sin dato"}</span></td>
      {selectedProject ? <>
        <td>{match?.afinidad ?? "-"}<small className="lead-cell-sub">{match?.clasificacion || ""}</small></td>
        <td>{match?.evidencia?.capacidad_uf ?? "Sin dato"} UF<small className="lead-cell-sub">{match?.evidencia?.plazo_anios ? `${match.evidencia.plazo_anios} años` : ""}</small></td>
        <td>{match?.evidencia?.pie_disponible_uf ?? "Sin dato"} UF</td>
        <td>{match?.bloqueador_principal?.titulo || "Sin bloqueador"}</td>
      </> : <td>{lead.result?.risks?.slice(0, 2).map(displayItemText).join(" ") || "Sin riesgos relevantes"}</td>}
    </tr>
  );
  const head = <thead><tr>{!selectedProject && <th>Fecha</th>}<th>Lead</th><th>Comuna</th><th>Clasificación</th>{selectedProject ? <><th>Afinidad</th><th>Capacidad</th><th>Pie</th><th>Bloqueador</th></> : <th>Riesgos</th>}</tr></thead>;
  const columnCount = selectedProject ? 8 : 5;

  return <section className="section-block leads-panel">
    <div className="section-heading"><span className="eyebrow">Gestión comercial</span><h1>Leads</h1></div>
    <div className="admin-leads-metric-strip admin-section-gap"><div className="admin-leads-metric"><span>Total</span><strong>{evaluations.length}</strong></div><div className="admin-leads-metric admin-leads-metric--high"><span>Alta</span><strong>{counts.Alto}</strong></div><div className="admin-leads-metric admin-leads-metric--medium"><span>Media</span><strong>{counts.Medio}</strong></div><div className="admin-leads-metric admin-leads-metric--low"><span>Baja</span><strong>{counts.Bajo}</strong></div></div>
    {projectsError && <p className="leads-hint is-error">{projectsError}</p>}
    {!projectsError && executiveScope && projectsLoaded && !projects.length && <p className="leads-hint">Todavía no tienes proyectos asignados para priorizar leads.</p>}
    <section className="admin-surface admin-section-gap"><div className="admin-surface__header"><div className="admin-surface__title"><h2>Filtros de búsqueda</h2></div>{activeFilters && <button type="button" className="secondary-button compact-button" onClick={clearFilters}>Limpiar filtros</button>}</div>
      <div className="toolbar-filters admin-toolbar-filters">
        <label>Buscar por nombre o correo<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Proyecto<select value={projectId} onChange={(event) => selectProject(event.target.value)} disabled={Boolean(executiveScope) && projectsLoaded && !projects.length}><option value="">Sin proyecto: vista general</option>{projects.map((project) => <option key={project.id} value={String(project.id)}>{project.nombre} · {project.comuna} · {project.precio_min_uf}-{project.precio_max_uf} UF</option>)}</select></label>
        {selectedProject && <label>Ordenar por<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="afinidad">Afinidad</option><option value="capacidad">Capacidad</option></select></label>}
        <label>Clasificación<select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="todos">Todos</option>{["Alto", "Medio", "Bajo"].map((item) => <option key={item} value={item}>{item} ({counts[item]})</option>)}</select></label>
        <label>Comuna<select value={commune} onChange={(event) => setCommune(event.target.value)}><option value="todas">Todas</option>{communes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Edad<select value={age} onChange={(event) => setAge(Number(event.target.value))}>{AGE_RANGES.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
        <label>Fecha<select value={date} onChange={(event) => setDate(event.target.value)}>{DATE_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
    </section>
    <section className="admin-surface"><div className="admin-surface__header"><div className="admin-surface__title"><h2>Bandeja de leads</h2><p>{selectedProject ? `${ranked.length} de ${filtered.length} alcanzan ${selectedProject.nombre}` : `${ranked.length} resultado${ranked.length === 1 ? "" : "s"}`}</p></div></div><div className="table-wrap admin-leads-scroll"><table>{head}<tbody>{ranked.map(row)}{!ranked.length && <tr><td colSpan={columnCount}>No hay leads para los filtros seleccionados.</td></tr>}</tbody></table></div></section>
    {selectedProject && requiereAntecedentes.length > 0 && <section className="leads-group"><h3>Requieren antecedentes ({requiereAntecedentes.length})</h3><p className="leads-hint">Necesitan una evaluación vigente para calcular su capacidad.</p><div className="table-wrap"><table>{head}<tbody>{requiereAntecedentes.map(row)}</tbody></table></div></section>}
    {selectedProject && descartados.length > 0 && <section className="leads-group"><button type="button" className="secondary-button compact-button" onClick={() => setShowExcluded((current) => !current)}>{showExcluded ? "Ocultar descartados" : `Ver descartados (${descartados.length})`}</button>{showExcluded && <div className="table-wrap"><table>{head}<tbody>{descartados.map(({ lead, match }) => <React.Fragment key={lead.id}>{row({ lead, match })}<tr><td colSpan={columnCount} className="lead-descartado-motivo">Motivo: {match.motivo_exclusion}</td></tr></React.Fragment>)}</tbody></table></div>}</section>}
    {selectedLead && <div className="admin-modal" onClick={() => setSelectedLead(null)}><div className="admin-modal-card admin-modal-card--xl" onClick={(event) => event.stopPropagation()}><div className="admin-modal-header"><div className="admin-modal-heading"><span className="eyebrow">Lead seleccionado</span><h2>{selectedLead.full_name || selectedLead.email}</h2></div><button type="button" className="secondary-button compact-button" onClick={() => setSelectedLead(null)}>Cerrar</button></div>
      <div className="lead-score-highlight"><div className={getClassificationClass(selectedLead.result?.classification)}><span>Score</span><strong>{formatScore(selectedLead.result?.score) ?? "-"}</strong></div><div className={getClassificationClass(selectedLead.result?.classification)}><span>Clasificación</span><strong>{selectedLead.result?.classification || "-"}</strong></div></div>
      {selectedProject && selectedMatch && !selectedMatch.motivo_exclusion && <section className="lead-profile-zone lead-profile-verdict"><h3>Frente a este proyecto: {selectedProject.nombre}</h3><dl className="lead-profile-facts"><div><dt>Afinidad</dt><dd>{selectedMatch.afinidad}<small>{selectedMatch.clasificacion}</small></dd></div><div><dt>Capacidad</dt><dd>{selectedMatch.evidencia.capacidad_uf} UF<small>{selectedMatch.evidencia.plazo_anios} años</small></dd></div><div><dt>Pie disponible</dt><dd>{selectedMatch.evidencia.pie_disponible_uf} UF</dd></div></dl><p className="lead-profile-blocker"><strong>Bloqueador: </strong>{selectedMatch.bloqueador_principal?.titulo || "Ninguno"}</p>{selectedMatch.reorientable && <p className="lead-profile-note">Oportunidad reorientable para este proyecto.</p>}</section>}
      <div className="admin-detail-grid"><div className="admin-stack"><article className="admin-panel-card"><h3>Información del cliente</h3><dl className="admin-definition-list"><DetailRow label="Correo">{selectedLead.email || "Sin dato"}</DetailRow><DetailRow label="Teléfono">{selectedLead.phone || selectedLead.profile?.phone || "Sin dato"}</DetailRow><DetailRow label="Comuna">{selectedLead.input?.comuna_objetivo || selectedLead.onboarding?.comuna_interes || "Sin dato"}</DetailRow><DetailRow label="Fecha">{formatDate(selectedLead.created_at)}</DetailRow></dl></article><article className="admin-panel-card"><h3>Riesgos detectados</h3><ul className="admin-bullet-list">{(selectedLead.result?.risks || []).map((item, index) => <li key={index}>{displayItemText(item)}</li>)}</ul></article></div><div className="admin-stack"><article className="admin-panel-card"><h3>Recomendaciones</h3><ul className="admin-bullet-list">{(selectedLead.result?.recommendations || []).map((item, index) => <li key={index}>{displayItemText(item)}{displayItemBenefit(item) && <small className="lead-cell-sub">Beneficio esperado: {displayItemBenefit(item)}</small>}</li>)}</ul></article><article className="admin-panel-card admin-panel-card--soft"><h3>Historial inmutable</h3>{history.length ? <ul className="admin-bullet-list">{history.map((item) => <li key={item.id}>{formatDate(item.created_at)} · Score {formatScore(item.adjusted_score ?? item.score) ?? "-"}</li>)}</ul> : <p>Sin registros de auditoría.</p>}</article></div></div>
    </div></div>}
  </section>;
}
