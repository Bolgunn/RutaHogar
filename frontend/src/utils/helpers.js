export function formatScore(score, fallback = null) {
  if (!Number.isFinite(Number(score))) return fallback;
  const rounded = Math.round(Number(score) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function normalizeClassification(classification) {
  return String(classification || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getClassificationTone(classification) {
  const normalized = normalizeClassification(classification);
  if (normalized === "alto") return "high";
  if (normalized === "medio") return "medium";
  if (normalized === "bajo") return "low";
  return "neutral";
}

export function getBaseClassificationFromScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return "Sin clasificación";
  if (numericScore >= 75) return "Alto";
  if (numericScore >= 50) return "Medio";
  return "Bajo";
}

export function getBaseClassification(resultOrScore = {}) {
  if (resultOrScore && typeof resultOrScore === "object") {
    return resultOrScore.original_classification || getBaseClassificationFromScore(resultOrScore.score);
  }
  return getBaseClassificationFromScore(resultOrScore);
}

export function getScoreToneByScore(score) {
  const baseClassification = getBaseClassificationFromScore(score);
  return getClassificationTone(baseClassification);
}

export function getScoreBadgeClassByScore(score) {
  return `score-${getScoreToneByScore(score)}`;
}

export function getScoreBadgeClass(classification) {
  return `score-${getClassificationTone(classification)}`;
}

export function getClassificationClass(classification) {
  const normalized = normalizeClassification(classification);
  return normalized || "sin-clasificacion";
}

export function getClassificationAdjustment(result = {}) {
  const original = result?.original_classification;
  const final = result?.classification;
  if (!original || !final || original === final) return null;

  const blocker = result?.main_blocker;
  const blockerName =
    blocker?.title ||
    blocker?.code ||
    "antecedentes detectados";
  const baseAdjustment =
    original === "Alto" && final === "Medio"
      ? "Tu puntaje financiero base fue Alto, pero la clasificación final se ajustó por antecedentes detectados."
      : "";

  return {
    blockerName,
    message: `Clasificación ajustada por: ${blockerName}`,
    detail: blocker?.description || baseAdjustment,
  };
}

export function shouldShowClassificationReason(reason, result = {}) {
  if (!reason) return false;
  const normalizedReason = String(reason).toLowerCase();
  if (getClassificationAdjustment(result)) return false;
  if (/bloqueadores\s+profesionales/.test(normalizedReason)) return false;
  return ![
    "clasificación original",
    "clasificacion original",
    "fue ajustada",
    "ajustada por",
  ].some((term) => normalizedReason.includes(term));
}

export function formatClp(value, fallback = "Sin dato") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(numericValue));
}

export function formatBooleanText(value, fallback = "Sin dato") {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return fallback;
}

export function translateSeverity(value) {
  const labels = {
    critical: "Crítica",
    high: "Alta",
    medium: "Media",
    low: "Baja",
    info: "Informativa",
  };
  return labels[String(value || "").toLowerCase()] || value || "Sin dato";
}

export function translatePriority(value) {
  return translateSeverity(value);
}

export function isMonetaryPlanAction(type) {
  return ["increase_savings", "reduce_debt", "adjust_property_goal"].includes(type);
}

export function formatPlanActionMeta(action = {}) {
  const items = [];
  const estimatedMonths = Number(action.estimated_months);
  const gap = Number(action.gap);

  if (isMonetaryPlanAction(action.type) && Number.isFinite(gap) && gap > 0) {
    items.push(`Brecha estimada: ${formatClp(gap)}`);
  }

  if (Number.isFinite(estimatedMonths) && estimatedMonths > 0) {
    items.push(`Tiempo sugerido: ${Math.round(estimatedMonths)} ${Math.round(estimatedMonths) === 1 ? "mes" : "meses"}`);
  }

  return items;
}

export function getUserResultFactors(result = {}) {
  const factors = [];
  if (!result) return factors;
  const seen = new Set();

  const addFactor = (item) => {
    if (!item || typeof item !== "object") return;
    const key = item.code || item.title || item.description;
    if (!key || seen.has(key)) return;
    seen.add(key);
    factors.push({
      title: item.title || item.code || "Antecedente a revisar",
      description: item.description || "",
      severity: item.severity,
    });
  };

  addFactor(result.main_blocker);
  (Array.isArray(result.blockers) ? result.blockers : []).forEach(addFactor);

  const projectFit = result.project_fit;
  if (projectFit && typeof projectFit === "object" && projectFit.classification) {
    const hasGap = Number(projectFit.income_gap) > 0 || Number(projectFit.down_payment_gap) > 0;
    if (hasGap || projectFit.compatible === false) {
      factors.push({
        title: "Compatibilidad con tu objetivo inmobiliario",
        description: "Tu objetivo puede requerir ajustar ahorro, ingreso disponible, plazo o valor de propiedad antes de avanzar.",
      });
    }
  }

  return factors;
}

export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return age;
}
