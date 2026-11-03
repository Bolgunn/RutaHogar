/**
 * Pure API client for RutaHogar Virtual Assistant.
 * Connects to /api/assistant/chat with optional Bearer authentication.
 */

export function getAssistantApiBaseUrl() {
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL);

  if (envUrl) {
    return String(envUrl).replace(/\/+$/, "");
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return "http://127.0.0.1:8000";
  }

  return "";
}

/**
 * Sends a message to the assistant chat endpoint.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {Array<{role: string, content: string}>} [params.history]
 * @param {string} [params.screenId]
 * @param {string} [params.fieldId]
 * @param {string|null} [params.token]
 * @param {typeof fetch} [params.customFetch]
 * @returns {Promise<{
 *   answer: string,
 *   tier: string,
 *   sources: string[],
 *   links: Array<{type: string, articleId?: string, url?: string, label: string}>,
 *   action?: {type: string, field_id?: string, step?: number, target?: string, label: string}|null,
 *   suggest_escalation: boolean,
 *   error?: boolean
 * }>}
 */
export async function sendAssistantMessage({
  message,
  history = [],
  screenId = null,
  fieldId = null,
  token = null,
  customFetch = fetch,
}) {
  const text = (message || "").trim();
  if (!text) {
    return {
      answer: "Por favor escribe tu consulta para poder orientarte.",
      tier: "tier0_kb",
      sources: [],
      links: [],
      action: null,
      suggest_escalation: false,
    };
  }

  const baseUrl = getAssistantApiBaseUrl();
  const url = `${baseUrl}/api/assistant/chat`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await customFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: text,
        history: history.slice(-6).map((h) => ({
          role: h.role,
          content: String(h.content || "").slice(0, 300),
        })),
        screen_id: screenId || null,
        field_id: fieldId || null,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }

    const data = await res.json();
    return {
      answer: data.answer || "No pudimos generar una respuesta en este momento.",
      tier: data.tier || "tier0_kb",
      sources: Array.isArray(data.sources) ? data.sources : [],
      links: Array.isArray(data.links) ? data.links : [],
      action: data.action || null,
      suggest_escalation: Boolean(data.suggest_escalation),
    };
  } catch (err) {
    console.error("[assistantClient] Error calling chat:", err);
    return {
      answer:
        "Ocurrió un inconveniente al conectar con el asistente. Puedes intentar nuevamente o revisar directamente las guías de la Academia.",
      tier: "tier2_fallback",
      sources: [],
      links: [
        {
          type: "academy",
          articleId: "credito-1",
          label: "Ver Guía de Crédito Hipotecario",
        },
      ],
      action: null,
      suggest_escalation: true,
      error: true,
    };
  }
}
