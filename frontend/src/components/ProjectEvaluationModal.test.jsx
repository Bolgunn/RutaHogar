import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ProjectEvaluationModal from "./ProjectEvaluationModal";
import { DEFAULT_UF_CLP, evaluateScenario, projectToScenario } from "../lib/simulation/compatibility";
import { PROJECT_SIMULATION_DISCLAIMER } from "../lib/simulation/copy";

const project = {
  id: "project-1", nombre: "Parque Central", comuna: "Santiago",
  tipo_vivienda: "departamento", valor_uf: 3000,
  precio_min_uf: 3000, precio_max_uf: 3200, descripcion: "Departamentos cercanos al centro de Santiago.",
};

const alternativeProject = {
  ...project, id: "project-2", nombre: "Vista Sur", precio_min_uf: 2500, precio_max_uf: 2600, valor_uf: 2500,
};

const baseContext = {
  ingreso_mensual: 3000000, deuda_mensual: 100000,
  ahorro_disponible: 600 * DEFAULT_UF_CLP, dividendo_estimado: 600000,
  classification: "Alto", score: 78, uf_value_clp: DEFAULT_UF_CLP,
};

function renderModal(context, { projects = [], compatibilityStatus } = {}) {
  return renderToStaticMarkup(<ProjectEvaluationModal
    project={project}
    projects={projects}
    context={context}
    ufValueClp={DEFAULT_UF_CLP}
    onboarding={{}}
    compatibilityStatus={compatibilityStatus}
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
    expect(html).toContain(project.descripcion);
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

  it.each(["Compatible", "Cercano"])("uses tracking's %s verdict without local adjustment alternatives", (compatibilityStatus) => {
    const context = { ...baseContext, ahorro_disponible: 150 * DEFAULT_UF_CLP };
    expect(evaluateScenario(context, projectToScenario(project, DEFAULT_UF_CLP)).status).toBe("Requiere ajuste");
    const html = renderModal(
      context,
      { projects: [alternativeProject], compatibilityStatus },
    );

    expect(html).toContain(compatibilityStatus);
    expect(html).not.toContain("Requiere ajuste");
    expect(html).not.toContain("Alternativas para comparar");
    expect(html).not.toContain(alternativeProject.nombre);
  });

  it("keeps local alternatives when tracking did not provide a verdict", () => {
    const html = renderModal(
      { ...baseContext, ahorro_disponible: 150 * DEFAULT_UF_CLP },
      { projects: [alternativeProject] },
    );

    expect(html).toContain("Requiere ajuste");
    expect(html).toContain("Alternativas para comparar");
    expect(html).toContain(alternativeProject.nombre);
  });
});

describe("project evaluation modal for portal listings", () => {
  it("shows compatibility but only links the original listing", () => {
    const html = renderToStaticMarkup(<ProjectEvaluationModal
      project={{ ...project, id: "portal-r-1", origen: "portal", inmobiliaria: "Euro Inmobiliaria", url: "https://www.portalinmobiliario.com/MLC-1" }}
      projects={[]}
      context={baseContext}
      ufValueClp={DEFAULT_UF_CLP}
      onboarding={{}}
      onClose={vi.fn()}
    />);

    expect(html).toContain("Valor desde");
    expect(html).toContain("Ver publicación original");
    expect(html).toContain("https://www.portalinmobiliario.com/MLC-1");
    expect(html).toContain("Euro Inmobiliaria");
    expect(html).not.toContain("Solicitar contacto");
    expect(html).not.toContain("Guardar en favoritos");
    expect(html).not.toContain("Usar como meta de mi plan");
  });
});
