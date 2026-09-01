import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { buildSimulationContext, DEFAULT_UF_CLP } from "../lib/simulation/compatibility";
import {
  catalogProjectsToSimulation,
  formatDeliveryMonth,
  formatProjectPrice,
} from "../lib/simulation/projectAdapter";
import { getAvailableProjects } from "../services/projectService";
import { addFavorite, getFavorites, removeFavorite } from "../services/favoritesService";
import { propertyLabels } from "../constants";
import { estadoProyectoLabels } from "../constants/proyectos";

// Catálogo de proyectos del lead (HU 9).
//
// Antes leía GET /projects de FastAPI, que servía cinco dicts hardcodeados en
// main.py. Eso era una segunda fuente de proyectos —en otro lenguaje— invisible
// para el administrador que mantiene el catálogo. Ahora lee lo mismo que la
// simulación: getAvailableProjects(), traducido al vocabulario de simulación en
// la única frontera que conoce ambos (projectAdapter.js).
export default function ProjectsCatalog({
  evaluationBase,
  onboarding,
  userId,
  onBack,
  onSetGoal,
  onStartEvaluation,
}) {
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
      .then((rows) => {
        if (!active) return;
        setProjects(catalogProjectsToSimulation(rows));
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "No se pudieron cargar los proyectos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!userId) return undefined;

    getFavorites(userId)
      .then((ids) => {
        if (active) setFavorites(ids);
      })
      .catch((err) => {
        if (active) setFavoritesError(err.message || "No se pudieron cargar tus favoritos.");
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // Optimista con rollback: marcar un favorito tiene que sentirse instantáneo,
  // y antes lo era (un setState que no podía fallar). Poner un viaje de red por
  // delante sería una regresión percibida.
  const toggleFavorite = useCallback(
    async (projectId) => {
      if (!userId) return;
      const wasFavorite = favorites.includes(projectId);
      const previous = favorites;

      setFavoritesError("");
      setFavorites(wasFavorite ? favorites.filter((id) => id !== projectId) : [...favorites, projectId]);

      try {
        if (wasFavorite) await removeFavorite(userId, projectId);
        else await addFavorite(userId, projectId);
      } catch (err) {
        setFavorites(previous);
        setFavoritesError(err.message || "No se pudo actualizar tus favoritos.");
      }
    },
    [favorites, userId],
  );

  const context = useMemo(
    () => (evaluationBase ? buildSimulationContext(evaluationBase, onboarding) : null),
    [evaluationBase, onboarding],
  );
  const ufValueClp = Number(context?.uf_value_clp) || DEFAULT_UF_CLP;

  // El contador cuenta favoritos PRESENTES en el catálogo cargado. Un id
  // huérfano —proyecto retirado, o guardado antes de esta versión— no puede
  // anunciar "(3)" sobre una grilla vacía.
  const catalogFavorites = useMemo(
    () => projects.filter((project) => favorites.includes(project.id)),
    [favorites, projects],
  );
  const visibleProjects = showFavoritesOnly ? catalogFavorites : projects;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  if (loading) {
    return (
      <section className="section-block tracking-panel">
        <div className="empty-state">
          <strong>Cargando proyectos...</strong>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section-block tracking-panel">
        <div className="empty-state">
          <strong>{error}</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="section-block tracking-panel" style={{ position: "relative" }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0.5rem 1rem", cursor: "pointer", fontWeight: "600", color: "#475569" }}
        >
          Volver
        </button>
      )}
      <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <span className="eyebrow">Catálogo</span>
          <h1 style={{ margin: "0.25rem 0" }}>Proyectos Inmobiliarios</h1>
          <p style={{ margin: 0 }}>Explora proyectos disponibles y evalúa tu compatibilidad financiera con ellos.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "600", fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={showFavoritesOnly}
            onChange={(event) => setShowFavoritesOnly(event.target.checked)}
          />
          Mostrar solo favoritos ({catalogFavorites.length})
        </label>
      </div>

      {favoritesError && (
        <div className="warning-note" style={{ marginTop: "1rem" }}>
          {favoritesError}
        </div>
      )}

      {!context && projects.length > 0 && (
        <div className="warning-note" style={{ marginTop: "1rem" }}>
          Aún no tienes una preevaluación. Puedes explorar el catálogo, pero para ver tu
          compatibilidad con un proyecto necesitas completarla primero.
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "2rem" }}>
          <strong>Aún no hay proyectos disponibles en el catálogo</strong>
          <p style={{ margin: "0.5rem 0 0 0" }}>
            Cuando una inmobiliaria publique proyectos, aparecerán aquí.
          </p>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "2rem" }}>
          <strong>Todavía no tienes favoritos guardados</strong>
          <p style={{ margin: "0.5rem 0 0 0" }}>
            Marca la estrella de un proyecto para volver a encontrarlo aquí.
          </p>
          <button className="secondary-button" style={{ marginTop: "1rem" }} onClick={() => setShowFavoritesOnly(false)}>
            Ver todo el catálogo
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem", marginTop: "2rem" }}>
          {visibleProjects.map((project) => {
            const isFavorite = favorites.includes(project.id);
            const deliveryMonth = formatDeliveryMonth(project.entrega_estimada);

            return (
              <article
                key={project.id}
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ height: "160px", backgroundColor: "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                  [Imagen del Proyecto]
                </div>

                <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", backgroundColor: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>
                      {propertyLabels[project.tipo_vivienda] || project.tipo_vivienda}
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      {userId && (
                        <button
                          type="button"
                          title={isFavorite ? "Quitar de mis favoritos" : "Guardar en mis favoritos"}
                          aria-label={isFavorite ? "Quitar de mis favoritos" : "Guardar en mis favoritos"}
                          aria-pressed={isFavorite}
                          onClick={() => toggleFavorite(project.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", padding: 0, lineHeight: 1, filter: isFavorite ? "none" : "grayscale(1)", opacity: isFavorite ? 1 : 0.45 }}
                        >
                          ⭐
                        </button>
                      )}
                      <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--color-primary)" }}>
                        {formatProjectPrice(project)}
                      </span>
                    </div>
                  </div>

                  <h3 style={{ margin: "0.25rem 0", fontSize: "1.1rem" }}>{project.nombre}</h3>
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "#64748b" }}>
                    {[project.comuna, estadoProyectoLabels[project.estado] || project.estado, deliveryMonth]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <p style={{ fontSize: "0.9rem", color: "var(--color-neutral-700)", flex: 1, marginBottom: "1rem" }}>
                    {project.descripcion_corta}
                  </p>

                  {context ? (
                    <button
                      className="primary-button"
                      style={{ width: "100%", padding: "0.6rem" }}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      Ver compatibilidad
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      style={{ width: "100%", padding: "0.6rem" }}
                      onClick={onStartEvaluation}
                    >
                      Evaluar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedProject && context && (
        <ProjectEvaluationModal
          project={selectedProject}
          projects={projects}
          context={context}
          ufValueClp={ufValueClp}
          onboarding={onboarding}
          onClose={() => setSelectedProjectId("")}
          onSelectProject={(projectId) => setSelectedProjectId(projectId)}
          onSetGoal={onSetGoal}
          onToggleFavorite={toggleFavorite}
          isFavorite={favorites.includes(selectedProject.id)}
        />
      )}
    </section>
  );
}
