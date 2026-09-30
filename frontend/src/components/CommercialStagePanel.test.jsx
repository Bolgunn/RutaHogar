import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils/supabase", () => ({ supabase: null }));

const { default: CommercialStagePanel, CommercialStageBadge } = await import("./CommercialStagePanel");
const { changeCommercialStage, getCommercialStageHistory, getCommercialStages } =
  await import("../services/commercialStageService");

describe("CommercialStagePanel without Supabase", () => {
  it("shows a lead without a stage row as new and read-only", () => {
    const html = renderToStaticMarkup(<CommercialStagePanel leadId="lead-1" role="ejecutivo" />);

    expect(html).toContain("Nuevo");
    expect(html).toContain("solo de lectura");
    expect(html).not.toContain("Actualizar etapa");
  });

  it("labels the badge with the stage", () => {
    expect(renderToStaticMarkup(<CommercialStageBadge stage="venta_cerrada" />)).toContain("Venta cerrada");
  });

  it("returns empty reads and refuses writes", async () => {
    await expect(getCommercialStages(["lead-1"])).resolves.toEqual({});
    await expect(getCommercialStageHistory("lead-1")).resolves.toEqual([]);
    await expect(changeCommercialStage({ leadId: "lead-1", toStage: "contactado" })).rejects.toThrow();
  });
});
