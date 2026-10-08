export function getCurrentProjectGoal(evaluation) {
  const projectGoal = evaluation?.input?.project_goal;
  return projectGoal && typeof projectGoal === "object" && !Array.isArray(projectGoal)
    ? projectGoal
    : null;
}

export function isCurrentProjectGoal(project, projectGoal) {
  if (project?.id === undefined || project?.id === null) return false;
  if (projectGoal?.id === undefined || projectGoal?.id === null) return false;
  return String(project.id) === String(projectGoal.id);
}

// La proyección y "Estado actual" ya traen el veredicto del proyecto objetivo
// desde la evaluación persistida. El catálogo puede usar este adaptador para no
// presentar un segundo estado distinto para ese mismo objetivo.
export function projectCompatibilityLabel(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("es-CL");
  if (normalized === "compatible") return "Compatible";
  if (normalized === "cercano" || normalized === "near") return "Cercano";
  if (["no_compatible", "fuera de alcance", "out_of_reach", "requiere ajuste", "requires_adjustment"].includes(normalized)) {
    return "Requiere ajuste";
  }
  return null;
}
