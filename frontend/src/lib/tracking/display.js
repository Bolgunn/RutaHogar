export function isUpdateDue(lastActiveUpdateAt, asOf) {
  if (!lastActiveUpdateAt) return false;
  return new Date(asOf).getTime() - new Date(lastActiveUpdateAt).getTime() >= 30 * 24 * 60 * 60 * 1000;
}

// Untouched controls are absent. Clearing is distinct from omission and numeric zero.
export function serializePatch(controls) {
  const patch = {};
  for (const [name, control] of Object.entries(controls)) {
    if (!control.touched) continue;
    if (control.clear) {
      if (!control.nullable) throw new Error("Este dato no permite un valor vacío.");
      patch[name] = null;
    } else if (control.type === "number") {
      if (String(control.value).trim() === "" || !Number.isFinite(Number(control.value)))
        throw new Error("Ingresa un número válido.");
      patch[name] = Number(control.value);
    } else if (control.type === "boolean") {
      patch[name] = control.value === true || control.value === "true";
    } else {
      patch[name] = control.value;
    }
  }
  return patch;
}

export function activeSeries(activeLine) {
  return activeLine.map((row) => ({
    id: row.event_id, at: row.effective_at,
    score: row.evaluation?.score ?? null, classification: row.evaluation?.classification ?? null,
    income: row.snapshot.ingreso_mensual, debt: row.snapshot.deuda_mensual, savings: row.snapshot.ahorro_disponible,
  }));
}

export function belongsToSlot(row, rootEventId, auditLine) {
  const byId = new Map(auditLine.map((event) => [event.event_id, event]));
  let current = row;
  while (current?.correction_of) current = byId.get(current.correction_of);
  return current?.event_id === rootEventId;
}

export const displayValue = (value) => value == null ? "Sin datos" :
  typeof value === "number" ? value.toLocaleString("es-CL", { maximumFractionDigits: 2 }) :
  typeof value === "object" ? JSON.stringify(value) : String(value);

function projectSnapshot(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length
    ? value
    : null;
}

// ALG-13 projects against this frozen snapshot. A later evaluation may carry a
// different preference; it is intentionally kept as the latest effective
// antecedent rather than being presented as a replacement for the projection
// target.
export function trackingProjectContext(tracking) {
  const frozenTarget = projectSnapshot(tracking?.baseline?.target_project_snapshot);
  const latestPreference = projectSnapshot(tracking?.latest_effective_snapshot?.project_goal);
  const sameProject = Boolean(frozenTarget && latestPreference
    && (frozenTarget.id ? frozenTarget.id === latestPreference.id : frozenTarget === latestPreference));
  return { frozenTarget, latestPreference, hasDifferentLatestPreference: Boolean(latestPreference && !sameProject) };
}

export const projectName = (project) => project?.nombre || project?.name || project?.id || "Sin proyecto seleccionado";

export const projectionCauses = {
  insufficient_data: "Aún faltan observaciones en al menos dos fechas distintas.",
  missing_project_goal: "El baseline no tiene un proyecto objetivo.",
  incomplete_state: "Faltan antecedentes para ejecutar las reglas.",
  non_projectable_blocker: "Una condición que no se puede proyectar impide la compatibilidad.",
  no_favorable_trend: "No existe una tendencia favorable observada.",
  objective_unreachable: "La tendencia observada no permite alcanzar compatibilidad.",
};
