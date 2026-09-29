import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { DEFAULT_UF_CLP, evaluateScenario, projectToScenario } from "../lib/simulation/compatibility";
import { PROJECT_SIMULATION_DISCLAIMER } from "../lib/simulation/copy";

const project = {
  id: "project-1", nombre: "Parque Central", comuna: "Santiago",
  tipo_vivienda: "departamento", valor_uf: 3000,
  precio_min_uf: 3000, precio_max_uf: 3200,
};

const baseContext = {
  ingreso_mensual: 3000000, deuda_mensual: 100000,
  ahorro_disponible: 600 * DEFAULT_UF_CLP, dividendo_estimado: 600000,
  classification: "Alto", score: 78, uf_value_clp: DEFAULT_UF_CLP,
};

function renderModal(context) {
  return renderToStaticMarkup(<ProjectEvaluationModal
    project={project}
    projects={[]}
    context={context}
    ufValueClp={DEFAULT_UF_CLP}
    onboarding={{}}
    onClose={vi.fn()}
    onToggleFavorite={vi.fn()}
  />);
}

describe("project evaluation modal copy", () => {
  it.each([
    ["compatible", baseContext],
    ["near", { ...baseContext, ahorro_disponible: 400 * DEFAULT_UF_CLP }],
    ["requires adjustment", { ...baseContext, ahorro_disponible: 150 * DEFAULT_UF_CLP }],
  ])("keeps status, metrics and actions without descriptive copy for %s", (_case, context) => {
    const evaluation = evaluateScenario(context, projectToScenario(project, DEFAULT_UF_CLP));
    const html = renderModal(context);

    expect(html).toContain("Parque Central");
    expect(html).toContain("Santiago");
    expect(html).toContain("Departamento");
    expect(html).toContain(evaluation.status);
    expect(html).toContain("Valor desde");
    expect(html).toContain("Pie mínimo");
    expect(html).toContain("Dividendo estimado");
    expect(html).toContain(evaluation.status === "Compatible" ? "Solicitar contacto" : "Guardar en favoritos");
    expect(html).toContain("Usar como meta de mi plan");
    expect(html).not.toContain(evaluation.message);
    expect(html).not.toContain(evaluation.recommendation);
    expect(html).not.toContain(PROJECT_SIMULATION_DISCLAIMER);
  });
});
