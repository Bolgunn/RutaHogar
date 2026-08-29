function preserveCase(match, replacement) {
  if (!match) return replacement;
  return match[0] === match[0].toUpperCase()
    ? `${replacement[0].toUpperCase()}${replacement.slice(1)}`
    : replacement;
}

const WORD_FIXES = [
  [/\bAun\b/g, "Aún"],
  [/\baun\b/g, "aún"],
  [/\bpreevaluacion(es)?\b/gi, (match) => preserveCase(match, match.toLowerCase().endsWith("es") ? "preevaluaciones" : "preevaluación")],
  [/\bevaluacion(es)?\b/gi, (match) => preserveCase(match, match.toLowerCase().endsWith("es") ? "evaluaciones" : "evaluación")],
  [/\bsituacion(es)?\b/gi, (match) => preserveCase(match, match.toLowerCase().endsWith("es") ? "situaciones" : "situación")],
  [/\binformacion\b/gi, (match) => preserveCase(match, "información")],
  [/\bantiguedad\b/gi, (match) => preserveCase(match, "antigüedad")],
  [/\bpodria\b/gi, (match) => preserveCase(match, "podría")],
  [/\bproximos\b/gi, (match) => preserveCase(match, "próximos")],
  [/\bmas\b/gi, (match) => preserveCase(match, "más")],
  [/\bsolida\b/gi, (match) => preserveCase(match, "sólida")],
  [/\bseria\b/gi, (match) => preserveCase(match, "sería")],
  [/\bmanten\b/gi, (match) => preserveCase(match, "mantén")],
  [/\bevalua\b/gi, (match) => preserveCase(match, "evalúa")],
  [/\benfocate\b/gi, (match) => preserveCase(match, "enfócate")],
  [/\bcredito\b/gi, (match) => preserveCase(match, "crédito")],
  [/\bdigitos\b/gi, (match) => preserveCase(match, "dígitos")],
  [/\btelefono\b/gi, (match) => preserveCase(match, "teléfono")],
  [/\bConyuge\b/g, "Cónyuge"],
];

export function normalizeDisplayText(value) {
  if (value == null) return "";

  let text = String(value)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\s*[,;:]+\s*/g, "$1 ")
    .replace(/[,;:]+\s*([.!?])/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/([,;:])\s*([,.;:!?])/g, "$2")
    .replace(/([.!?])\s*\1+/g, "$1")
    .replace(/([,;:])\s*\1+/g, "$1")
    .replace(/([.!?])(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, "$1 ")
    .trim();

  WORD_FIXES.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text;
}

export function normalizeDisplayList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === "string") return normalizeDisplayText(item);
      if (item && typeof item === "object" && item.text) {
        return { ...item, text: normalizeDisplayText(item.text), benefit: item.benefit ? item.benefit : null };
      }
      return item;
    })
    .filter(Boolean);
}

export function normalizeImprovementPlan(items) {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => {
    if (typeof item === 'string') {
      return {
        category: "General",
        description: normalizeDisplayText(item),
        impact_level: "Medio",
        impact_score: 2,
        expected_benefit: "Mejora general para tu perfil."
      };
    }
    if (item && typeof item === 'object') {
      return {
        ...item,
        description: normalizeDisplayText(item.description),
        expected_benefit: normalizeDisplayText(item.expected_benefit)
      };
    }
    return null;
  }).filter(Boolean);
}

// Prefijos con los que el backend marcaba errores de IA en versiones
// anteriores. Se tratan como "sin contenido" para que nunca se muestren.
const AI_ERROR_PREFIXES = ["error ia:", "error:", "resumen ia no disponible"];

export function hasUsableAiText(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return !AI_ERROR_PREFIXES.some((prefix) =>
    text.toLowerCase().startsWith(prefix)
  );
}

// Devuelve el texto si es utilizable; de lo contrario, cadena vacía.
export function sanitizeAiText(value) {
  return hasUsableAiText(value) ? String(value) : "";
}
