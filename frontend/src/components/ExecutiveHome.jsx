import React, { useEffect, useMemo, useState } from "react";
import { getProjects } from "../services/projectService";
import { formatScore } from "../utils/helpers";

const RECENT_RANGES = [
  { label: "Última hora", value: "1h", hours: 1 },
  { label: "Últimas 3 horas", value: "3h", hours: 3 },
  { label: "Últimas 12 horas", value: "12h", hours: 12 },
  { label: "Últimas 24 horas", value: "24h", hours: 24 },
];

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

export default function ExecutiveHome({ profile, evaluations, inmobiliariaId, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentRange, setRecentRange] = useState("3h");

  useEffect(() => {
    let active = true;
    getProjects({
      inmobiliariaId,
      ejecutivo: { id: profile?.id || null, email: profile?.email || null },
    })
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setProjects([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inmobiliariaId, profile?.email, profile?.id]);

  const leadStats = useMemo(() => (evaluations || []).reduce((counts, item) => {
    counts.total += 1;
    if (item.result?.classification === "Alto") counts.prioritarios += 1;
    return counts;
  }, { total: 0, prioritarios: 0 }), [evaluations]);

  const recentLeads = useMemo(() => {
    const range = RECENT_RANGES.find((item) => item.value === recentRange) || RECENT_RANGES[0];
    const minDate = new Date(Date.now() - range.hours * 60 * 60 * 1000);
    return [...(evaluations || [])]
      .filter((lead) => {
        const createdAt = new Date(lead.created_at || 0);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= minDate;
      })
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      .slice(0, 12);
  }, [evaluations, recentRange]);

  const availableProjects = projects.filter((project) => project.estado === "disponible").length;
  const firstName = profile?.full_name?.split(" ")[0] || "Ejecutivo";

  return (
    <section className="section-block executive-home">
      <div className="section-heading">
        <span className="eyebrow">Mesa comercial</span>
        <h1>Hola, {firstName}</h1>
        <p>Revisa tu cartera y las oportunidades disponibles para organizar el siguiente contacto.</p>
      </div>

      <section className="admin-kpi-grid executive-home__metrics" aria-label="Resumen comercial">
        <article className="admin-kpi-card admin-kpi-card--navy">
          <span className="admin-kpi-card__label">Proyectos asignados</span>
          <strong className="admin-kpi-card__value">{loading ? "-" : projects.length}</strong>
          <p className="admin-kpi-card__hint">Cartera disponible para tus conversaciones.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--success">
          <span className="admin-kpi-card__label">Proyectos disponibles</span>
          <strong className="admin-kpi-card__value">{loading ? "-" : availableProjects}</strong>
          <p className="admin-kpi-card__hint">Alternativas activas para mostrar a tus leads.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--gold">
          <span className="admin-kpi-card__label">Oportunidades prioritarias</span>
          <strong className="admin-kpi-card__value">{leadStats.prioritarios}</strong>
          <p className="admin-kpi-card__hint">Calificaciones con clasificación alta disponibles.</p>
        </article>
        <article className="admin-kpi-card admin-kpi-card--soft">
          <span className="admin-kpi-card__label">Calificaciones disponibles</span>
          <strong className="admin-kpi-card__value">{leadStats.total}</strong>
          <p className="admin-kpi-card__hint">Base actual para priorizar seguimiento.</p>
        </article>
      </section>

      <div className="admin-grid-2 executive-home__board">
        <article className="admin-surface">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Calificaciones recientes</h2>
              <p>Últimas evaluaciones recibidas para revisar en la mesa de leads.</p>
            </div>
            <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("leads")}>Ver leads</button>
          </div>
          <div className="executive-home-recent-filter" aria-label="Filtrar calificaciones recientes por tiempo">
            {RECENT_RANGES.map((range) => (
              <button
                type="button"
                className={recentRange === range.value ? "is-active" : ""}
                key={range.value}
                onClick={() => setRecentRange(range.value)}
              >
                {range.label}
              </button>
            ))}
          </div>
          {recentLeads.length ? (
            <div className={`admin-list executive-home-recent-list ${recentLeads.length > 3 ? "is-scrollable" : ""}`}>
              {recentLeads.map((lead) => (
                <article className="admin-list-item" key={lead.id}>
                  <div className="admin-list-item__main">
                    <strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong>
                    <span>{lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Comuna sin dato"}</span>
                  </div>
                  <div className="executive-home-recent-score">
                    <small>Score</small>
                    <strong>{formatScore(lead.result?.adjusted_score ?? lead.result?.score) ?? "-"}</strong>
                  </div>
                  <div className="admin-list-item__meta">
                    <span>{formatDateTime(lead.created_at)}</span>
                    <span>{lead.result?.classification || "Sin clasificación"}</span>
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
        </article>

        <article className="admin-surface admin-surface--soft executive-home__next">
          <div className="admin-surface__title">
            <h2>Tu siguiente paso</h2>
            <p>Empieza por revisar los proyectos asignados y luego prioriza el contacto comercial.</p>
          </div>
          <div className="executive-home__actions">
            <button type="button" onClick={() => onNavigate("projects")}>Ver mi cartera</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("leads")}>Organizar leads</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("sales-profile")}>Ver mi perfil</button>
          </div>
        </article>
      </div>
    </section>
  );
}
