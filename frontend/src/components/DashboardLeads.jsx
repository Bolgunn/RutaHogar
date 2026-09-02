import React, { useEffect, useMemo, useState } from "react";
import { getScoringHistoryByEvaluation } from "../services/getScoringHistory";
import { getAvailableProjects } from "../services/projectService";
import { comunasDeclaradas, matchLeadToProjects } from "../lib/matching/leadProjectMatching";
import { rankLeadsForProject } from "../lib/matching/leadRanking";
import { displayItemBenefit, displayItemText } from "../utils/text";
import {
  formatScore,
  getClassificationAdjustment,
  getClassificationClass,
  translateSeverity,
} from "../utils/helpers";

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

const CLP_FORMATTER = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function hasObjectData(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function money(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? CLP_FORMATTER.format(Math.round(numericValue)) : "Sin dato";
}

function booleanText(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "Sin dato";
}

function formatPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue * 1000) / 10}%` : "Sin dato";
}

function purchaseTermLabel(value) {
  const labels = {
    inmediato: "Inmediato",
    "0_3_meses": "0 a 3 meses",
    "3_a_6_meses": "3 a 6 meses",
    "3_6_meses": "3 a 6 meses",
    "6_a_12_meses": "6 a 12 meses",
    "6_12_meses": "6 a 12 meses",
    mas_12_meses: "Más de 12 meses",
    solo_explorando: "Solo explorando",
  };
  return labels[value] || "Sin dato";
}

const eventLabels = {
  no_viable_shown: "Plan no viable presentado",
  apply_alternative: "Aplicó alternativa",
  simulate_success: "Simulación viable",
  accept_plan: "Aceptó el plan",
  register_savings: "Registró ahorro",
};

function formatEventAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL");
}

function renderEventDetail(event) {
  const details = event.details || {};
  if (event.type === "apply_alternative") return details.title || details.alternative_id || "Alternativa aplicada";
  if (event.type === "simulate_success") return details.months ? `Escenario viable en ${details.months} meses` : "Escenario viable";
  if (event.type === "accept_plan") return details.months ? `Meta aceptada a ${details.months} meses` : "Meta aceptada";
  if (event.type === "register_savings") return `${details.progress_percent ?? 0}% de avance registrado`;
  return details.message || "Sin detalle adicional";
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
  const selectedResult = selectedLead?.result || {};
  const selectedInput = selectedLead?.input || {};
  const selectedOnboarding = selectedLead?.onboarding || {};
  const selectedPhone = selectedLead?.phone || selectedLead?.profile?.phone || "";
  const selectedFinalScore = selectedResult.adjusted_score ?? selectedResult.score;
  const selectedAdjustment = getClassificationAdjustment(selectedResult);
  const selectedMainBlocker = hasObjectData(selectedResult.main_blocker) ? selectedResult.main_blocker : null;
  const selectedProjectFit = hasObjectData(selectedResult.project_fit) ? selectedResult.project_fit : null;
  const selectedPriority = hasObjectData(selectedResult.commercial_priority_detail) ? selectedResult.commercial_priority_detail : null;
  const selectedFinancialIndicators = hasObjectData(selectedResult.financial_indicators) ? selectedResult.financial_indicators : {};
  const selectedCommunes = selectedLead ? comunasDeclaradas(selectedLead).declaradas : [];
  const selectedName = selectedLead?.full_name?.split(" ")[0] || "cliente";
  const selectedEmailHref = selectedLead
    ? `mailto:${selectedLead.email || ""}?subject=${encodeURIComponent("Contacto RutaHogar - Evaluación financiera")}&body=${encodeURIComponent(`Hola ${selectedName},\n\nTe escribo a partir de tu evaluación en RutaHogar.\n\nSaludos.`)}`
    : "#";
  const selectedWhatsappHref = selectedPhone
    ? `https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hola ${selectedName}. Te escribo por RutaHogar.`)}`
    : "";

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

  useEffect(() => {
    setSelectedLead((current) => {
      if (!current) return current;
      return evaluations.find((item) => item.id === current.id) || current;
    });
  }, [evaluations]);

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

  const leadCard = ({ lead, match }) => (
    <article
      key={lead.id}
      className="executive-lead-card"
      role="button"
      tabIndex="0"
      onClick={() => setSelectedLead(lead)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedLead(lead);
        }
      }}
      aria-label={`Ver ficha de ${lead.full_name || lead.email || "lead"}`}
    >
      <div className="executive-lead-card__identity">
        <div>
          <h3>{lead.full_name || lead.email || "Sin nombre"}</h3>
          <p>{lead.email || "Sin correo registrado"}</p>
        </div>
        <div className="executive-lead-card__status">
          <span className={`status-pill ${getClassificationClass(lead.result?.classification)}`}>{lead.result?.classification || "Sin dato"}</span>
          {!selectedProject && <small>{formatDate(lead.created_at)}</small>}
        </div>
      </div>
      <dl className="executive-lead-card__facts">
        <div><dt>Comuna</dt><dd>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Sin dato"}</dd></div>
        {selectedProject ? <>
          <div><dt>Afinidad</dt><dd>{match?.afinidad ?? "-"}<small>{match?.clasificacion || "Sin dato"}</small></dd></div>
          <div><dt>Capacidad</dt><dd>{match?.evidencia?.capacidad_uf ?? "Sin dato"} UF<small>{match?.evidencia?.plazo_anios ? `${match.evidencia.plazo_anios} años` : "Sin dato"}</small></dd></div>
          <div><dt>Pie disponible</dt><dd>{match?.evidencia?.pie_disponible_uf ?? "Sin dato"} UF</dd></div>
          <div className="executive-lead-card__fact--wide"><dt>Bloqueador</dt><dd>{match?.bloqueador_principal?.titulo || "Sin bloqueador"}</dd></div>
        </> : <div className="executive-lead-card__fact--wide"><dt>Riesgos registrados</dt><dd>{lead.result?.risks?.slice(0, 2).map(displayItemText).join(" ") || "Sin riesgos relevantes"}</dd></div>}
      </dl>
      <span className="executive-lead-card__action">Ver ficha</span>
    </article>
  );

  return <section className="section-block leads-panel admin-leads-page">
    <header className="executive-leads-heading">
      <div className="section-heading">
        <span className="eyebrow">Gestión comercial</span>
        <h1>Mesa de oportunidades</h1>
        <p>Prioriza conversaciones con contexto financiero y habitacional.</p>
      </div>
      <div className="executive-leads-heading__note">
        <span>Vista de trabajo</span>
        <strong>{selectedProject ? "Con proyecto seleccionado" : "Prioridad general"}</strong>
      </div>
    </header>

    {projectsError && <p className="leads-hint is-error">{projectsError}</p>}
    {!projectsError && executiveScope && projectsLoaded && !projects.length && <p className="leads-hint">Todavía no tienes proyectos asignados para priorizar leads.</p>}

    <section className="admin-surface admin-section-gap executive-leads-controls">
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <h2>Encuentra la conversación adecuada</h2>
          <p>Combina una prioridad, territorio o perfil para enfocar la bandeja.</p>
        </div>
        {activeFilters && <button type="button" className="secondary-button compact-button" onClick={clearFilters}>Restablecer vista</button>}
        </div>
        <div className="executive-leads-controls__guide">
          <span>Cómo usar esta bandeja</span>
          <p>Selecciona primero un proyecto. Luego elige si quieres ver antes el mejor encaje o la mayor capacidad de compra; usa los filtros restantes solo para acotar la lista.</p>
        </div>
        <div className="executive-leads-controls__primary">
          <label className="executive-leads-controls__project">Proyecto<select value={projectId} onChange={(event) => selectProject(event.target.value)} disabled={Boolean(executiveScope) && projectsLoaded && !projects.length}><option value="">Sin proyecto: vista general</option>{projects.map((project) => <option key={project.id} value={String(project.id)}>{project.nombre} · {project.comuna} · {project.precio_min_uf}-{project.precio_max_uf} UF</option>)}</select><small>Al elegirlo, calculamos afinidad, capacidad y pie para ese proyecto.</small></label>
          <label className="executive-leads-controls__sort">Orden de la bandeja<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={!selectedProject}><option value="afinidad">Mejor afinidad con el proyecto</option><option value="capacidad">Mayor capacidad de compra</option></select><small>{selectedProject ? "Puedes cambiar el criterio sin perder los filtros aplicados." : "Disponible al seleccionar un proyecto."}</small></label>
        </div>
        <div className="executive-leads-controls__priority">
          <div><span className="eyebrow">Paso 2</span><strong>Prioridad de evaluación</strong><p>Selecciona una tarjeta para mostrar solo esa prioridad.</p></div>
          <div className="admin-leads-metric-strip executive-priority-rail" aria-label="Filtrar leads por prioridad">
            {[
              ["todos", "Total", evaluations.length, ""],
              ["Alto", "Alta prioridad", counts.Alto, "admin-leads-metric--high"],
              ["Medio", "Prioridad media", counts.Medio, "admin-leads-metric--medium"],
              ["Bajo", "Prioridad baja", counts.Bajo, "admin-leads-metric--low"],
            ].map(([value, label, count, tone]) => (
              <button type="button" key={value} className={`admin-leads-metric executive-priority-rail__item ${tone} ${classification === value ? "is-active" : ""}`} onClick={() => setClassification(value)} aria-pressed={classification === value}>
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-filters admin-toolbar-filters executive-leads-controls__secondary">
          <label>Buscar por nombre o correo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej: Camila Retamal" /></label>
          <label>Comuna<select value={commune} onChange={(event) => setCommune(event.target.value)}><option value="todas">Todas las comunas</option>{communes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Edad<select value={age} onChange={(event) => setAge(Number(event.target.value))}>{AGE_RANGES.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
        <label>Fecha<select value={date} onChange={(event) => setDate(event.target.value)}>{DATE_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
    </section>

    {selectedProject && <aside className="executive-project-context">
      <div><span className="eyebrow">Proyecto en foco</span><strong>{selectedProject.nombre}</strong><p>{selectedProject.comuna} · {selectedProject.precio_min_uf}-{selectedProject.precio_max_uf} UF</p></div>
      <p>La bandeja muestra afinidad, capacidad y pie para decidir a quién contactar primero.</p>
    </aside>}

    <section className="admin-surface executive-leads-inbox">
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <span className="eyebrow">Bandeja activa</span>
          <h2>{selectedProject ? "Leads con mejor encaje" : "Leads para revisar"}</h2>
          <p>{selectedProject ? `${ranked.length} de ${filtered.length} alcanzan ${selectedProject.nombre}.` : `${ranked.length} resultado${ranked.length === 1 ? "" : "s"} según la prioridad y los filtros aplicados.`}</p>
        </div>
        <span className="executive-leads-inbox__cue">Selecciona un lead para ver su ficha</span>
      </div>
      <div className="executive-leads-list executive-leads-list--scroll" aria-label="Bandeja de leads">{ranked.map(leadCard)}{!ranked.length && <div className="executive-leads-empty"><strong>No hay leads en esta vista.</strong><span>Ajusta los filtros o restablece la vista para recuperar resultados.</span></div>}</div>
    </section>

    {selectedProject && requiereAntecedentes.length > 0 && <section className="leads-group admin-surface executive-leads-followup"><div className="admin-surface__header"><div className="admin-surface__title"><span className="eyebrow">Seguimiento</span><h2>Requieren antecedentes ({requiereAntecedentes.length})</h2><p>Necesitan una evaluación vigente para calcular su capacidad antes de priorizarlos.</p></div></div><div className="executive-leads-list">{requiereAntecedentes.map(leadCard)}</div></section>}
    {selectedProject && descartados.length > 0 && <section className="leads-group admin-surface executive-leads-excluded"><div className="admin-surface__header"><div className="admin-surface__title"><span className="eyebrow">Sin encaje actual</span><h2>Leads descartados ({descartados.length})</h2><p>Conserva esta lista para reorientar oportunidades cuando cambie el proyecto o el perfil.</p></div><button type="button" className="secondary-button compact-button" onClick={() => setShowExcluded((current) => !current)}>{showExcluded ? "Ocultar lista" : "Ver lista"}</button></div>{showExcluded && <div className="executive-leads-list">{descartados.map(({ lead, match }) => <React.Fragment key={lead.id}>{leadCard({ lead, match })}<p className="lead-descartado-motivo">Motivo: {match.motivo_exclusion}</p></React.Fragment>)}</div>}</section>}
    {selectedLead && (
      <div className="admin-modal" onClick={() => setSelectedLead(null)}>
        <div className="admin-modal-card admin-modal-card--xl executive-lead-detail" onClick={(event) => event.stopPropagation()}>
          <div className="admin-modal-header">
            <div className="admin-modal-heading">
              <span className="eyebrow">Ficha comercial</span>
              <h2>{selectedLead.full_name || selectedLead.email || "Lead sin nombre"}</h2>
              <p>{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Comuna sin dato"} · Evaluado el {formatDate(selectedLead.created_at)}</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={() => setSelectedLead(null)}>Cerrar ficha</button>
          </div>

          <section className={`executive-lead-brief ${selectedResult.executive_summary ? "" : "is-without-summary"}`}>
            <div className="executive-lead-brief__decision">
              <span className="eyebrow">Resultado de la evaluación</span>
              <div>
                <strong>{formatScore(selectedFinalScore) ?? "-"}</strong>
                <span className={`status-pill ${getClassificationClass(selectedResult.classification)}`}>{selectedResult.classification || "Sin clasificación"}</span>
              </div>
              {selectedAdjustment && <small>{selectedAdjustment.message}</small>}
            </div>

            {selectedResult.executive_summary && <div className="executive-lead-brief__summary"><span className="eyebrow">Resumen ejecutivo</span><p>{selectedResult.executive_summary}</p></div>}

            <div className="executive-lead-brief__contact">
              <span className="eyebrow">Contacto</span>
              <div className="admin-action-grid">
                {selectedLead.email ? <a href={selectedEmailHref} className="secondary-button admin-link-button">Enviar correo</a> : <button type="button" className="secondary-button admin-link-button" disabled>Correo no disponible</button>}
                {selectedPhone ? <a href={selectedWhatsappHref} className="primary-button admin-link-button" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a> : <button type="button" className="secondary-button admin-link-button" disabled>WhatsApp no disponible</button>}
              </div>
            </div>
          </section>

          {selectedAdjustment && selectedAdjustment.detail && <div className="admin-callout executive-lead-detail__adjustment"><strong>{selectedAdjustment.detail}</strong>{selectedResult.score_adjustment_reason && <p>{selectedResult.score_adjustment_reason}</p>}</div>}

          {selectedProject && selectedMatch && !selectedMatch.motivo_exclusion && (
            <section className="lead-profile-zone lead-profile-verdict">
              <span className="eyebrow">Veredicto frente al proyecto</span>
              <h3>{selectedProject.nombre}</h3>
              <dl className="lead-profile-facts">
                <div><dt>Afinidad</dt><dd>{selectedMatch.afinidad}<small>{selectedMatch.clasificacion}</small></dd></div>
                <div><dt>Capacidad de compra</dt><dd>{selectedMatch.evidencia.capacidad_uf} UF<small>{selectedMatch.evidencia.plazo_anios} años{selectedMatch.evidencia.plazo_origen ? ` · ${selectedMatch.evidencia.plazo_origen}` : ""}{selectedMatch.evidencia.restriccion_vinculante ? ` · limita ${selectedMatch.evidencia.restriccion_vinculante}` : ""}</small></dd></div>
                <div><dt>Pie disponible</dt><dd>{selectedMatch.evidencia.pie_disponible_uf} UF</dd></div>
                <div><dt>Rango del proyecto</dt><dd>{selectedMatch.precio_min_uf}-{selectedMatch.precio_max_uf} UF</dd></div>
              </dl>
              <p className="lead-profile-blocker"><strong>Bloqueador para este proyecto: </strong>{selectedMatch.bloqueador_principal?.titulo || "Ninguno"}{selectedMatch.bloqueador_principal?.brecha_recurso_clp != null ? ` · faltan ${money(selectedMatch.bloqueador_principal.brecha_recurso_clp)} de ${selectedMatch.bloqueador_principal.brecha_recurso_tipo}` : ""}</p>
              {!selectedMatch.evidencia.alcanza_precio_min && <p className="lead-profile-warning">No alcanza el precio mínimo del proyecto: aparece por cercanía, no como oportunidad calificada.</p>}
              {selectedMatch.reorientable && <p className="lead-profile-note">{selectedCommunes.length && !selectedCommunes.includes(selectedProject.comuna) ? `Oportunidad reorientable: puede comprar en ${selectedProject.comuna}, fuera de ${selectedCommunes.join(" y ")}.` : "Oportunidad reorientable: su objetivo declarado no cierra, pero este proyecto sí."}</p>}
              {selectedMatch.evidencia.desbloqueable_con_fogaes && <p className="lead-profile-note">Se puede desbloquear con FOGAES: con pie asistido de 10% alcanza este proyecto.</p>}
            </section>
          )}

          <div className="admin-detail-grid executive-lead-detail__matrix">
            <div className="admin-stack">
              <article className="admin-panel-card">
                <div className="admin-panel-card__header"><h3>Información del cliente</h3></div>
                <dl className="admin-definition-list">
                  <DetailRow label="Correo">{selectedLead.email || "Sin dato"}</DetailRow>
                  <DetailRow label="Teléfono">{selectedPhone || "Sin dato"}</DetailRow>
                  <DetailRow label="Edad">{selectedInput.edad != null ? `${selectedInput.edad} años` : "Sin dato"}</DetailRow>
                  <DetailRow label="Comuna principal">{selectedInput.comuna_objetivo || selectedOnboarding.comuna_interes || "Sin dato"}</DetailRow>
                  {selectedOnboarding.comuna_alternativa && <DetailRow label="Comuna alternativa">{selectedOnboarding.comuna_alternativa}</DetailRow>}
                </dl>
              </article>

              {selectedMainBlocker && <article className="admin-panel-card admin-panel-card--warning"><div className="admin-panel-card__header"><h3>Bloqueador principal</h3></div><p className="admin-panel-card__body-strong">{selectedMainBlocker.title || selectedMainBlocker.code || "Antecedente a revisar"}</p>{selectedMainBlocker.description && <p>{selectedMainBlocker.description}</p>}<span className="admin-inline-note">Severidad: {translateSeverity(selectedMainBlocker.severity)}</span></article>}

              {selectedResult.positive_indicators?.length > 0 && <article className="admin-panel-card admin-panel-card--success"><div className="admin-panel-card__header"><h3>Indicadores positivos</h3></div><ul className="admin-bullet-list">{selectedResult.positive_indicators.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}</ul></article>}
              {selectedResult.risks?.length > 0 && <article className="admin-panel-card admin-panel-card--danger"><div className="admin-panel-card__header"><h3>Riesgos detectados</h3></div><ul className="admin-bullet-list">{selectedResult.risks.map((item, index) => <li key={index}>{displayItemText(item)}</li>)}</ul></article>}
            </div>

            <div className="admin-stack">
              {selectedProjectFit && <article className="admin-panel-card"><div className="admin-panel-card__header"><h3>Compatibilidad con su objetivo</h3></div><dl className="admin-definition-list"><DetailRow label="Clasificación">{selectedProjectFit.classification || selectedProjectFit.status || "Sin dato"}</DetailRow><DetailRow label="Score">{formatScore(selectedProjectFit.score) ?? "Sin dato"}</DetailRow><DetailRow label="Brecha de ingreso">{money(selectedProjectFit.income_gap)}</DetailRow><DetailRow label="Brecha de pie">{money(selectedProjectFit.down_payment_gap)}</DetailRow><DetailRow label="Compatible">{booleanText(selectedProjectFit.compatible)}</DetailRow></dl></article>}

              <article className="admin-panel-card">
                <div className="admin-panel-card__header"><h3>Señales comerciales</h3></div>
                <dl className="admin-definition-list"><DetailRow label="Plazo de compra">{purchaseTermLabel(selectedInput.plazo_compra)}</DetailRow><DetailRow label="Proyecto visto">{booleanText(selectedInput.tiene_propiedad_vista)}</DetailRow><DetailRow label="Pie estimado">{formatPercent(selectedFinancialIndicators.pie_ratio)}</DetailRow></dl>
              </article>

              {selectedPriority && <article className="admin-panel-card admin-panel-card--success"><div className="admin-panel-card__header"><h3>Prioridad comercial</h3></div><dl className="admin-definition-list"><DetailRow label="Acción">{selectedPriority.action || selectedPriority.level || "Sin dato"}</DetailRow><DetailRow label="Motivo">{selectedPriority.reason || "Sin motivo registrado"}</DetailRow><DetailRow label="Derivación sugerida">{booleanText(selectedPriority.send_to_crm)}</DetailRow></dl></article>}

              {selectedResult.recommendations?.length > 0 && <article className="admin-panel-card"><div className="admin-panel-card__header"><h3>Recomendaciones</h3></div><ul className="admin-bullet-list">{selectedResult.recommendations.map((item, index) => <li key={index}>{displayItemText(item)}{displayItemBenefit(item) && <small className="lead-cell-sub">Beneficio esperado: {displayItemBenefit(item)}</small>}</li>)}</ul></article>}

              {!selectedPriority && selectedResult.commercial_guidance && <article className="admin-panel-card admin-panel-card--soft"><div className="admin-panel-card__header"><h3>Orientación comercial</h3></div><p>{selectedResult.commercial_guidance}</p></article>}

            </div>
          </div>

          <section className="admin-panel-card admin-panel-card--soft executive-lead-detail__history">
            <div className="admin-panel-card__header"><h3>Historial inmutable</h3></div>
            {history.length ? (
              <div className="admin-history-list">
                {history.map((item) => (
                  <article className="admin-history-card" key={item.id}>
                    <div className="admin-history-card__head">
                      <span className="admin-tag admin-tag--soft">{formatEventAt(item.created_at)}</span>
                      <strong>Score base {formatScore(item.base_score ?? item.score) ?? "-"} · Score final {formatScore(item.adjusted_score ?? item.score) ?? "-"} · {item.classification || "Sin clasificación"}</strong>
                    </div>
                    <dl className="admin-definition-list">
                      <DetailRow label="Comuna objetivo">{item.snapshot?.comuna_objetivo || "No declarada"}</DetailRow>
                      <DetailRow label="Canal de origen">{item.channel || "web"}</DetailRow>
                      <DetailRow label="Versión del algoritmo">{item.algorithm_version || "Sin dato"}</DetailRow>
                      <div className="admin-definition-row admin-definition-row--stacked"><dt>Desglose por componente</dt><dd>{item.component_scores && Object.keys(item.component_scores).length ? <ul className="admin-bullet-list admin-bullet-list--compact">{Object.entries(item.component_scores).map(([key, value]) => <li key={key}>{key.replace(/_/g, " ")}: {value >= 0 ? `+${value}` : value}</li>)}</ul> : "Sin detalle disponible"}</dd></div>
                    </dl>
                    {item.events?.length > 0 && <div className="admin-history-events"><span className="admin-tag admin-tag--soft">Eventos del plan</span><ul className="admin-event-list">{item.events.map((event, index) => <li key={`${item.id}-${index}`}><strong>{eventLabels[event.type] || event.type}</strong><span>{formatEventAt(event.at)}</span><p>{renderEventDetail(event)}</p></li>)}</ul></div>}
                  </article>
                ))}
              </div>
            ) : <p>Sin registros de auditoría para esta evaluación.</p>}
          </section>
        </div>
      </div>
    )}
  </section>;
}
