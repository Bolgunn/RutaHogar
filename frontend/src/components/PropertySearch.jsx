import React, { useState, useEffect } from "react";
import { searchProperties } from "../services/propertyService";

export default function PropertySearch({ evaluation, onStartEvaluation, onNavigate }) {
  const [query, setQuery] = useState("");
  const [commune, setCommune] = useState("");
  const [maxPriceUf, setMaxPriceUf] = useState("");
  const [propertyType, setPropertyType] = useState("");
  
  const [resultsLimit, setResultsLimit] = useState(12);
  const [loading, setLoading] = useState(false);
  const [resultsData, setResultsData] = useState(null);
  const [error, setError] = useState("");

  const popularQueries = [
    "Departamento 2 dormitorios en Santiago cerca del metro",
    "Moderno 1D1B en Providencia para inversionista",
    "Departamento 3D2B amplio en Ñuñoa con estacionamiento",
    "Casa con jardín y piscina en Las Condes",
    "Departamento económico en La Florida para primera vivienda"
  ];

  const handleSearch = async (
    overrideQuery = null,
    overrideLimit = null,
    overrideCommune = null,
    overrideMaxPrice = null,
    overridePropertyType = null
  ) => {
    let qToUse = typeof overrideQuery === "string" ? overrideQuery : query;
    if (!qToUse || !qToUse.trim()) {
      qToUse = "departamento";
    }
    const limitToUse = typeof overrideLimit === "number" ? overrideLimit : resultsLimit;
    const communeToUse = overrideCommune !== null ? overrideCommune : commune;
    const maxPriceToUse = overrideMaxPrice !== null ? overrideMaxPrice : (maxPriceUf ? Number(maxPriceUf) : null);
    const typeToUse = overridePropertyType !== null ? overridePropertyType : propertyType;

    setLoading(true);
    setError("");

    try {
      const data = await searchProperties({
        query: qToUse,
        commune: communeToUse,
        maxPriceUf: maxPriceToUse,
        propertyType: typeToUse,
        limit: limitToUse,
      });
      setResultsData(data);
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error al buscar propiedades. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    // Carga inicial de catálogo por defecto
    const initQ = "departamento";
    setQuery(initQ);
    handleSearch(initQ, 12);
  }, []);

  const handleQuickQuery = (q) => {
    setQuery(q);
    handleSearch(q);
  };

  const handleApplyToProperty = (item) => {
    if (onStartEvaluation) {
      onStartEvaluation({
        property_value_uf: item.price_uf,
        property_value_unit: "uf",
        comuna_objetivo: item.commune,
        property_type: item.property_type,
        tiene_propiedad_vista: true
      });
    } else if (onNavigate) {
      onNavigate("evaluate");
    }
  };

  return (
    <div className="property-search-page">
      {/* Encabezado del Portal */}
      <section className="portal-hero">
        <div className="portal-hero-badge">
          <span className="sparkle-icon">✨</span> Búsqueda Inteligente RAG (IA)
        </div>
        <h1>Portal Inmobiliario Inteligente</h1>
        <p className="portal-hero-subtitle">
          Describe lo que buscas en lenguaje natural y encuentra propiedades del catálogo extraído desde Portal Inmobiliario.
          Evalúa en un clic tu compatibilidad financiera con <strong>RutaHogar</strong>.
        </p>

        {/* Buscador de lenguaje natural */}
        <div className="natural-search-box">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input-field"
              placeholder="Ej: Departamento 2 dormitorios en Santiago centro cerca del metro bajo 3000 UF..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              type="button"
              className="primary-button search-action-btn"
              onClick={() => handleSearch()}
              disabled={loading}
            >
              {loading ? "Buscando..." : "Buscar con IA"}
            </button>
          </div>

          {/* Sugerencias de búsqueda rápida */}
          <div className="popular-queries-chips">
            <span className="chips-label">Sugerencias:</span>
            {popularQueries.map((pq, idx) => (
              <button
                key={idx}
                type="button"
                className="query-chip"
                onClick={() => handleQuickQuery(pq)}
              >
                {pq}
              </button>
            ))}
          </div>

          {/* Filtros avanzados secundarios */}
          <div className="advanced-filters-row">
            <div className="filter-group">
              <label>Comuna:</label>
              <select value={commune} onChange={(e) => setCommune(e.target.value)}>
                <option value="">Todas las comunas</option>
                <option value="Santiago">Santiago</option>
                <option value="Providencia">Providencia</option>
                <option value="Ñuñoa">Ñuñoa</option>
                <option value="Las Condes">Las Condes</option>
                <option value="La Florida">La Florida</option>
                <option value="San Miguel">San Miguel</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Tipo de propiedad:</label>
              <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="departamento">Departamento</option>
                <option value="casa">Casa</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Máximo UF:</label>
              <input
                type="number"
                placeholder="Ej: 4000"
                value={maxPriceUf}
                onChange={(e) => setMaxPriceUf(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Cantidad a mostrar:</label>
              <select
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
                <option value={200}>Todos los resultados</option>
              </select>
            </div>

            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => handleSearch()}
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </section>

      {/* Criterio E4: Aviso visible de carácter referencial */}
      <div className="referential-disclaimer-banner" id="referential-disclaimer">
        <div className="disclaimer-icon">ℹ️</div>
        <div className="disclaimer-content">
          <strong>Aviso Importante (Información Referencial):</strong>{" "}
          {resultsData?.disclaimer ||
            "La información exhibida sobre las propiedades es de carácter referencial e informativa, extraída automáticamente desde fuentes públicas de Portal Inmobiliario. Te recomendamos verificar directamente en la fuente original o con el ejecutivo comercial las condiciones actualizadas del inmueble y evaluar tu calificación crediticia en RutaHogar."}
        </div>
      </div>

      {/* Resultados de Búsqueda */}
      <section className="results-section">
        {loading ? (
          <div className="loading-spinner-box">
            <div className="spinner"></div>
            <p>Procesando vector de búsqueda y ordenando por relevancia semántica...</p>
          </div>
        ) : error ? (
          <div className="error-alert">{error}</div>
        ) : resultsData && resultsData.results && resultsData.results.length > 0 ? (
          <>
            <div className="results-header">
              <h2>Resultados encontrados ({resultsData.total})</h2>
              <span className="results-ordering-tag">
                ✓ Ordenados por relevancia semántica (RAG)
              </span>
            </div>

            <div className="properties-grid">
              {resultsData.results.map((prop) => {
                const simPercent = Math.round((prop.similarity || 0.8) * 100);
                return (
                  <article key={prop.id} className="property-card" id={`property-card-${prop.id}`}>
                    <div className="property-card-image-wrap">
                      <img
                        src={prop.image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"}
                        alt={prop.title}
                        className="property-card-img"
                        loading="lazy"
                      />
                      <div className="similarity-badge">
                        🎯 {simPercent}% Relevancia
                      </div>
                      <div className="property-type-tag">
                        {prop.property_type?.toUpperCase() || "DEPARTAMENTO"}
                      </div>
                    </div>

                    <div className="property-card-body">
                      <div className="property-commune-row">
                        <span className="commune-pin">📍 {prop.commune}</span>
                        <span className="source-label">{prop.source || "Portal Inmobiliario"}</span>
                      </div>

                      <h3 className="property-title">{prop.title}</h3>
                      <p className="property-address">{prop.address || prop.commune}</p>

                      <p className="property-description">
                        {prop.description}
                      </p>

                      <div className="property-features">
                        <span className="feature-pill">🛏️ {prop.bedrooms} Dorm.</span>
                        <span className="feature-pill">🚿 {prop.bathrooms} Baños</span>
                        <span className="feature-pill">📐 {prop.surface_m2} m²</span>
                      </div>

                      <div className="property-price-box">
                        <div className="price-uf">{prop.price_uf ? `${prop.price_uf.toLocaleString('es-CL')} UF` : 'Consultar UF'}</div>
                        <div className="price-clp">
                          {prop.price_clp ? `$ ${Math.round(prop.price_clp).toLocaleString('es-CL')}` : ''}
                        </div>
                      </div>

                      {/* Criterios E2 y E3: CTA para evaluar compatibilidad en RutaHogar */}
                      <div className="property-cta-wrapper">
                        <button
                          type="button"
                          className="primary-button property-qualify-btn"
                          onClick={() => handleApplyToProperty(prop)}
                          id={`cta-qualify-${prop.id}`}
                        >
                          ✨ {prop.cta_text || "Ver si califico para este departamento"}
                        </button>

                        {prop.url && (
                          <a
                            href={prop.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="external-link-btn"
                            title="Ver publicación en origen"
                          >
                            Ver en origen ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {resultsData && resultsData.results && resultsData.results.length > 0 && (
              <div className="load-more-container" style={{ display: "flex", justifyContent: "center", marginTop: "24px" }}>
                {resultsData.results.length < resultsData.total ? (
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: "12px 28px", fontWeight: "700" }}
                    onClick={() => {
                      const nextLimit = resultsLimit + 24;
                      setResultsLimit(nextLimit);
                      handleSearch(query || "departamento", nextLimit);
                    }}
                  >
                    📥 Cargar más propiedades (Mostrando {resultsData.results.length} de {resultsData.total})
                  </button>
                ) : (
                  <div className="all-loaded-badge" style={{ padding: "10px 20px", background: "#f1f5f9", borderRadius: "20px", color: "#475569", fontWeight: "700", fontSize: "0.9rem" }}>
                    ✓ Mostrando las {resultsData.total} propiedades encontradas en Supabase
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Criterio E5: Estado de resultados vacíos */
          <div className="empty-results-card" id="empty-results-view">
            <div className="empty-icon">🔍</div>
            <h3>No encontramos propiedades que coincidan</h3>
            <p className="empty-suggestion">
              {resultsData?.suggestion ||
                "No se encontraron propiedades para tu consulta. Te sugerimos modificar restricciones o comuna, ampliar el presupuesto en UF o usar términos más amplios."}
            </p>
            <div className="empty-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setQuery("");
                  setCommune("");
                  setMaxPriceUf("");
                  setPropertyType("");
                  setResultsLimit(12);
                  handleSearch("departamento", 12, "", null, "");
                }}
              >
                Limpiar filtros y ver todo
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
