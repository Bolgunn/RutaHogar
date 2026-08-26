import { mockProjects } from "../data/mockProjects.js";

const UNAVAILABLE_PROJECT_STATUSES = new Set([
  "agotado",
  "inactivo",
  "no_disponible",
  "no disponible",
]);

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isProjectAvailableForSimulation(project) {
  if (!project) return false;
  return !UNAVAILABLE_PROJECT_STATUSES.has(normalizeStatus(project.estado));
}

export function getSimulationProjects(sourceProjects = mockProjects) {
  return sourceProjects.filter(isProjectAvailableForSimulation);
}

export function getSimulationProjectById(projectId, sourceProjects = mockProjects) {
  return getSimulationProjects(sourceProjects).find((project) => project.id === projectId) || null;
}

export function projectToSimulationScenario(project, ufValueClp) {
  if (!project) return null;
  const valueUf = toNumber(project.valor_uf);
  const valueClp = toNumber(project.valor_clp) || Math.round(valueUf * ufValueClp);

  return {
    id: project.id,
    source: "project",
    label: project.nombre,
    comuna: project.comuna,
    tipo_vivienda: project.tipo_vivienda,
    valueUf,
    valueClp,
    project,
  };
}
