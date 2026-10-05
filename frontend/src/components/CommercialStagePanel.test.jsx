import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils/supabase", () => ({ supabase: null }));

const { default: CommercialStagePanel, CommercialStageBadge } = await import("./CommercialStagePanel");
const { changeCommercialStage, getCommercialRecords, getCommercialStageHistory, getCommercialStageScope } =
  await import("../services/commercialStageService");

describe("CommercialStagePanel without Supabase", () => {
  it("shows a lead without records as new and read-only", () => {
    const html = renderToStaticMarkup(<CommercialStagePanel leadId="lead-1" role="ejecutivo" />);

    expect(html).toContain("Nuevo");
    expect(html).toContain("Lead (general)");
    expect(html).toContain("solo de lectura");
    expect(html).not.toContain("Actualizar etapa");
  });

  it("labels the badge with the overall stage of the records", () => {
    const records = [
      { proyecto_id: null, stage: "contactado", at: "2026-01-01T00:00:00Z", por_sistema: false },
      { proyecto_id: "p1", stage: "venta_cerrada", at: "2026-02-01T00:00:00Z", por_sistema: false },
    ];
    expect(renderToStaticMarkup(<CommercialStageBadge records={records} />)).toContain("Venta cerrada");
    expect(renderToStaticMarkup(<CommercialStageBadge />)).toContain("Nuevo");
  });

  it("hints a loss caused only by sold-out projects", () => {
    const records = [{ proyecto_id: "p1", stage: "perdido", at: "2026-02-01T00:00:00Z", por_sistema: true }];
    const html = renderToStaticMarkup(<CommercialStageBadge records={records} />);
    expect(html).toContain("Perdido");
    expect(html).toContain("por agotamiento");
  });

  it("returns empty reads and refuses writes", async () => {
    await expect(getCommercialRecords(["lead-1"])).resolves.toEqual({});
    await expect(getCommercialStageScope("lead-1")).resolves.toEqual({ lead_level_writable: false, lead_level: null, proyectos: [] });
    await expect(getCommercialStageHistory("lead-1")).resolves.toEqual([]);
    await expect(changeCommercialStage({ leadId: "lead-1", toStage: "contactado" })).rejects.toThrow();
  });
});
