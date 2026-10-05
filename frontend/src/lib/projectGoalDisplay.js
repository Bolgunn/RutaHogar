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
