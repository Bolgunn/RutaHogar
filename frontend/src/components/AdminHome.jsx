import React, { useEffect, useMemo, useState } from "react";
import { getExecutives } from "../services/executiveService";
import { getProjects, getTenantContext } from "../services/projectService";
import { formatScore, getClassificationClass } from "../utils/helpers";
import { buildAdminHomeSummary } from "../lib/commercial/adminHomeSummary";
import "./admin-home.css";

function formatDate(value) {
  if (!value) return "Sin registros";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL", { dateStyle: "short", timeZone: "America/Santiago" });
}

function CountRow({ label, count, total, tone = "" }) {
  return <div className={`admin-home-count-row ${tone}`}>
    <div><span>{label}</span><strong>{count}<small>{total ? `(${Math.round(count / total * 100)} %)` : "(—)"}</small></strong></div>
    <span className="admin-home-count-row__track" aria-hidden="true"><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></span>
  </div>;
}

export default function AdminHome({ evaluations = [], onNavigate }) {
  const [tenant, setTenant] = useState(null);
  const [projects, setProjects] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const context = await getTenantContext();
        if (!active) return;
        setTenant(context);
        const scopeId = context.isGlobalAdmin ? "all" : context.inmobiliaria_id;
        const [projectRows, executiveRows] = await Promise.all([getProjects({ inmobiliariaId: scopeId }), getExecutives({ inmobiliariaId: scopeId })]);
        if (!active) return;
        setProjects(projectRows);
        setExecutives(executiveRows);
      } catch {
        if (active) setError("No pudimos cargar el catálogo y el equipo.");
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [refresh]);

  const { counts, projectCounts, recent, latestLeadDate, latestProjectDate, topCommunes } = useMemo(() => buildAdminHomeSummary(evaluations, projects), [evaluations, projects]);
  const unavailable = loading || Boolean(error);
  const scopeLabel = tenant?.isGlobalAdmin ? "Cobertura global" : tenant?.inmobiliaria_nombre || (loading ? "Cargando ámbito…" : "Ámbito administrativo");
  const operationalValue = (value) => unavailable ? "—" : value;
  return <section className="section-block admin-home-page admin-home-workspace">
    <header className="section-heading">
      <div><span className="eyebrow">Administración</span><h1>Inicio administrativo</h1><p>Captación, catálogo y cobertura del equipo.</p><span className="admin-home-scope"><i className="ti ti-building-estate" aria-hidden="true" />{scopeLabel}</span></div>
      <button type="button" className="primary-button" onClick={() => onNavigate("admin")}>Abrir panel <i className="ti ti-arrow-right" aria-hidden="true" /></button>
    </header>
    {error && <div className="admin-home-error" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div>}
    <dl className="admin-home-metrics" aria-label="Resumen administrativo">
      <div><dt>Calificaciones registradas</dt><dd>{counts.total}</dd><small>Historial de evaluaciones</small></div>
      <div><dt>Calificaciones altas</dt><dd>{counts.alto}</dd><small>{counts.total ? `${Math.round(counts.alto / counts.total * 100)} % del historial` : "Sin calificaciones"}</small></div>
      <div aria-busy={loading}><dt>Proyectos activos</dt><dd>{operationalValue(projectCounts.disponibles + projectCounts.construccion)}</dd><small>{unavailable ? loading ? "Cargando catálogo…" : "Catálogo no disponible" : `${projectCounts.total} proyectos en total`}</small></div>
      <div aria-busy={loading}><dt>Ejecutivos</dt><dd>{operationalValue(executives.length)}</dd><small>{unavailable ? loading ? "Cargando equipo…" : "Equipo no disponible" : "Cuentas en este ámbito"}</small></div>
    </dl>
    <div className="admin-home-board">
      <article className="admin-home-surface admin-home-activity">
        <header><div><h2>Actividad reciente</h2><p>Últimas calificaciones recibidas.</p></div><button type="button" className="secondary-button" onClick={() => onNavigate("leads")}>Ver leads</button></header>
        {recent.length ? <ul className="admin-home-recent-list">{recent.map((lead) => {
          const score = formatScore(lead.result?.adjusted_score ?? lead.result?.score);
          const reliability = { sospechoso: "Por validar", en_revision: "En revisión", silenciado: "Silenciado", descartado: "Descartado" }[lead.reliability_status];
          return <li key={lead.id}><div className="admin-home-lead-identity"><strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong><span>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Comuna sin dato"}</span></div><span className="admin-home-score"><small>Score</small><strong>{score ?? "—"}</strong></span><div className="admin-home-lead-status"><time>{formatDate(lead.created_at)}</time><span className={`status-pill ${reliability ? "medio" : getClassificationClass(lead.result?.classification)}`}>{reliability || lead.result?.classification || "Sin clasificación"}</span></div></li>;
        })}</ul> : <div className="admin-home-empty"><strong>Aún no hay calificaciones</strong><p>La actividad del equipo aparecerá aquí.</p></div>}
        <footer>Última calificación: {formatDate(latestLeadDate)}</footer>
      </article>
      <article className="admin-home-surface admin-home-priorities">
        <header><h2>Para revisar primero</h2></header>
        <div className="admin-home-priority"><span className="admin-home-icon"><i className="ti ti-shield-check" aria-hidden="true" /></span><div><strong>{counts.review} calificaciones por validar</strong><p>Marcadas como sospechosas o en revisión.</p></div></div>
        <button type="button" className="secondary-button" onClick={() => onNavigate("admin")}>Revisar confiabilidad <i className="ti ti-arrow-right" aria-hidden="true" /></button>
        <div className="admin-home-priority"><span className="admin-home-icon"><i className="ti ti-users-group" aria-hidden="true" /></span><div><strong>{operationalValue(projectCounts.activeUncovered)} proyectos activos sin cobertura</strong><p>{unavailable ? "Pendiente de cargar el catálogo." : "Sin ejecutivos vinculados para su gestión."}</p></div></div>
        <button type="button" className="secondary-button" onClick={() => onNavigate("admin-projects")}>Gestionar asignaciones <i className="ti ti-arrow-right" aria-hidden="true" /></button>
      </article>
      <article className="admin-home-surface admin-home-catalog">
        <header><div><h2>Catálogo y cobertura</h2><p>Estado de la oferta y asignación comercial.</p></div><button type="button" className="secondary-button" onClick={() => onNavigate("admin-projects")}>Gestionar proyectos</button></header>
        {unavailable ? <p role="status">{loading ? "Cargando catálogo y cobertura…" : "Resumen no disponible. Reintenta la carga."}</p> : <div className="admin-home-catalog-grid">
          <dl className="admin-home-catalog-counts">{[["Disponibles", projectCounts.disponibles], ["En construcción", projectCounts.construccion], ["Agotados", projectCounts.agotados]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
          <div className="admin-home-coverage"><span>Proyectos con cobertura ejecutiva</span><strong>{projectCounts.conCobertura}<small>de {projectCounts.total}</small></strong><span className="admin-home-count-row__track" aria-hidden="true"><span style={{ width: `${projectCounts.total ? projectCounts.conCobertura / projectCounts.total * 100 : 0}%` }} /></span><p>Al menos un ejecutivo vinculado.</p></div>
        </div>}
        <footer>Última actualización del catálogo: {unavailable ? "—" : formatDate(latestProjectDate)}</footer>
      </article>
      <article className="admin-home-surface admin-home-capture">
        <header><h2>Perfil de la captación</h2></header>
        <div className="admin-home-distribution">{[["Alta", counts.alto, "is-high"], ["Media", counts.medio, "is-medium"], ["Baja", counts.bajo, "is-low"], ...(counts.sinDato ? [["Sin clasificación", counts.sinDato, ""]] : [])].map(([label, count, tone]) => <CountRow key={label} {...{ label, count, tone }} total={counts.total} />)}</div>
        <section className="admin-home-communes"><h3>Comunas con mayor interés</h3>{topCommunes.length ? <ul>{topCommunes.map(([commune, total]) => <li key={commune}><span>{commune}</span><strong>{total}<small>calificaciones</small></strong></li>)}</ul> : <p>Sin comunas informadas todavía.</p>}</section>
      </article>
    </div>
  </section>;
}