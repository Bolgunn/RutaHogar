import React, { useEffect, useMemo, useState } from "react";
import { getExecutives } from "../services/executiveService";
import { getProjects, getTenantContext } from "../services/projectService";
import { getClassificationClass } from "../utils/helpers";

function formatFecha(value) {
  if (!value) return "Sin registros";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registros";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getLatestDate(items) {
  return items.reduce((latest, item) => {
    if (!item?.created_at) return latest;
    if (!latest) return item.created_at;
    return new Date(item.created_at) > new Date(latest) ? item.created_at : latest;
  }, "");
}

export default function AdminHome({ evaluations, onNavigate }) {
  const [tenant, setTenant] = useState(null);
  const [projects, setProjects] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAdminHome() {
      setLoading(true);
      setError("");
      try {
        const context = await getTenantContext();
        if (!active) return;

        const scopeId = context.isGlobalAdmin ? "all" : context.inmobiliaria_id;
        const [projectRows, executiveRows] = await Promise.all([
          getProjects({ inmobiliariaId: scopeId }),
          getExecutives({ inmobiliariaId: scopeId }),
        ]);

        if (!active) return;
        setTenant(context);
        setProjects(projectRows);
        setExecutives(executiveRows);
      } catch (err) {
        if (active) {
          setError(err.message || "No se pudo cargar el resumen administrativo.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAdminHome();
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    return evaluations.reduce(
      (acc, item) => {
        const classification = item.result?.classification;
        acc.total += 1;
        if (classification === "Alto") acc.alto += 1;
        if (classification === "Medio") acc.medio += 1;
        if (classification === "Bajo") acc.bajo += 1;
        return acc;
      },
      { total: 0, alto: 0, medio: 0, bajo: 0 }
    );
  }, [evaluations]);

  const projectCounts = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.estado === "disponible") acc.disponibles += 1;
        if (project.estado === "en_construccion") acc.construccion += 1;
        if (project.estado === "agotado") acc.agotados += 1;
        if ((project.ejecutivos || []).some((item) => item.estado === "vinculado")) acc.conCobertura += 1;
        return acc;
      },
      { total: 0, disponibles: 0, construccion: 0, agotados: 0, conCobertura: 0 }
    );
  }, [projects]);

  const recentLeads = useMemo(() => {
    return [...evaluations]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 4);
  }, [evaluations]);

  const topCommunes = useMemo(() => {
    const countsByCommune = evaluations.reduce((acc, item) => {
      const commune = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      if (!commune) return acc;
      acc[commune] = (acc[commune] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(countsByCommune)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [evaluations]);

  const scopeLabel = tenant?.isGlobalAdmin ? "Cobertura global" : tenant?.inmobiliaria_nombre || "Cobertura acotada";
  const latestLeadDate = formatFecha(getLatestDate(evaluations));
  const latestProjectDate = formatFecha(getLatestDate(projects));

  return (
    <section className="section-block admin-home-page">
      <div className="section-heading">
        <span className="eyebrow">Operación interna</span>
        <h1>Inicio administrativo</h1>
        <p>
          Una vista concentrada para revisar captación, catálogo y capacidad operativa sin perder el
          lenguaje visual de RutaHogar.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="admin-hero admin-hero--compact">
        <div className="admin-hero__content">
          <div className="admin-hero__meta">
            <span className="admin-tag">{tenant?.isGlobalAdmin ? "Admin global" : "Admin inmobiliaria"}</span>
            <span className="admin-hero__subtle">{scopeLabel}</span>
          </div>
          <h2>Prioriza el trabajo diario desde un solo punto de entrada.</h2>
          <p>
            Usa este inicio para entrar rápido a las vistas más críticas y detectar dónde conviene actuar primero.
          </p>
          <div className="admin-hero__actions">
            <button type="button" className="primary-button" onClick={() => onNavigate("admin")}>
              Abrir panel
            </button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("admin-projects")}>
              Gestionar proyectos
            </button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("leads")}>
              Revisar leads
            </button>
          </div>
        </div>

        <div className="admin-hero__aside admin-hero__aside--stacked">
          <div className="mini-stat">
            <span>Ultimo lead</span>
            <strong>{latestLeadDate}</strong>
          </div>
          <div className="mini-stat">
            <span>Ultimo ajuste catalogo</span>
            <strong>{latestProjectDate}</strong>
          </div>
          <div className="mini-stat">
            <span>Cobertura ejecutiva</span>
            <strong>
              {projectCounts.total ? `${projectCounts.conCobertura}/${projectCounts.total}` : "0/0"}
            </strong>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="admin-skeleton-layout">
          <div className="admin-kpi-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="admin-skeleton-card" key={index}>
                <span className="admin-skeleton-line short"></span>
                <span className="admin-skeleton-line medium"></span>
                <span className="admin-skeleton-line short"></span>
              </div>
            ))}
          </div>
          <div className="admin-grid-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="admin-skeleton-card admin-skeleton-card--tall" key={`panel-${index}`}>
                <span className="admin-skeleton-line short"></span>
                <span className="admin-skeleton-line full"></span>
                <span className="admin-skeleton-line full"></span>
                <span className="admin-skeleton-line medium"></span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card admin-kpi-card--navy">
              <span className="admin-kpi-card__label">Leads evaluados</span>
              <strong className="admin-kpi-card__value">{counts.total}</strong>
              <p className="admin-kpi-card__hint">Visión total del flujo comercial ya procesado.</p>
            </article>
            <article className="admin-kpi-card admin-kpi-card--success">
              <span className="admin-kpi-card__label">Alta prioridad</span>
              <strong className="admin-kpi-card__value">{counts.alto}</strong>
              <p className="admin-kpi-card__hint">Leads con mejor señal para seguimiento inmediato.</p>
            </article>
            <article className="admin-kpi-card admin-kpi-card--gold">
              <span className="admin-kpi-card__label">Catalogo activo</span>
              <strong className="admin-kpi-card__value">{projectCounts.disponibles + projectCounts.construccion}</strong>
              <p className="admin-kpi-card__hint">Suma de proyectos disponibles y en construcción.</p>
            </article>
            <article className="admin-kpi-card admin-kpi-card--soft">
              <span className="admin-kpi-card__label">Ejecutivos</span>
              <strong className="admin-kpi-card__value">{executives.length}</strong>
              <p className="admin-kpi-card__hint">Cuentas listas para cobertura y asignación.</p>
            </article>
          </div>

          <div className="admin-grid-2">
            <article className="admin-surface">
              <div className="admin-surface__header">
                <div className="admin-surface__title">
                  <h2>Leads recientes</h2>
                  <p>Últimos ingresos con contexto útil para la primera acción comercial.</p>
                </div>
                <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("leads")}>
                  Ver todos
                </button>
              </div>

              {!recentLeads.length ? (
                <div className="empty-state">
                  <strong>Aún no hay leads recientes</strong>
                  <p>Cuando existan calificaciones, este resumen mostrará los ingresos más nuevos.</p>
                </div>
              ) : (
                <div className="admin-list">
                  {recentLeads.map((lead) => (
                    <article className="admin-list-item" key={lead.id}>
                      <div className="admin-list-item__main">
                        <strong>{lead.full_name || lead.email || "Lead sin nombre"}</strong>
                        <span>
                          {lead.input?.comuna_objetivo || lead.onboarding?.comuna_interes || "Comuna sin dato"} · {formatFecha(lead.created_at)}
                        </span>
                      </div>
                      <span className={`status-pill ${getClassificationClass(lead.result?.classification)}`}>
                        {lead.result?.classification || "Sin clasificación"}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="admin-surface admin-surface--soft">
              <div className="admin-surface__header">
                <div className="admin-surface__title">
                  <h2>Focos operativos</h2>
                  <p>Lectura rápida para distribuir mejor la atención del equipo.</p>
                </div>
              </div>

              <div className="admin-list">
                <article className="admin-list-item">
                  <div className="admin-list-item__main">
                    <strong>Distribución de scoring</strong>
                    <span>
                      {counts.alto} altos, {counts.medio} medios y {counts.bajo} bajos.
                    </span>
                  </div>
                </article>

                <article className="admin-list-item">
                  <div className="admin-list-item__main">
                    <strong>Estado del catálogo</strong>
                    <span>
                      {projectCounts.disponibles} disponibles, {projectCounts.construccion} en construcción y {projectCounts.agotados} agotados.
                    </span>
                  </div>
                </article>

                <article className="admin-list-item">
                  <div className="admin-list-item__main">
                    <strong>Comunas con mayor interés</strong>
                    <span>
                      {topCommunes.length
                        ? topCommunes.map(([commune, total]) => `${commune} (${total})`).join(" · ")
                        : "Aún no hay suficiente volumen para detectar tendencia."}
                    </span>
                  </div>
                </article>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
