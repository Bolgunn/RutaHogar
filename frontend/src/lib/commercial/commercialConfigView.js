// HU 21 — presentación de los criterios comerciales (ALG-19 R0) para la página del administrador.
// Solo etiquetas y formato: los valores permitidos vienen del backend (`opciones`) y la validación
// también; aquí no se re-implementa ninguna regla.

import { matchLeadToProjects } from "../matching/leadProjectMatching";
import { PRIORITY_ACTIONS } from "./priorityActions";

export const CRITERIA_LABELS = {
  "contactar_ahora.clasificaciones": "Contactar ahora · clasificación financiera",
  "contactar_ahora.compatibilidades": "Contactar ahora · compatibilidad con el objetivo",
  "contactar_con_revision.clasificaciones": "Contactar con revisión · clasificación financiera",
  "contactar_con_revision.compatibilidades": "Contactar con revisión · compatibilidad con el objetivo",
  "senales.plazos": "Señales · plazos de compra",
  "senales.propiedad_vista": "Señales · propiedad o proyecto visto",
  subir_con_senales: "Subir a «Contactar ahora» con señales",
  umbral_reorientar: "Score mínimo para reorientar",
  proyectos_prioritarios: "Proyectos prioritarios",
  orden_desempate: "Desempate de la bandeja",
};

const PLAZO_LABELS = {
  inmediato: "Inmediato",
  "3_a_6_meses": "3 a 6 meses",
  "6_a_12_meses": "6 a 12 meses",
};
const SUBIR_LABELS = { 0: "Desactivado", 1: "Con 1 señal", 2: "Con 2 señales" };
const ORDEN_LABELS = { afinidad: "Mejor afinidad", capacidad: "Mayor capacidad de compra" };

export function getCriterion(criterios, key) {
  const [group, leaf] = key.split(".");
  return leaf ? criterios?.[group]?.[leaf] : criterios?.[key];
}

export function setCriterion(criterios, key, value) {
  const [group, leaf] = key.split(".");
  if (!leaf) return { ...criterios, [key]: value };
  return { ...criterios, [group]: { ...criterios[group], [leaf]: value } };
}

export function formatCriterionValue(key, value, projects = []) {
  if (key === "senales.propiedad_vista") return value ? "Sí" : "No";
  if (key === "subir_con_senales") return SUBIR_LABELS[value] ?? String(value);
  if (key === "orden_desempate") return ORDEN_LABELS[value] ?? String(value);
  if (key === "umbral_reorientar") return `${value} puntos`;
  if (key === "proyectos_prioritarios") {
    if (!value?.length) return "Ninguno";
    const names = new Map(projects.map((project) => [String(project.id), project.nombre]));
    return value.map((id) => names.get(String(id)) || "Proyecto no disponible").join(", ");
  }
  if (key === "senales.plazos") return (value || []).map((plazo) => PLAZO_LABELS[plazo] || plazo).join(", ");
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

export function formatCambios(cambios, projects = []) {
  return (cambios || []).map(({ key, before, after }) => ({
    key,
    label: CRITERIA_LABELS[key] || key,
    before: formatCriterionValue(key, before, projects),
    after: formatCriterionValue(key, after, projects),
  }));
}

export function countDeltas(conteos) {
  return Object.keys(PRIORITY_ACTIONS).map((key) => {
    const vigente = conteos?.vigente?.[key] ?? 0;
    const borrador = conteos?.borrador?.[key] ?? 0;
    return { key, label: PRIORITY_ACTIONS[key], vigente, borrador, delta: borrador - vigente };
  });
}

// Afinidad es un algoritmo del frontend (ALG-10), así que este efecto se calcula aquí y no en el preview.
export function priorityProjectsImpact(leads, projects, draftIds) {
  const byId = new Map((projects || []).filter((p) => p.estado !== "agotado").map((p) => [String(p.id), p]));
  return (draftIds || [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((project) => {
      const compatibles = (leads || []).filter((lead) =>
        matchLeadToProjects(lead, [project]).matches.some((match) => match.clasificacion === "Compatible"),
      ).length;
      return {
        proyecto_id: project.id,
        texto: `${compatibles} lead${compatibles === 1 ? "" : "s"} compatible${compatibles === 1 ? "" : "s"} con ${project.nombre} subirá${compatibles === 1 ? "" : "n"} dentro de su nivel`,
        compatibles,
      };
    });
}
