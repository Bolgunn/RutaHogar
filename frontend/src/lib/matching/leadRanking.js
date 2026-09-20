// Orden del panel del ejecutivo (HU 10, pasos 8-10). Lógica local de la historia:
// no tiene número de ALG porque no decide afinidad — solo agrupa y ordena filas
// que ALG-10 ya puntuó. Vive en lib/ para poder pinearse en vitest sin montar
// el componente.

import { matchLeadToProjects } from "./leadProjectMatching";

export const SIN_PROYECTO = null;

const capacidadDe = (fila) => fila.match?.evidencia?.capacidad_uf ?? -1;

function ordenarPorAfinidad(a, b) {
  if (b.match.afinidad !== a.match.afinidad) return b.match.afinidad - a.match.afinidad;
  if (capacidadDe(b) !== capacidadDe(a)) return capacidadDe(b) - capacidadDe(a);
  return String(a.lead.id).localeCompare(String(b.lead.id));
}

function ordenarPorCapacidad(a, b) {
  if (capacidadDe(b) !== capacidadDe(a)) return capacidadDe(b) - capacidadDe(a);
  if (b.match.afinidad !== a.match.afinidad) return b.match.afinidad - a.match.afinidad;
  return String(a.lead.id).localeCompare(String(b.lead.id));
}

// Sin proyecto seleccionado el panel se comporta exactamente como HU 2:
// mismas filas, mismo orden, sin evidencia. Está pineado por test.
export function rankLeadsForProject(leads, proyecto, sortBy = "afinidad") {
  const filas = leads || [];
  if (!proyecto) {
    return {
      ranked: filas.map((lead) => ({ lead, match: null })),
      descartados: [],
      requiereAntecedentes: [],
    };
  }

  const ranked = [];
  const descartados = [];
  const requiereAntecedentes = [];

  for (const lead of filas) {
    const { matches, excluidos } = matchLeadToProjects(lead, [proyecto]);
    const match = matches[0] || excluidos[0] || null;
    if (!match) continue;
    if (match.motivo_exclusion === "capacidad_requiere_antecedentes") {
      requiereAntecedentes.push({ lead, match });
    } else if (match.motivo_exclusion) {
      descartados.push({ lead, match });
    } else {
      ranked.push({ lead, match });
    }
  }

  ranked.sort(sortBy === "capacidad" ? ordenarPorCapacidad : ordenarPorAfinidad);
  descartados.sort((a, b) => {
    if (capacidadDe(b) !== capacidadDe(a)) return capacidadDe(b) - capacidadDe(a);
    return String(a.lead.id).localeCompare(String(b.lead.id));
  });

  return { ranked, descartados, requiereAntecedentes };
}
