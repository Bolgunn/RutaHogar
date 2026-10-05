import React, { useState, useEffect, useRef } from "react";
import { searchProperties } from "../services/propertyService";

const POPULAR_QUERIES = [
  "Departamento 2 dormitorios en Santiago cerca del metro",
  "Moderno 1D1B en Providencia para inversionista",
  "Departamento 3D2B amplio en Ñuñoa con estacionamiento",
  "Casa con jardín en Las Condes",
  "Departamento económico en La Florida para primera vivienda",
];

const COMMUNES = [
  "Santiago", "Providencia", "Ñuñoa", "Las Condes",
  "La Florida", "San Miguel", "Vitacura", "Macul",
  "Peñalolén", "Lo Barnechea", "Recoleta", "Estación Central",
];

export default function PropertySearch({ evaluation, onStartEvaluation, onNavigate }) {
  const [query, setQuery] = useState("");
  const [commune, setCommune] = useState("");
  const [maxPriceUf, setMaxPriceUf] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [resultsLimit, setResultsLimit] = useState(12);
  const [loading, setLoading] = useState(false);
  const [resultsData, setResultsData] = useState(null);
  const [error, setError] = useState("");
  const [selectedProperty, setSelectedProperty] = useState(null);
  const searchControllerRef = useRef(null);

  const handleSearch = async (
    overrideQuery = null,
    overrideLimit = null,
    overrideCommune = null,
    overrideMaxPrice = null,
    overridePropertyType = null
  ) => {
    let q = typeof overrideQuery === "string" ? overrideQuery : query;
    if (!q || !q.trim()) q = "departamento";
    const limit = typeof overrideLimit === "number" ? overrideLimit : resultsLimit;
    const com = overrideCommune !== null ? overrideCommune : commune;
    const price = overrideMaxPrice !== null ? overrideMaxPrice : (maxPriceUf ? Number(maxPriceUf) : null);
    const type = overridePropertyType !== null ? overridePropertyType : propertyType;

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const data = await searchProperties({ query: q, commune: com, maxPriceUf: price, propertyType: type, limit, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResultsData(data);
    } catch (err) {
      // Una búsqueda reemplazada por otra más nueva no es un error para el usuario.
      if (controller.signal.aborted) return;
      console.error(err);
      setResultsData(null);
      setError(
        err?.name === "TimeoutError"
          ? "El buscador está tardando más de lo esperado. Intenta nuevamente en unos segundos."
          : "No fue posible conectar con el buscador. Verifica tu conexión e intenta nuevamente.",
      );
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    handleSearch("departamento", 12);
    return () => searchControllerRef.current?.abort();
  }, []);

  const handleQuickQuery = (q) => {
    setQuery(q);
    handleSearch(q);
  };

  const handleApplyToProperty = (item) => {
    if (onStartEvaluation) {
      onStartEvaluation({
        valor_uf: item.price_uf,
        comuna: item.commune,
        nombre: item.title,
      });
    } else if (onNavigate) {
      onNavigate("evaluate");
    }
  };

  const handleClearFilters = () => {
    setQuery("");
    setCommune("");
    setMaxPriceUf("");
    setPropertyType("");
    setResultsLimit(12);
    handleSearch("departamento", 12, "", null, "");
  };

  return (
    <div className="portal-page">

      {/* Encabezado */}
      <header className="portal-page__header">
        <div className="portal-page__header-text">
          <span className="eyebrow">Busqueda RAG — Inteligencia Artificial</span>
          <h1>Portal Inmobiliario</h1>
          <p className="portal-page__subtitle">
            Describe en lenguaje natural la propiedad que buscas. El motor semántico
            encuentra las coincidencias mas relevantes del catalogo y te permite
            evaluar tu compatibilidad financiera con RutaHogar.
          </p>
        </div>
      </header>

      {/* Buscador */}
      <section className="portal-search-section">
        <div className="portal-search-box">
          <div className="portal-search-input-row">
            <svg className="portal-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              id="portal-query-input"
              type="text"
              className="portal-search-input"
              placeholder="Ej: Departamento 2 dormitorios en Santiago bajo 3000 UF..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              aria-label="Consulta de búsqueda en lenguaje natural"
            />
            <button
              type="button"
              className="primary-button portal-search-btn"
              onClick={() => handleSearch()}
              disabled={loading}
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>

          <div className="portal-suggestions-row">
            <span className="portal-suggestions-label">Sugerencias:</span>
            <div className="portal-suggestions-list">
              {POPULAR_QUERIES.map((pq, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="portal-suggestion-chip"
                  onClick={() => handleQuickQuery(pq)}
                >
                  {pq}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="portal-filters-row">
          <div className="portal-filter-group">
            <label htmlFor="portal-filter-commune">Comuna</label>
            <select
              id="portal-filter-commune"
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
            >
              <option value="">Todas las comunas</option>
              {COMMUNES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="portal-filter-group">
            <label htmlFor="portal-filter-type">Tipo de propiedad</label>
            <select
              id="portal-filter-type"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              <option value="departamento">Departamento</option>
              <option value="casa">Casa</option>
            </select>
          </div>

          <div className="portal-filter-group">
            <label htmlFor="portal-filter-price">Maximo UF</label>
            <input
              id="portal-filter-price"
              type="number"
              placeholder="Ej: 4000"
              value={maxPriceUf}
              onChange={(e) => setMaxPriceUf(e.target.value)}
            />
          </div>

          <div className="portal-filter-group">
            <label htmlFor="portal-filter-limit">Resultados</label>
            <select
              id="portal-filter-limit"
              value={resultsLimit}
              onChange={(e) => {
                const newLimit = Number(e.target.value);
                setResultsLimit(newLimit);
                handleSearch(null, newLimit);
              }}
            >
              <option value={12}>12 resultados</option>
              <option value={24}>24 resultados</option>
              <option value={48}>48 resultados</option>
              <option value={100}>100 resultados</option>
            </select>
          </div>

          <button
            type="button"
            className="secondary-button portal-filter-apply-btn"
            onClick={() => handleSearch()}
          >
            Aplicar filtros
          </button>
        </div>
      </section>

      {/* Aviso referencial */}
      <div className="portal-disclaimer" role="note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          <strong>Informacion referencial.</strong>{" "}
          {resultsData?.disclaimer ||
            "Los datos exhibidos provienen de fuentes publicas de Portal Inmobiliario y son de caracter informativo. Verifica condiciones actualizadas directamente con la fuente o con el ejecutivo comercial antes de tomar decisiones financieras."}
        </span>
      </div>

      {/* Resultados */}
      <section className="portal-results-section">
        {loading ? (
          <div className="portal-loading-state">
            <div className="portal-spinner" aria-hidden="true" />
            <p>Procesando consulta semantica...</p>
          </div>
        ) : error ? (
          <div className="portal-error-state" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        ) : resultsData?.results?.length > 0 ? (
          <>
            <div className="portal-results-header">
              <h2 className="portal-results-title">
                {resultsData.total} propiedades encontradas
              </h2>
              <span className="portal-results-tag">Ordenados por relevancia semantica</span>
            </div>

            <div className="portal-properties-grid">
              {resultsData.results.map((prop) => {
                const simPercent = Math.round((prop.similarity || 0.8) * 100);
                return (
                  <article 
                    key={prop.id} 
                    className="portal-property-card" 
                    id={`property-card-${prop.id}`}
                    onClick={(e) => {
                      if (!e.target.closest('.portal-card-actions')) {
                        setSelectedProperty(prop);
                      }
                    }}
                  >
                    <div className="portal-card-image-wrap">
                      <img
                        src={prop.image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80"}
                        alt={prop.title}
                        className="portal-card-img"
                        loading="lazy"
                      />
                      <span className="portal-relevance-badge">{simPercent}% relevancia</span>
                      <span className="portal-type-tag">{prop.property_type?.toUpperCase() || "DEPARTAMENTO"}</span>
                    </div>

                    <div className="portal-card-body">
                      <div className="portal-card-meta-row">
                        <span className="portal-commune-label">{prop.commune}</span>
                        <span className="portal-source-label">{prop.source || "Portal Inmobiliario"}</span>
                      </div>

                      <h3 className="portal-card-title">{prop.title}</h3>
                      {prop.address && (
                        <p className="portal-card-address">{prop.address}</p>
                      )}

                      <p className="portal-card-description">{prop.description}</p>

                      <div className="portal-card-features">
                        {prop.bedrooms != null && (
                          <span className="portal-feature-tag">{prop.bedrooms} dorm.</span>
                        )}
                        {prop.bathrooms != null && (
                          <span className="portal-feature-tag">{prop.bathrooms} {prop.bathrooms === 1 ? "bano" : "banos"}</span>
                        )}
                        {prop.surface_m2 != null && (
                          <span className="portal-feature-tag">{prop.surface_m2} m²</span>
                        )}
                      </div>

                      <div className="portal-card-price">
                        <span className="portal-price-uf">
                          {prop.price_uf ? `${prop.price_uf.toLocaleString("es-CL")} UF` : "Consultar precio"}
                        </span>
                        {prop.price_clp && (
                          <span className="portal-price-clp">
                            $ {Math.round(prop.price_clp).toLocaleString("es-CL")}
                          </span>
                        )}
                      </div>

                      <div className="portal-card-actions">
                        <button
                          type="button"
                          className="primary-button portal-qualify-btn"
                          onClick={() => handleApplyToProperty(prop)}
                          id={`cta-qualify-${prop.id}`}
                        >
                          {prop.cta_text || "Ver si califico para esta propiedad"}
                        </button>
                        {prop.url && (
                          <a
                            href={prop.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="portal-external-link"
                          >
                            Ver publicacion original
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {resultsData.results.length < resultsData.total && (
              <div className="portal-load-more">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const nextLimit = resultsLimit + 24;
                    setResultsLimit(nextLimit);
                    handleSearch(query || "departamento", nextLimit);
                  }}
                >
                  Cargar mas propiedades
                  <span className="portal-load-more-count">
                    Mostrando {resultsData.results.length} de {resultsData.total}
                  </span>
                </button>
              </div>
            )}

            {resultsData.results.length >= resultsData.total && (
              <p className="portal-all-loaded">
                Se muestran las {resultsData.total} propiedades que coinciden con tu busqueda.
              </p>
            )}
          </>
        ) : resultsData != null ? (
          <div className="empty-state" id="empty-results-view">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <strong>Sin resultados para esta busqueda</strong>
            <p>
              {resultsData?.suggestion ||
                "Intenta con terminos mas amplios, cambia la comuna o aumenta el presupuesto en UF."}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={handleClearFilters}
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </section>

      {/* Modal de Detalle de Propiedad */}
      {selectedProperty && (
        <div className="portal-modal-overlay" onClick={() => setSelectedProperty(null)}>
          <div className="portal-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="portal-modal-close" 
              onClick={() => setSelectedProperty(null)}
              aria-label="Cerrar detalles"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            
            <div className="portal-modal-image-container">
              <img 
                src={selectedProperty.image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80"} 
                alt={selectedProperty.title}
                className="portal-modal-image"
              />
              <div className="portal-modal-badge">{selectedProperty.property_type?.toUpperCase() || "DEPARTAMENTO"}</div>
            </div>

            <div className="portal-modal-body">
              <div className="portal-modal-header-info">
                <span className="portal-modal-commune">📍 {selectedProperty.commune}</span>
                <span className="portal-modal-source">{selectedProperty.source || "Portal Inmobiliario"}</span>
              </div>
              
              <h2 className="portal-modal-title">{selectedProperty.title}</h2>
              {selectedProperty.address && (
                <p className="portal-modal-address">{selectedProperty.address}</p>
              )}

              <div className="portal-modal-price-box">
                <div className="portal-modal-price-uf">
                  {selectedProperty.price_uf ? `${selectedProperty.price_uf.toLocaleString("es-CL")} UF` : "Consultar precio"}
                </div>
                {selectedProperty.price_clp && (
                  <div className="portal-modal-price-clp">
                    $ {Math.round(selectedProperty.price_clp).toLocaleString("es-CL")}
                  </div>
                )}
              </div>

              <div className="portal-modal-features">
                {selectedProperty.bedrooms != null && (
                  <div className="portal-modal-feature">
                    <span className="feature-icon">🛏️</span>
                    <span className="feature-value">{selectedProperty.bedrooms}</span>
                    <span className="feature-label">Dormitorios</span>
                  </div>
                )}
                {selectedProperty.bathrooms != null && (
                  <div className="portal-modal-feature">
                    <span className="feature-icon">🚿</span>
                    <span className="feature-value">{selectedProperty.bathrooms}</span>
                    <span className="feature-label">Baños</span>
                  </div>
                )}
                {selectedProperty.surface_m2 != null && (
                  <div className="portal-modal-feature">
                    <span className="feature-icon">📐</span>
                    <span className="feature-value">{selectedProperty.surface_m2}</span>
                    <span className="feature-label">m² útiles</span>
                  </div>
                )}
              </div>

              <div className="portal-modal-description">
                <h3>Descripción</h3>
                <p>{selectedProperty.description}</p>
              </div>

              <div className="portal-modal-actions">
                <button
                  type="button"
                  className="primary-button portal-modal-main-btn"
                  onClick={() => {
                    handleApplyToProperty(selectedProperty);
                    setSelectedProperty(null);
                  }}
                >
                  {selectedProperty.cta_text || "Ver si califico para esta propiedad"}
                </button>
                {selectedProperty.url && (
                  <a
                    href={selectedProperty.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary-button portal-modal-secondary-btn"
                  >
                    Ver en {selectedProperty.source || "Portal Inmobiliario"} ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
