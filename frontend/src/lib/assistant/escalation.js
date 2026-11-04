/**
 * Escalation detection logic for RutaHogar Virtual Assistant (HU24 - E3).
 *
 * Detects when a user expresses dissatisfaction, confusion, or requests human
 * support to proactively suggest escalating to a support ticket.
 */

const ESCALATION_KEYPHRASES = [
  // Dissatisfaction / Unresolved
  "no me sirvio",
  "no sirvio",
  "no sirve",
  "no me ayuda",
  "no me ayuda en nada",
  "no responde mi pregunta",
  "no entendí nada",
  "no entendi nada",
  "no entiendo nada",
  "sigo con dudas",
  "sigo sin entender",
  "sigo pegado",
  "sigo trabado",
  "no me queda claro",
  "sigue sin quedar claro",
  "no me funciona",
  "es muy confuso",
  "es muy confusa",
  "esta muy confuso",
  "esta muy confusa",
  "muy confuso",
  "muy confusa",
  "sigo pegada",
  "sigo trabada",
  "pésima respuesta",
  "pesima respuesta",
  "mala respuesta",

  // Direct requests for human / support
  "hablar con una persona",
  "hablar con un humano",
  "hablar con alguien",
  "atencion humana",
  "atención humana",
  "ejecutivo humano",
  "persona real",
  "quiero soporte",
  "contactar a soporte",
  "contactar soporte",
  "servicio al cliente",
  "necesito soporte",
  "escalar ticket",
  "crear ticket",
  "abrir ticket",
  "generar ticket",
  "mandar ticket",
  "enviar ticket",
  "ayuda humana",
  "asistencia humana",
];

/**
 * Normalizes text for robust phrase matching (lowercased, accents removed).
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Checks whether user input matches explicit dissatisfaction or human escalation signals.
 * @param {string} text
 * @returns {boolean}
 */
export function isEscalationSignal(text) {
  if (!text) return false;
  const normalized = normalizeText(text);

  return ESCALATION_KEYPHRASES.some((phrase) => {
    const normPhrase = normalizeText(phrase);
    return normalized.includes(normPhrase);
  });
}

/**
 * Determines whether the widget should proactively offer a support ticket.
 *
 * @param {Object} options
 * @param {boolean} [options.suggestEscalation] Flag from backend response
 * @param {boolean} [options.userFeedbackNegative] User clicked "No" on answer feedback
 * @param {string} [options.messageText] Current user message
 * @returns {boolean}
 */
export function shouldOfferEscalation({
  suggestEscalation = false,
  userFeedbackNegative = false,
  messageText = "",
}) {
  if (userFeedbackNegative) return true;
  if (suggestEscalation) return true;
  if (isEscalationSignal(messageText)) return true;
  return false;
}
