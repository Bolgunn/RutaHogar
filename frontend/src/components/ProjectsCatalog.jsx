import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { buildSimulationContext, DEFAULT_UF_CLP } from "../lib/simulation/compatibility";
import { catalogProjectsToSimulation, formatDeliveryMonth, formatProjectPrice } from "../lib/simulation/projectAdapter";
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
  const [propertyType, setPropertyType] = useState("todos");
  const [commune, setCommune] = useState("");
  const [availability, setAvailability] = useState("todos");
  const [query, setQuery] = useState("");
  const carouselRef = useRef(null);

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
  const communes = useMemo(() => [...new Set(projects.map((project) => project.comuna).filter(Boolean))].sort(), [projects]);
  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CL");
    return projects.filter((project) => {
      const matchesType = propertyType === "todos" || project.tipo_vivienda === propertyType;
      const matchesCommune = !commune || project.comuna === commune;
      const matchesAvailability = availability === "todos" || project.estado === availability;
      const matchesFavorite = !showFavoritesOnly || favorites.includes(project.id);
      const searchable = `${project.nombre} ${project.comuna || ""}`.toLocaleLowerCase("es-CL");
      return matchesType && matchesCommune && matchesAvailability && matchesFavorite && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [availability, commune, favorites, propertyType, projects, query, showFavoritesOnly]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const scrollCarousel = (direction) => carouselRef.current?.scrollBy({ left: direction * Math.max(carouselRef.current.clientWidth * 0.78, 280), behavior: "smooth" });

  const availabilityLabel = (status) => status === "en_construccion" ? "En construcción" : status === "disponible" ? "Disponible" : status || "Sin estado";

  return <section className="section-block projects-catalog-page">
    <header className="projects-catalog-hero">
      <div className="section-heading">
        <span className="eyebrow">Catálogo habitacional</span>
        <h1>Proyectos para explorar</h1>
        <p>Explora alternativas disponibles, ordénalas según tus preferencias y revisa su relación con tu calificación financiera.</p>
      </div>
      <div className="projects-catalog-header__actions">
        {onBack && <button type="button" className="secondary-button compact-button" onClick={onBack}>Volver al plan</button>}
      </div>
    </header>
    {favoritesError && <div className="warning-note">{favoritesError}</div>}
    {loading ? <div className="admin-compact-empty"><strong>Cargando proyectos disponibles...</strong></div> : error ? (
      <div className="admin-compact-empty"><strong>{error}</strong><button type="button" className="secondary-button compact-button" onClick={() => window.location.reload()}>Reintentar</button></div>
    ) : !projects.length ? (
      <div className="admin-compact-empty"><strong>No hay proyectos disponibles.</strong><p>Vuelve más tarde para revisar nuevas alternativas.</p></div>
    ) : <>
      <section className="projects-catalog-discovery" aria-label="Filtros de proyectos">
        <div className="projects-catalog-discovery__top">
          <div className="projects-catalog-type-tabs" role="group" aria-label="Tipo de vivienda">
            {[ ["todos", "Todos"], ["casa", "Casas"], ["departamento", "Departamentos"] ].map(([value, label]) => <button key={value} type="button" className={propertyType === value ? "is-active" : ""} onClick={() => setPropertyType(value)}>{label}</button>)}
          </div>
          <label className="projects-catalog-search"><span>Buscar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o comuna" /></label>
        </div>
        <div className="projects-catalog-filters">
          <label><span>Comuna</span><select value={commune} onChange={(event) => setCommune(event.target.value)}><option value="">Todas las comunas</option>{communes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Disponibilidad</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="todos">Todos los estados</option><option value="disponible">Disponible</option><option value="en_construccion">En construcción</option></select></label>
          <label className="projects-catalog-favorites"><input type="checkbox" checked={showFavoritesOnly} onChange={(event) => setShowFavoritesOnly(event.target.checked)} /><span>Solo favoritos <strong>{catalogFavorites.length}</strong></span></label>
          <p><strong>{visibleProjects.length}</strong> {visibleProjects.length === 1 ? "proyecto encontrado" : "proyectos encontrados"}</p>
        </div>
      </section>
      {!visibleProjects.length ? (
        <div className="admin-compact-empty"><strong>{showFavoritesOnly ? "Aún no guardas proyectos favoritos." : "No encontramos proyectos con esos filtros."}</strong><p>{showFavoritesOnly ? "Quita este filtro para volver al catálogo completo." : "Prueba otra comuna, tipo de vivienda o disponibilidad."}</p></div>
      ) : <section className="projects-catalog-results" aria-labelledby="projects-results-title">
        <div className="projects-catalog-results__heading">
          <div><span className="eyebrow">Explora a tu ritmo</span><h2 id="projects-results-title">Alternativas disponibles</h2></div>
          <div className="projects-catalog-carousel-controls"><button type="button" onClick={() => scrollCarousel(-1)} aria-label="Ver proyectos anteriores">&larr;</button><button type="button" onClick={() => scrollCarousel(1)} aria-label="Ver proyectos siguientes">&rarr;</button></div>
        </div>
        <div className="projects-catalog-carousel" ref={carouselRef}>
          {visibleProjects.map((project) => <article className="project-catalog-card" key={project.id}>
          <div className="project-catalog-card__top"><span>{project.tipo_vivienda || "Proyecto"}</span>{favorites.includes(project.id) && <strong>Guardado</strong>}</div>
          <div className="project-catalog-card__body">
            <p className="project-catalog-card__location">{project.comuna || "Comuna sin dato"}</p>
            <h2>{project.nombre}</h2>
            <div className="project-catalog-card__meta"><span className={`project-catalog-card__status is-${project.estado || "unknown"}`}>{availabilityLabel(project.estado)}</span>{formatDeliveryMonth(project.entrega_estimada) && <span>Entrega {formatDeliveryMonth(project.entrega_estimada)}</span>}</div>
            <strong className="project-catalog-card__price">{formatProjectPrice(project)}</strong>
            <span className="project-catalog-card__range">{project.precio_max_uf !== project.precio_min_uf ? `Hasta ${project.precio_max_uf} UF` : "Precio referencial"}</span>
            <p className="project-catalog-card__description">{project.descripcion_corta || "Revisa su compatibilidad con tu calificación y define si quieres incorporarlo a tu plan."}</p>
            {userId && <button type="button" className="text-button" aria-pressed={favorites.includes(project.id)} onClick={() => toggleFavorite(project.id)}>{favorites.includes(project.id) ? "Quitar de favoritos" : "Guardar en favoritos"}</button>}
            <button type="button" className="primary-button" onClick={() => context ? setSelectedProjectId(project.id) : onStartEvaluation?.()}>{context ? "Revisar compatibilidad" : "Evaluar"}</button>
          </div>
          </article>)}
        </div>
      </section>}
    </>}
    {selectedProject && context && <ProjectEvaluationModal project={selectedProject} projects={projects} context={context} ufValueClp={ufValueClp} onboarding={onboarding} contactEmail={contactEmail} onClose={() => setSelectedProjectId("")} onSelectProject={setSelectedProjectId} onSetGoal={onSetGoal} onToggleFavorite={toggleFavorite} isFavorite={favorites.includes(selectedProject.id)} />}
  </section>;
}
