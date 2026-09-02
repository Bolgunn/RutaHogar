import React, { useEffect, useMemo, useState } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { getAvailableProjects } from "../services/projectService";

export default function ProjectsCatalog({ evaluationBase, onBack, onSetGoal }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("scoreleads_favorites")) || []; } catch { return []; }
  });

  useEffect(() => {
    let active = true;
    getAvailableProjects()
      .then((items) => { if (active) setProjects(items); })
      .catch(() => { if (active) setError("No se pudo cargar el catálogo de proyectos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem("scoreleads_favorites", JSON.stringify(favorites)); }, [favorites]);

  const visibleProjects = useMemo(
    () => showFavoritesOnly ? projects.filter((project) => favorites.includes(project.id)) : projects,
    [favorites, projects, showFavoritesOnly],
  );
  const toggleFavorite = (projectId) => setFavorites((current) => current.includes(projectId)
    ? current.filter((id) => id !== projectId)
    : [...current, projectId]);

  return <section className="section-block projects-catalog-page">
    <header className="projects-catalog-header">
      <div className="section-heading">
        <span className="eyebrow">Catálogo habitacional</span>
        <h1>Proyectos para explorar</h1>
        <p>Compara alternativas disponibles y revisa cómo se relacionan con tu evaluación financiera referencial.</p>
      </div>
      <div className="projects-catalog-header__actions">
        {onBack && <button type="button" className="secondary-button compact-button" onClick={onBack}>Volver al plan</button>}
        <label className="projects-catalog-favorites">
          <input type="checkbox" checked={showFavoritesOnly} onChange={(event) => setShowFavoritesOnly(event.target.checked)} />
          <span>Solo favoritos <strong>{favorites.length}</strong></span>
        </label>
      </div>
    </header>

    {loading ? <div className="admin-compact-empty"><strong>Cargando proyectos disponibles...</strong></div> : error ? (
      <div className="admin-compact-empty"><strong>{error}</strong><button type="button" className="secondary-button compact-button" onClick={() => window.location.reload()}>Reintentar</button></div>
    ) : !visibleProjects.length ? (
      <div className="admin-compact-empty"><strong>{showFavoritesOnly ? "Aún no guardas proyectos favoritos." : "No hay proyectos disponibles."}</strong><p>{showFavoritesOnly ? "Quita este filtro para volver al catálogo completo." : "Vuelve más tarde para revisar nuevas alternativas."}</p></div>
    ) : (
      <div className="projects-catalog-grid">
        {visibleProjects.map((project) => <article className="project-catalog-card" key={project.id}>
          <div className="project-catalog-card__top"><span>{project.tipo || "Proyecto"}</span>{favorites.includes(project.id) && <strong>Guardado</strong>}</div>
          <div className="project-catalog-card__body">
            <p className="project-catalog-card__location">{project.comuna || "Comuna sin dato"}</p>
            <h2>{project.nombre}</h2>
            <p>{project.inmobiliaria_nombre || "Inmobiliaria"}</p>
            <strong className="project-catalog-card__price">Desde {project.precio_min_uf} UF</strong>
            <span className="project-catalog-card__range">{project.precio_max_uf && project.precio_max_uf !== project.precio_min_uf ? `Hasta ${project.precio_max_uf} UF` : "Precio referencial"}</span>
            <p className="project-catalog-card__description">{project.descripcion || "Revisa su compatibilidad con tu evaluación y define si quieres incorporarlo a tu plan."}</p>
            <button type="button" className="primary-button" onClick={() => setSelectedProject(project)}>Revisar compatibilidad</button>
          </div>
        </article>)}
      </div>
    )}

    {selectedProject && <ProjectEvaluationModal project={selectedProject} allProjects={projects} evaluationBase={evaluationBase} onClose={() => setSelectedProject(null)} onSetGoal={onSetGoal} onToggleFavorite={toggleFavorite} isFavorite={favorites.includes(selectedProject.id)} />}
  </section>;
}
