import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Subsidios from "../Subsidios";

const eligibleBenefit = {
  type: "FOGAES",
  name: "FOGAES",
  eligible: true,
  conditions_met: ["Vivienda nueva", "Pie mínimo"],
  conditions_not_met: [],
  notes: "Información referencial para tu evaluación.",
  academy_module: "fogaes",
};

const pendingBenefit = {
  type: "DS49",
  name: "DS49",
  eligible: false,
  conditions_met: ["Edad mínima"],
  conditions_not_met: ["Ahorro mínimo", "Grupo familiar acreditado"],
  notes: "Ahorro mínimo. Grupo familiar acreditado. Revisa tu postulación antes de avanzar.",
  academy_module: "ds49",
};

function renderSubsidios(benefits) {
  return renderToStaticMarkup(
    <Subsidios
      evaluation={{
        input: { property_value_source: "project_selection" },
        result: {
          classification: "Alto",
          housing_benefits: {
            summary: "Resultado referencial según tu proyecto.",
            disclaimer: "La evaluación final depende de la entidad correspondiente.",
            applicable_benefits: benefits,
          },
        },
      }}
      onNavigate={vi.fn()}
    />,
  );
}

describe("Subsidios", () => {
  it("muestra los requisitos cumplidos y la acción de un beneficio compatible", () => {
    const html = renderSubsidios([eligibleBenefit]);

    expect(html).toContain("1<small>/1</small>");
    expect(html).toContain("Alternativas compatibles para revisar");
    expect(html).toContain("FOGAES");
    expect(html).toContain("Compatible");
    expect(html).toContain("Cumples 2 requisitos");
    expect(html).toContain("Vivienda nueva");
    expect(html).toContain("Pie mínimo");
    expect(html).toContain("Ver pasos en Academia");
    expect(html).not.toContain("Por revisar");
  });

  it("muestra los requisitos pendientes y la guía para avanzar", () => {
    const html = renderSubsidios([pendingBenefit]);

    expect(html).toContain("0<small>/1</small>");
    expect(html).toContain("Requiere ajustes");
    expect(html).toContain("Cumples 1 requisito");
    expect(html).toContain("Por revisar 2 requisitos");
    expect(html).toContain("Ahorro mínimo");
    expect(html).toContain("Grupo familiar acreditado");
    expect(html).toContain("Ver guía para avanzar");
    expect(html).not.toContain("Ver pasos en Academia");
  });

  it("elimina de las notas los requisitos pendientes ya listados", () => {
    const html = renderSubsidios([pendingBenefit]);

    expect(html).toContain('<p class="benefit-card-notes">Revisa tu postulación antes de avanzar.</p>');
  });

  it("indica cuando ningún beneficio evaluado es compatible", () => {
    const html = renderSubsidios([
      pendingBenefit,
      { ...pendingBenefit, type: "DS1", name: "DS1" },
    ]);

    expect(html).toContain("0<small>/2</small>");
    expect(html).toContain("Sin alternativas compatibles por ahora");
    expect(html).toContain("Revisa los requisitos pendientes para saber qué puedes fortalecer.");
    expect(html).not.toContain("Alternativas compatibles para revisar");
  });
});
