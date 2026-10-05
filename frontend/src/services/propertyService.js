// Servicio de búsqueda RAG de propiedades para RutaHogar.
// El umbral de similitud vive solo en el backend (DEFAULT_SIMILARITY_THRESHOLD).

const SEARCH_TIMEOUT_MS = 15000;

export async function searchProperties({
  query,
  commune,
  maxPriceUf,
  propertyType,
  limit = 10,
  signal,
}) {
  const apiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

  const endpoint = `${apiBase.replace(/\/$/, "")}/api/properties/search`;

  // Un solo controlador corta tanto por timeout como cuando el componente
  // reemplaza la búsqueda por una más nueva.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), SEARCH_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: query || "",
        commune: commune || null,
        max_price_uf: maxPriceUf ? Number(maxPriceUf) : null,
        property_type: propertyType || null,
        limit: Number(limit) || 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
