import React, { useState, useEffect } from "react";
import ProjectEvaluationModal from "./ProjectEvaluationModal";

export default function ProjectsCatalog({ evaluationBase, onBack, onSetGoal }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedProject, setSelectedProject] = useState(null);
  
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("scoreleads_favorites")) || [];
    } catch {
      return [];
    }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    localStorage.setItem("scoreleads_favorites", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (projectId) => {
    setFavorites(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  useEffect(() => {
    async function loadProjects() {
      try {
        const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
        const res = await fetch(`${apiBase.replace(/\/$/, "")}/projects`);
        if (!res.ok) throw new Error("Error fetching projects");
        const data = await res.json();
        setProjects(data);
      } catch (err) {
        setError("Error al cargar los proyectos.");
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

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
            onChange={(e) => setShowFavoritesOnly(e.target.checked)} 
          />
          Mostrar solo favoritos ({favorites.length})
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem", marginTop: "2rem" }}>
        {(showFavoritesOnly ? projects.filter(p => favorites.includes(p.id)) : projects).map(project => (
          <article 
            key={project.id} 
            style={{ 
              backgroundColor: "#fff", 
              border: "1px solid #e2e8f0", 
              borderRadius: "12px", 
              overflow: "hidden", 
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* Imagen Mock */}
            <div style={{ height: "160px", backgroundColor: "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              [Imagen del Proyecto]
            </div>
            
            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", backgroundColor: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>
                  {project.tipo}
                </span>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {favorites.includes(project.id) && (
                    <span style={{ fontSize: "0.75rem", backgroundColor: "#fef08a", color: "#854d0e", padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>
                      ⭐ Favorito
                    </span>
                  )}
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--color-primary)" }}>
                    Desde {project.precio_min_uf} UF
                  </span>
                </div>
              </div>
              
              <h3 style={{ margin: "0.25rem 0", fontSize: "1.1rem" }}>{project.nombre}</h3>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "#64748b" }}>{project.comuna} | {project.inmobiliaria_nombre}</p>
              
              <p style={{ fontSize: "0.9rem", color: "var(--color-neutral-700)", flex: 1, marginBottom: "1rem" }}>
                {project.descripcion}
              </p>
              
              <button 
                className="primary-button" 
                style={{ width: "100%", padding: "0.6rem" }}
                onClick={() => setSelectedProject(project)}
              >
                Cotizar / Evaluar
              </button>
            </div>
          </article>
        ))}
      </div>

      {selectedProject && (
        <ProjectEvaluationModal 
          project={selectedProject}
          allProjects={projects}
          evaluationBase={evaluationBase}
          onClose={() => setSelectedProject(null)}
          onSetGoal={onSetGoal}
          onToggleFavorite={toggleFavorite}
          isFavorite={favorites.includes(selectedProject.id)}
        />
      )}
    </section>
  );
}
