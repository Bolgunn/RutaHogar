import React, { useEffect, useMemo, useState } from "react";
import { getProjects } from "../services/projectService";
import { formatScore, getClassificationTone } from "../utils/helpers";
import { formatProjectPrice } from "../lib/simulation/projectAdapter";
import { buildExecutiveHomeSummary } from "../lib/commercial/executiveHomeSummary";
import "./executive-home.css";

const RECENT_RANGES = [
  { label: "Última hora", value: "1h", hours: 1 },
  { label: "Últimas 3 horas", value: "3h", hours: 3 },
  { label: "Últimas 12 horas", value: "12h", hours: 12 },
  { label: "Últimas 24 horas", value: "24h", hours: 24 },
];
const RELIABILITY_LABELS = {
  sospechoso: "Por validar", en_revision: "En revisión",
  silenciado: "Silenciado", descartado: "Descartado",
};

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });
}

export default function ExecutiveHome({ profile, evaluations, inmobiliariaId, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectError, setProjectError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [recentRange, setRecentRange] = useState("3h");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProjectError(false);
    setProjects([]);
    getProjects({
      inmobiliariaId,
      ejecutivo: { id: profile?.id || null, email: profile?.email || null },
    })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjectError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inmobiliariaId, profile?.email, profile?.id, refresh]);

  const range = RECENT_RANGES.find((item) => item.value === recentRange);
  const summary = useMemo(() => buildExecutiveHomeSummary(evaluations, range.hours, now), [evaluations, range.hours, now]);
  const recentLeads = summary.recent;

  const availableProjects = projects.filter((project) => project.estado === "disponible").length;
  const previewProjects = [...projects.filter((project) => project.estado === "disponible"), ...projects.filter((project) => project.estado !== "disponible")].slice(0, 3);
  const firstName = profile?.full_name?.split(" ")[0] || "Ejecutivo";

  return (
    <section className="section-block executive-home">
      <div className="section-heading">
        <span className="eyebrow">Mesa comercial</span>
        <h1>Hola, {firstName}</h1>
        <p>Tu cartera, las nuevas calificaciones y lo que conviene revisar primero.</p>
        <button type="button" className="primary-button compact-button executive-home__primary" onClick={() => onNavigate("leads")}>Abrir mesa de leads <i className="ti ti-arrow-right" aria-hidden="true" /></button>
      </div>

      <section className="admin-kpi-grid executive-home__metrics" aria-label="Resumen comercial">
        <article className="admin-kpi-card admin-kpi-card--navy">
          <span className="admin-kpi-card__label">Calificaciones</span>
          <strong className="admin-kpi-card__value">{summary.total}</strong>
          <p className="admin-kpi-card__hint">En tu mesa de leads</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--success">
          <span className="admin-kpi-card__label">Score alto</span>
          <strong className="admin-kpi-card__value">{summary.high}</strong>
          <p className="admin-kpi-card__hint">Sin alertas de confiabilidad</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--gold">
          <span className="admin-kpi-card__label">Por validar</span>
          <strong className="admin-kpi-card__value">{summary.review}</strong>
          <p className="admin-kpi-card__hint">Con alertas o en revisión</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--soft">
          <span className="admin-kpi-card__label">Proyectos disponibles</span>
          <strong className="admin-kpi-card__value">{loading || projectError ? "—" : availableProjects}</strong>
          <p className="admin-kpi-card__hint">{loading ? "Cargando cartera…" : projectError ? "Cartera no disponible" : `${projects.length} asignados en total`}</p>
        </article>
      </section>

      <div className="admin-grid-2 executive-home__board">
        <article className="admin-surface">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Actividad reciente</h2>
              <p>{summary.recentTotal} {summary.recentTotal === 1 ? "calificación recibida" : "calificaciones recibidas"} en las últimas {range.hours} {range.hours === 1 ? "hora" : "horas"}.</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("leads")}>Ver leads</button>
          </div>
          <div className="executive-home-recent-filter" role="group" aria-label="Filtrar calificaciones recientes por tiempo">
            {RECENT_RANGES.map((range) => (
              <button
                type="button"
                className={recentRange === range.value ? "is-active" : ""}
                aria-pressed={recentRange === range.value}
                key={range.value}
                onClick={() => setRecentRange(range.value)}
              >
                {range.label}
              </button>
            ))}
          </div>
          {recentLeads.length ? (
            <div className={`admin-list executive-home-recent-list ${recentLeads.length > 3 ? "is-scrollable" : ""}`} tabIndex={recentLeads.length > 3 ? 0 : undefined} role="region" aria-label="Calificaciones recientes">
              {recentLeads.map((lead) => (
                <article className="admin-list-item" key={lead.id}>
                  <div className="admin-list-item__main">
                    <strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong>
                    <span>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Comuna sin dato"}</span>
                  </div>
                  <div className="executive-home-recent-score">
                    <small>Score</small>
                    <strong>{(lead.result?.adjusted_score ?? lead.result?.score) == null ? "—" : formatScore(lead.result?.adjusted_score ?? lead.result?.score) ?? "—"}</strong>
                  </div>
                  <div className="admin-list-item__meta">
                    <span>{formatDateTime(lead.created_at)}</span>
                    <span className={`executive-home__status is-${RELIABILITY_LABELS[lead.reliability_status] ? "review" : getClassificationTone(lead.result?.classification)}`}>{RELIABILITY_LABELS[lead.reliability_status] || lead.result?.classification || "Sin clasificación"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-compact-empty">
              <strong>No hay calificaciones en este rango.</strong>
              <p>Cambia el filtro de tiempo o revisa la mesa de leads completa.</p>
            </div>
          )}
          {summary.recentTotal > recentLeads.length && <p className="executive-home__list-note">Mostrando las {recentLeads.length} más recientes. Revisa el resto en la mesa de leads.</p>}
        </article>

        <article className="admin-surface executive-home__next">
          <div className="admin-surface__title">
            <h2>Para revisar primero</h2>
          </div>
          <div className="executive-home__actions">
            <div className="executive-home__priority"><i className="ti ti-user-check" aria-hidden="true" /><div><strong>{summary.high} con score alto</strong><p>{summary.high ? "Revisa su perfil y compatibilidad antes del contacto." : "Revisa las otras calificaciones para preparar el seguimiento."}</p></div></div>
            <div className="executive-home__priority"><i className="ti ti-shield-check" aria-hidden="true" /><div><strong>{summary.review} por validar</strong><p>{summary.review ? "Comprueba las alertas antes de priorizarlos." : "Sin alertas pendientes de confiabilidad."}</p></div></div>
            <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("leads")}>Organizar seguimiento <i className="ti ti-arrow-right" aria-hidden="true" /></button>
          </div>
        </article>
        <article className="admin-surface executive-home__portfolio" aria-busy={loading}>
            <h2>Cartera asignada</h2>
            {loading ? <p role="status">Cargando tus proyectos…</p> : projectError ? <div role="status"><p>No pudimos cargar la cartera.</p><button type="button" className="secondary-button compact-button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div> : previewProjects.length ? (
              <ul>{previewProjects.map((project) => <li key={project.id}><strong>{project.nombre}</strong><span>{project.comuna || "Comuna sin dato"} · {formatProjectPrice(project)}</span><small>{project.estado === "disponible" ? "Disponible" : project.estado === "en_construccion" ? "En construcción" : "No disponible"}</small></li>)}</ul>
            ) : <p>Aún no tienes proyectos asignados.</p>}
          <div className="executive-home__portfolio-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("projects")}>Ver cartera completa <i className="ti ti-arrow-right" aria-hidden="true" /></button>
          </div>
        </article>
      </div>
    </section>
  );
}
