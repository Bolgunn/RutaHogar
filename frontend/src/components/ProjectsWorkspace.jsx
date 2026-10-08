import React, { useEffect, useMemo, useState } from "react";
import { estadoProyectoLabels, estadoProyectoPillClass, tipoProyectoLabels } from "../constants/proyectos";
import { getProjects } from "../services/projectService";
import "./executive-projects.css";

function formatDelivery(value) {
  if (!value) return "Sin fecha informada";
  const [year, month] = String(value).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function formatUfRange(project) {
  if (project.precio_min_uf == null || project.precio_max_uf == null) return "Sin rango informado";
  return project.precio_min_uf === project.precio_max_uf
    ? `${Number(project.precio_min_uf).toLocaleString("es-CL")} UF`
    : `${Number(project.precio_min_uf).toLocaleString("es-CL")} – ${Number(project.precio_max_uf).toLocaleString("es-CL")} UF`;
}

export default function ProjectsWorkspace({ inmobiliariaId, ejecutivo, isAdmin, onManageCatalog }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const executiveScope = useMemo(
    () => ejecutivo?.id || ejecutivo?.email ? { id: ejecutivo.id ?? null, email: ejecutivo.email ?? null } : null,
    [ejecutivo?.id, ejecutivo?.email],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getProjects({ inmobiliariaId, ejecutivo: executiveScope })
      .then((items) => {
        if (!active) return;
        setProjects(items);
        setSelectedId((current) => current || String(items[0]?.id || ""));
      })
      .catch(() => { if (active) setError("No se pudieron cargar los proyectos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inmobiliariaId, executiveScope, reload]);

  const filteredProjects = useMemo(() => {
    const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const term = normalize(query.trim());
    return projects.filter((project) => normalize(`${project.nombre} ${project.comuna || ""}`).includes(term));
  }, [projects, query]);

  const selectedProject = useMemo(
    () => filteredProjects.find((project) => String(project.id) === selectedId) || filteredProjects[0] || null,
    [filteredProjects, selectedId],
  );

  return (
    <section className="section-block projects-workspace executive-projects-workspace">
      <header className="projects-workspace__heading">
        <div className="section-heading">
          <span className="eyebrow">Catálogo comercial</span>
          <h1>Proyectos en cartera</h1>
          <p>{isAdmin ? "Revisa la oferta actual de tu inmobiliaria antes de gestionarla." : "Revisa los proyectos asignados para preparar cada conversación comercial."}</p>
        </div>
        {isAdmin && <button type="button" className="secondary-button" onClick={onManageCatalog}>Gestionar catálogo</button>}
      </header>

      {!loading && !error && projects.length > 0 && <dl className="executive-projects-summary" aria-label="Resumen de cartera">
        <div><dt>En cartera</dt><dd>{projects.length}<small>proyectos</small></dd></div>
        <div><dt>Disponibles</dt><dd>{projects.filter((project) => project.estado === "disponible").length}<small>proyectos</small></dd></div>
        <div><dt>En construcción</dt><dd>{projects.filter((project) => project.estado === "en_construccion").length}<small>proyectos</small></dd></div>
      </dl>}
      {loading ? <div className="projects-workspace__loading" role="status" aria-label="Cargando proyectos"><span></span><span></span><span></span></div> : error ? (
        <div className="admin-surface" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Reintentar</button></div>
      ) : !projects.length ? (
        <div className="admin-surface empty-state"><strong>No hay proyectos disponibles en esta vista.</strong><p>{isAdmin ? "Crea proyectos desde el catálogo para verlos aquí." : "Tu administrador debe asignarte al menos un proyecto."}</p></div>
      ) : (
        <div className="projects-workspace__layout">
          <div className="projects-workspace__rail" aria-label="Lista de proyectos">
            <div className="projects-workspace__rail-head"><h2>Tu cartera</h2><label className="executive-project-search"><span>Buscar proyecto</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o comuna" /></label><span role="status">{filteredProjects.length} de {projects.length} proyectos</span></div>
            <div className="executive-projects-list">
            {filteredProjects.map((project) => (
              <button type="button" key={project.id} className={`project-rail-card ${project.id === selectedProject?.id ? "is-selected" : ""}`} onClick={() => setSelectedId(String(project.id))} aria-pressed={project.id === selectedProject?.id}>
                <span className="project-rail-card__top"><span>{tipoProyectoLabels[project.tipo] || project.tipo || "Tipo sin dato"}</span><span className={`status-pill ${estadoProyectoPillClass[project.estado] || ""}`}>{estadoProyectoLabels[project.estado] || project.estado}</span></span>
                <strong>{project.nombre}</strong>
                <small>{project.comuna || "Comuna sin dato"}</small>
                <span className="project-rail-card__price">{formatUfRange(project)}<i className="ti ti-chevron-right" aria-hidden="true" /></span>
              </button>
            ))}
            {!filteredProjects.length && <div className="empty-state"><p>No hay proyectos que coincidan.</p><button type="button" className="secondary-button" onClick={() => setQuery("")}>Limpiar búsqueda</button></div>}
            </div>
          </div>

          {selectedProject && <article className="project-dossier">
            <div className="project-dossier__topline"><span className="eyebrow">Proyecto seleccionado</span><span className={`status-pill ${estadoProyectoPillClass[selectedProject.estado] || ""}`}>{estadoProyectoLabels[selectedProject.estado] || selectedProject.estado}</span></div>
            <div className="project-dossier__identity"><span className="project-dossier__icon"><i className={`ti ${selectedProject.tipo === "casa" ? "ti-home" : "ti-building-estate"}`} aria-hidden="true" /></span><div><h2>{selectedProject.nombre}</h2><p>{selectedProject.comuna || "Comuna sin dato"} · {tipoProyectoLabels[selectedProject.tipo] || selectedProject.tipo || "Tipo sin dato"}</p></div></div>
            <div className="project-dossier__price"><span>Rango de precio</span><strong>{formatUfRange(selectedProject)}</strong></div>
            <dl className="project-dossier__facts">
              <div><dt>Comuna</dt><dd>{selectedProject.comuna || "Sin dato"}</dd></div>
              <div><dt>Tipo</dt><dd>{tipoProyectoLabels[selectedProject.tipo] || selectedProject.tipo || "Sin dato"}</dd></div>
              <div><dt>Inmobiliaria</dt><dd>{selectedProject.inmobiliaria_nombre || "Sin dato"}</dd></div>
              <div><dt>Entrega estimada</dt><dd>{formatDelivery(selectedProject.entrega_estimada)}</dd></div>
            </dl>
            {selectedProject.descripcion && <section className="project-dossier__about"><h3>Sobre el proyecto</h3><p className="project-dossier__description">{selectedProject.descripcion}</p></section>}
            {isAdmin && <div className="project-dossier__coverage"><span className="eyebrow">Cobertura comercial</span><strong>{selectedProject.ejecutivos?.length || 0} ejecutivo{selectedProject.ejecutivos?.length === 1 ? "" : "s"} vinculado{selectedProject.ejecutivos?.length === 1 ? "" : "s"}</strong>{selectedProject.ejecutivos?.length > 0 && <p>{selectedProject.ejecutivos.map((item) => item.nombre || item.email).join(" · ")}</p>}</div>}
          </article>}
        </div>
      )}
    </section>
  );
}
