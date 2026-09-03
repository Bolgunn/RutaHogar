import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { buildSimulationContext, DEFAULT_UF_CLP } from "../lib/simulation/compatibility";
import { catalogProjectsToSimulation, formatDeliveryMonth, formatProjectPrice } from "../lib/simulation/projectAdapter";
import { getAvailableProjects } from "../services/projectService";
import { addFavorite, getFavorites, removeFavorite } from "../services/favoritesService";

function ProjectsCarousel({ children }) {
  const stripRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows]);

  const scrollByPage = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 280) * direction;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className={`simulation-carousel projects-catalog-carousel-shell ${canPrev ? "has-prev" : ""} ${canNext ? "has-next" : ""}`}>
      <button
        type="button"
        className="simulation-carousel-arrow is-left"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label="Ver proyectos anteriores"
      >
        <i className="ti ti-chevron-left" aria-hidden="true" />
      </button>
      <div className="simulation-carousel-strip projects-catalog-carousel-strip" ref={stripRef}>
        {children}
      </div>
      <button
        type="button"
        className="simulation-carousel-arrow is-right"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label="Ver proyectos siguientes"
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ProjectsCatalog({ evaluationBase, onboarding, userId, contactEmail, onBack, onSetGoal, onStartEvaluation, onNavigate }) {
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
  const availabilityLabel = (status) => status === "en_construccion" ? "En construcción" : status === "disponible" ? "Disponible" : status || "Sin estado";

  const handleSimulateProject = (project) => {
    if (!context) {
      onStartEvaluation?.();
      return;
    }
    onNavigate?.("simulation", { projectId: project.id });
  };

  return <section className="section-block simulation-panel projects-catalog-page">
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

        </div>
        <ProjectsCarousel>
          {visibleProjects.map((project) => {
            const isFavorite = favorites.includes(project.id);
            return (
          <article className={`project-catalog-card ${isFavorite ? "is-favorite" : ""}`} key={project.id}>
          {userId && (
            <button
              type="button"
              className={`project-catalog-favorite-button ${isFavorite ? "is-active" : ""}`}
              aria-label={isFavorite ? "Quitar de favoritos" : "Guardar favorito"}
              aria-pressed={isFavorite}
              title={isFavorite ? "Quitar de favoritos" : "Guardar favorito"}
              onClick={() => toggleFavorite(project.id)}
            >
              <i className={`ti ${isFavorite ? "ti-star-filled" : "ti-star"}`} aria-hidden="true" />
            </button>
          )}
          <div className="project-catalog-card__top"><span>{project.tipo_vivienda || "Proyecto"}</span></div>
          <div className="project-catalog-card__body">
            <p className="project-catalog-card__location">{project.comuna || "Comuna sin dato"}</p>
            <h2>{project.nombre}</h2>
            <div className="project-catalog-card__meta"><span className={`project-catalog-card__status is-${project.estado || "unknown"}`}>{availabilityLabel(project.estado)}</span>{formatDeliveryMonth(project.entrega_estimada) && <span>Entrega {formatDeliveryMonth(project.entrega_estimada)}</span>}</div>
            <strong className="project-catalog-card__price">{formatProjectPrice(project)}</strong>
            <span className="project-catalog-card__range">{project.precio_max_uf !== project.precio_min_uf ? `Hasta ${project.precio_max_uf} UF` : "Precio referencial"}</span>
            <p className="project-catalog-card__description">{project.descripcion_corta || "Revisa su compatibilidad con tu calificación y define si quieres incorporarlo a tu plan."}</p>
            {context ? (
              <div className="project-catalog-card__actions">
                <button type="button" className="primary-button compact-button" onClick={() => setSelectedProjectId(project.id)}>Revisar compatibilidad</button>
                <button type="button" className="secondary-button compact-button" onClick={() => handleSimulateProject(project)}>Simular</button>
              </div>
            ) : (
              <button type="button" className="primary-button" onClick={() => onStartEvaluation?.()}>Evaluar</button>
            )}
          </div>
          </article>
            );
          })}
        </ProjectsCarousel>
      </section>}
    </>}
    {selectedProject && context && <ProjectEvaluationModal project={selectedProject} projects={projects} context={context} ufValueClp={ufValueClp} onboarding={onboarding} contactEmail={contactEmail} onClose={() => setSelectedProjectId("")} onSelectProject={setSelectedProjectId} onSetGoal={onSetGoal} onNavigate={onNavigate} onToggleFavorite={toggleFavorite} isFavorite={favorites.includes(selectedProject.id)} />}
  </section>;
}
