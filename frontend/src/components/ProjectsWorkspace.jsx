import React, { useEffect, useMemo, useState } from "react";
import { estadoProyectoLabels, estadoProyectoPillClass, tipoProyectoLabels } from "../constants/proyectos";
import { getProjects } from "../services/projectService";

function formatDelivery(value) {
  if (!value) return "Sin fecha informada";
  const [year, month] = String(value).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function formatUfRange(project) {
  if (project.precio_min_uf == null || project.precio_max_uf == null) return "Sin rango informado";
  return project.precio_min_uf === project.precio_max_uf
    ? `${project.precio_min_uf} UF`
    : `${project.precio_min_uf}-${project.precio_max_uf} UF`;
}

export default function ProjectsWorkspace({ inmobiliariaId, ejecutivo, isAdmin, onManageCatalog }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  }, [inmobiliariaId, executiveScope]);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === selectedId) || null,
    [projects, selectedId],
  );

  return (
    <section className="section-block projects-workspace">
      <header className="projects-workspace__heading">
        <div className="section-heading">
          <span className="eyebrow">Catálogo comercial</span>
          <h1>Proyectos en cartera</h1>
          <p>{isAdmin ? "Revisa la oferta actual de tu inmobiliaria antes de gestionarla." : "Revisa los proyectos asignados para preparar cada conversación comercial."}</p>
        </div>
        {isAdmin && <button type="button" className="secondary-button" onClick={onManageCatalog}>Gestionar catálogo</button>}
      </header>

      {error && <div className="error-message">{error}</div>}
      {loading ? <div className="projects-workspace__loading"><span></span><span></span><span></span></div> : !projects.length ? (
        <div className="admin-surface empty-state"><strong>No hay proyectos disponibles en esta vista.</strong><p>{isAdmin ? "Crea proyectos desde el catálogo para verlos aquí." : "Tu administrador debe asignarte al menos un proyecto."}</p></div>
      ) : (
        <div className="projects-workspace__layout">
          <div className="projects-workspace__rail" aria-label="Lista de proyectos">
            <div className="projects-workspace__rail-head"><span>{projects.length} proyecto{projects.length === 1 ? "" : "s"}</span></div>
            {projects.map((project) => (
              <button type="button" key={project.id} className={`project-rail-card ${String(project.id) === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(String(project.id))} aria-pressed={String(project.id) === selectedId}>
                <span className={`status-pill ${estadoProyectoPillClass[project.estado] || ""}`}>{estadoProyectoLabels[project.estado] || project.estado}</span>
                <strong>{project.nombre}</strong>
                <small>{project.comuna} · {formatUfRange(project)}</small>
              </button>
            ))}
          </div>

          {selectedProject && <article className="project-dossier">
            <div className="project-dossier__topline"><span className="eyebrow">Proyecto seleccionado</span><span className={`status-pill ${estadoProyectoPillClass[selectedProject.estado] || ""}`}>{estadoProyectoLabels[selectedProject.estado] || selectedProject.estado}</span></div>
            <h2>{selectedProject.nombre}</h2>
            {selectedProject.descripcion && <p className="project-dossier__description">{selectedProject.descripcion}</p>}
            <dl className="project-dossier__facts">
              <div><dt>Comuna</dt><dd>{selectedProject.comuna || "Sin dato"}</dd></div>
              <div><dt>Tipo</dt><dd>{tipoProyectoLabels[selectedProject.tipo] || selectedProject.tipo || "Sin dato"}</dd></div>
              <div><dt>Rango de precio</dt><dd>{formatUfRange(selectedProject)}</dd></div>
              <div><dt>Entrega estimada</dt><dd>{formatDelivery(selectedProject.entrega_estimada)}</dd></div>
            </dl>
            {isAdmin && <div className="project-dossier__coverage"><span className="eyebrow">Cobertura comercial</span><strong>{selectedProject.ejecutivos?.length || 0} ejecutivo{selectedProject.ejecutivos?.length === 1 ? "" : "s"} vinculado{selectedProject.ejecutivos?.length === 1 ? "" : "s"}</strong>{selectedProject.ejecutivos?.length > 0 && <p>{selectedProject.ejecutivos.map((item) => item.nombre || item.email).join(" · ")}</p>}</div>}
          </article>}
        </div>
      )}
    </section>
  );
}
