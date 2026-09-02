import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { buildSimulationContext, DEFAULT_UF_CLP } from "../lib/simulation/compatibility";
import { catalogProjectsToSimulation, formatProjectPrice } from "../lib/simulation/projectAdapter";
import { getAvailableProjects } from "../services/projectService";
import { addFavorite, getFavorites, removeFavorite } from "../services/favoritesService";

export default function ProjectsCatalog({ evaluationBase, onboarding, userId, contactEmail, onBack, onSetGoal, onStartEvaluation }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [favoritesError, setFavoritesError] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    let active = true;
    getAvailableProjects()
      .then((rows) => { if (active) setProjects(catalogProjectsToSimulation(rows)); })
      .catch((cause) => { if (active) setError(cause.message || "No se pudo cargar el catálogo de proyectos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setFavorites([]);
    setFavoritesError("");
    if (!userId) return undefined;
    getFavorites(userId).then((ids) => { if (active) setFavorites(ids); }).catch((cause) => {
      if (active) setFavoritesError(cause.message || "No se pudieron cargar tus favoritos.");
    });
    return () => { active = false; };
  }, [userId]);

  const toggleFavorite = useCallback(async (projectId) => {
    if (!userId) return false;
    const wasFavorite = favorites.includes(projectId);
    setFavoritesError("");
    setFavorites((current) => wasFavorite ? current.filter((id) => id !== projectId) : current.includes(projectId) ? current : [...current, projectId]);
    try {
      if (wasFavorite) await removeFavorite(userId, projectId);
      else await addFavorite(userId, projectId);
      return true;
    } catch (cause) {
      setFavorites((current) => wasFavorite ? current.includes(projectId) ? current : [...current, projectId] : current.filter((id) => id !== projectId));
      setFavoritesError(cause.message || "No se pudo actualizar tus favoritos.");
      return false;
    }
  }, [favorites, userId]);

  const context = useMemo(() => evaluationBase ? buildSimulationContext(evaluationBase, onboarding) : null, [evaluationBase, onboarding]);
  const ufValueClp = Number(context?.uf_value_clp) || DEFAULT_UF_CLP;
  const catalogFavorites = useMemo(() => projects.filter((project) => favorites.includes(project.id)), [favorites, projects]);
  const visibleProjects = showFavoritesOnly ? catalogFavorites : projects;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  return <section className="section-block projects-catalog-page">
    <header className="projects-catalog-header">
      <div className="section-heading">
        <span className="eyebrow">Catálogo habitacional</span>
        <h1>Proyectos para explorar</h1>
        <p>Compara alternativas disponibles y revisa cómo se relacionan con tu evaluación financiera referencial.</p>
      </div>
      <div className="projects-catalog-header__actions">
        {onBack && <button type="button" className="secondary-button compact-button" onClick={onBack}>Volver al plan</button>}
        <label className="projects-catalog-favorites"><input type="checkbox" checked={showFavoritesOnly} onChange={(event) => setShowFavoritesOnly(event.target.checked)} /><span>Solo favoritos <strong>{catalogFavorites.length}</strong></span></label>
      </div>
    </header>
    {favoritesError && <div className="warning-note">{favoritesError}</div>}
    {loading ? <div className="admin-compact-empty"><strong>Cargando proyectos disponibles...</strong></div> : error ? (
      <div className="admin-compact-empty"><strong>{error}</strong><button type="button" className="secondary-button compact-button" onClick={() => window.location.reload()}>Reintentar</button></div>
    ) : !visibleProjects.length ? (
      <div className="admin-compact-empty"><strong>{showFavoritesOnly ? "Aún no guardas proyectos favoritos." : "No hay proyectos disponibles."}</strong><p>{showFavoritesOnly ? "Quita este filtro para volver al catálogo completo." : "Vuelve más tarde para revisar nuevas alternativas."}</p></div>
    ) : (
      <div className="projects-catalog-grid">
        {visibleProjects.map((project) => <article className="project-catalog-card" key={project.id}>
          <div className="project-catalog-card__top"><span>{project.tipo_vivienda || "Proyecto"}</span>{favorites.includes(project.id) && <strong>Guardado</strong>}</div>
          <div className="project-catalog-card__body">
            <p className="project-catalog-card__location">{project.comuna || "Comuna sin dato"}</p>
            <h2>{project.nombre}</h2>
            <p>{project.inmobiliaria || "Inmobiliaria"}</p>
            <strong className="project-catalog-card__price">{formatProjectPrice(project)}</strong>
            <span className="project-catalog-card__range">{project.precio_max_uf !== project.precio_min_uf ? `Hasta ${project.precio_max_uf} UF` : "Precio referencial"}</span>
            <p className="project-catalog-card__description">{project.descripcion_corta || "Revisa su compatibilidad con tu evaluación y define si quieres incorporarlo a tu plan."}</p>
            {userId && <button type="button" className="text-button" aria-pressed={favorites.includes(project.id)} onClick={() => toggleFavorite(project.id)}>{favorites.includes(project.id) ? "Quitar de favoritos" : "Guardar en favoritos"}</button>}
            <button type="button" className="primary-button" onClick={() => context ? setSelectedProjectId(project.id) : onStartEvaluation?.()}>{context ? "Revisar compatibilidad" : "Evaluar"}</button>
          </div>
        </article>)}
      </div>
    )}
    {selectedProject && context && <ProjectEvaluationModal project={selectedProject} projects={projects} context={context} ufValueClp={ufValueClp} onboarding={onboarding} contactEmail={contactEmail} onClose={() => setSelectedProjectId("")} onSelectProject={setSelectedProjectId} onSetGoal={onSetGoal} onToggleFavorite={toggleFavorite} isFavorite={favorites.includes(selectedProject.id)} />}
  </section>;
}
