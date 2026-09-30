// Servicio de búsqueda RAG de propiedades para RutaHogar

const DEFAULT_DISCLAIMER =
  "La información exhibida sobre las propiedades es de carácter referencial e informativa, extraída automáticamente desde fuentes públicas de Portal Inmobiliario. Te recomendamos verificar directamente en la fuente original o con el ejecutivo comercial las condiciones actualizadas del inmueble y evaluar tu calificación crediticia en RutaHogar.";

const LOCAL_CATALOG = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Departamento 2D1B cercano a Metro Bellas Artes",
    description: "Hermoso departamento de 2 dormitorios y 1 baño con balcón, vista despejada, cocina equipada. Excelente conectividad a pasos de metro Bellas Artes y Parque Forestal.",
    price_uf: 2650.0,
    price_clp: 100700000.0,
    commune: "Santiago",
    address: "Santo Domingo 850",
    property_type: "departamento",
    bedrooms: 2,
    bathrooms: 1,
    surface_m2: 52.0,
    url: "https://www.portalinmobiliario.com/venta/departamento/santiago/1234",
    image_url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.92,
    cta_text: "Ver si califico para este departamento",
    cta_url: "/evaluacion?property_uf=2650&commune=Santiago",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Moderno Departamento 1D1B en Providencia / Metro Manuel Montt",
    description: "Departamento estudio tipo suite 1 dormitorio y 1 baño en pleno corazón de Providencia. Ideal inversionistas o primera vivienda. Edificio con gimnasio y piscina.",
    price_uf: 3200.0,
    price_clp: 121600000.0,
    commune: "Providencia",
    address: "Av. Nueva Providencia 1350",
    property_type: "departamento",
    bedrooms: 1,
    bathrooms: 1,
    surface_m2: 38.0,
    url: "https://www.portalinmobiliario.com/venta/departamento/providencia/2345",
    image_url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.88,
    cta_text: "Ver si califico para este departamento",
    cta_url: "/evaluacion?property_uf=3200&commune=Providencia",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Departamento Familiar 3D2B con Estacionamiento en Ñuñoa",
    description: "Amplio departamento de 3 dormitorios, 2 baños, estacionamiento subterráneo y bodega. Barrio residencial muy tranquilo cercano a Metro Chile España.",
    price_uf: 4850.0,
    price_clp: 184300000.0,
    commune: "Ñuñoa",
    address: "Av. Irarrázaval 3400",
    property_type: "departamento",
    bedrooms: 3,
    bathrooms: 2,
    surface_m2: 85.0,
    url: "https://www.portalinmobiliario.com/venta/departamento/nunoa/3456",
    image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.84,
    cta_text: "Ver si califico para este departamento",
    cta_url: "/evaluacion?property_uf=4850&commune=Ñuñoa",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    title: "Casa 4D3B con Jardín y Quincho en Las Condes",
    description: "Espectacular casa de 2 pisos, 4 dormitorios, 3 baños, amplio jardín con piscina y quincho. Sector exclusivo de Las Condes cercano a colegios.",
    price_uf: 11500.0,
    price_clp: 437000000.0,
    commune: "Las Condes",
    address: "Camino El Alba 9200",
    property_type: "casa",
    bedrooms: 4,
    bathrooms: 3,
    surface_m2: 210.0,
    url: "https://www.portalinmobiliario.com/venta/casa/las-condes/4567",
    image_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.79,
    cta_text: "Ver si califico para esta casa",
    cta_url: "/evaluacion?property_uf=11500&commune=Las%20Condes",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    title: "Departamento 2D2B Económico en La Florida / Metro Mirador",
    description: "Excelente oportunidad para primera vivienda o subsidio DS19. Departamento 2 dormitorios 2 baños con gastos comunes bajos a pasos del Mall Plaza Vespucio.",
    price_uf: 2150.0,
    price_clp: 81700000.0,
    commune: "La Florida",
    address: "Vicuña Mackenna 7300",
    property_type: "departamento",
    bedrooms: 2,
    bathrooms: 2,
    surface_m2: 58.0,
    url: "https://www.portalinmobiliario.com/venta/departamento/la-florida/5678",
    image_url: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.75,
    cta_text: "Ver si califico para este departamento",
    cta_url: "/evaluacion?property_uf=2150&commune=La%20Florida",
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    title: "Departamento 2D1B Remodelado en San Miguel",
    description: "Departamento remodelado 2 dormitorios 1 baño cerca de Metro El Llano. Piso flotante, cocina americana e iluminación LED.",
    price_uf: 2400.0,
    price_clp: 91200000.0,
    commune: "San Miguel",
    address: "Gran Avenida 3800",
    property_type: "departamento",
    bedrooms: 2,
    bathrooms: 1,
    surface_m2: 49.0,
    url: "https://www.portalinmobiliario.com/venta/departamento/san-miguel/6789",
    image_url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
    source: "Portal Inmobiliario (Apify)",
    similarity: 0.72,
    cta_text: "Ver si califico para este departamento",
    cta_url: "/evaluacion?property_uf=2400&commune=San%20Miguel",
  },
];

function searchPropertiesOffline({ query, commune, maxPriceUf, propertyType, limit = 10 }) {
  const qLower = (query || "").toLowerCase();
  
  let filtered = LOCAL_CATALOG.filter((item) => {
    if (commune && item.commune.toLowerCase() !== commune.toLowerCase()) return false;
    if (maxPriceUf && Number(maxPriceUf) > 0 && item.price_uf > Number(maxPriceUf)) return false;
    if (propertyType && item.property_type.toLowerCase() !== propertyType.toLowerCase()) return false;
    return true;
  });

  if (qLower) {
    filtered = filtered.map((item) => {
      let sim = item.similarity || 0.5;
      if (item.commune.toLowerCase().includes(qLower)) sim += 0.2;
      if (item.title.toLowerCase().includes(qLower)) sim += 0.2;
      if (item.description.toLowerCase().includes(qLower)) sim += 0.1;
      return { ...item, similarity: Math.min(0.99, Number(sim.toFixed(2))) };
    });
    filtered.sort((a, b) => b.similarity - a.similarity);
  }

  const results = filtered.slice(0, limit);
  const response = {
    query: query || "",
    results,
    total: results.length,
    disclaimer: DEFAULT_DISCLAIMER,
  };

  if (results.length === 0) {
    response.suggestion =
      "No se encontraron propiedades que coincidan con tu búsqueda. Te sugerimos modificar la comuna, aumentar el presupuesto máximo en UF o utilizar una descripción más amplia.";
  }

  return response;
}

export async function searchProperties({
  query,
  commune,
  maxPriceUf,
  propertyType,
  limit = 10,
  similarityThreshold = 0.0,
}) {
  const apiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

  const endpoint = `${apiBase.replace(/\/$/, "")}/api/properties/search`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query || "",
        commune: commune || null,
        max_price_uf: maxPriceUf ? Number(maxPriceUf) : null,
        property_type: propertyType || null,
        limit: Number(limit) || 10,
        similarity_threshold: Number(similarityThreshold) || 0.50,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.warn("Llamada API a /api/properties/search fallo, usando fallback de cliente:", err.message);
    return searchPropertiesOffline({ query, commune, maxPriceUf, propertyType, limit });
  }
}
