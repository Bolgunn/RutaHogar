import { describe, expect, it } from "vitest";
import {
  evaluateFavoriteOpportunityChange,
  formatOpportunityThresholdSummary,
  recalculateOpportunityCompatibility,
} from "../opportunityRadar";
import { evaluateScenario, projectToScenario } from "../compatibility";
import { catalogProjectToSimulation } from "../projectAdapter";
import { validateProject } from "../../../services/projectValidation";
import { analyzeProjectImport, toImportPayload } from "../../catalog/projectImport";

describe("HU 31 — opportunityRadar pure functions", () => {
  const baseEvaluation = {
    input: {
      ingreso_mensual: 1900000,
      ahorro_disponible: 14000000,
      deuda_mensual: 120000,
      uf_value_clp: 38000,
    },
    result: {
      score: 74,
      classification: "Medio",
      financial_indicators: {
        capacidad_compra_estimada_uf: 2850,
      },
      market_context: {
        uf_value: 38000,
      },
    },
  };

  it("recalculates compatibility before and after price drop and 5% bono pie", () => {
    const before = recalculateOpportunityCompatibility(baseEvaluation, 3200, 0);
    expect(before.status).toBe("no_compatible");
    expect(before.uiStatus).toBe("Requiere ajuste");
    expect(before.brecha_uf).toBe(350);

    const afterPriceDrop = recalculateOpportunityCompatibility(baseEvaluation, 2800, 0);
    expect(afterPriceDrop.status).toBe("compatible_con_ajustes");
    expect(afterPriceDrop.brecha_uf).toBe(0);

    const afterBonoPie = recalculateOpportunityCompatibility(baseEvaluation, 2800, 5);
    expect(afterBonoPie.aporte_bono_pie_uf).toBe(140);
    expect(afterBonoPie.capacidad_efectiva_uf).toBe(2990);
    expect(afterBonoPie.pie_minimo_requerido_uf).toBe(140);
  });

  it("evaluates favorite opportunity change when catalog price drops or bono pie is applied", () => {
    const favoriteAlert = {
      usuario_id: "user-1",
      proyecto_id: "proj-1",
      notificar_cambios: true,
      umbral_precio_min_uf: 3200,
      umbral_precio_max_uf: 3800,
      umbral_bono_pie_pct: 0,
    };

    const previousProject = {
      id: "proj-1",
      nombre: "Mirador del Parque",
      comuna: "Ñuñoa",
      tipo: "departamento",
      precio_min_uf: 3200,
      precio_max_uf: 3800,
      bono_pie_pct: 0,
      estado: "disponible",
    };

    const updatedProject = {
      ...previousProject,
      precio_min_uf: 2800,
      precio_max_uf: 3500,
      bono_pie_pct: 5,
    };

    const evaluation = evaluateFavoriteOpportunityChange({
      favoriteAlert,
      previousProject,
      updatedProject,
      financialContext: baseEvaluation,
      userId: "user-1",
    });

    expect(evaluation.triggered).toBe(true);
    expect(evaluation.event.event_type).toBe("favorite_project_opportunity");
    expect(evaluation.event.source).toBe("catalog_update");
    expect(evaluation.event.payload.price_dropped).toBe(true);
    expect(evaluation.event.payload.bono_pie_increased).toBe(true);
    expect(evaluation.event.payload.bono_pie_actual_pct).toBe(5);
    expect(evaluation.nextThresholds).toEqual({
      umbral_precio_min_uf: 2800,
      umbral_precio_max_uf: 3500,
      umbral_bono_pie_pct: 5,
    });
  });

  it("formats active alert threshold summary clearly", () => {
    expect(
      formatOpportunityThresholdSummary({
        notificar_cambios: true,
        umbral_precio_min_uf: 3200,
        umbral_bono_pie_pct: 5,
      }),
    ).toBe("Alerta activa · Umbral desde 3.200 UF · Bono pie 5%");
  });

  it("applies bono_pie_pct in evaluateScenario and catalogProjectToSimulation without breaking projects without bono", () => {
    const projectWithBono = catalogProjectToSimulation({
      id: "proj-bono",
      nombre: "Altos de Macul",
      comuna: "Macul",
      tipo: "departamento",
      precio_min_uf: 3000,
      precio_max_uf: 3600,
      bono_pie_pct: 5,
      estado: "disponible",
    });

    expect(projectWithBono.bono_pie_pct).toBe(5);

    const scenarioWithBono = projectToScenario(projectWithBono, 38000);
    const evalWithBono = evaluateScenario(
      { ingreso_mensual: 2000000, ahorro_disponible: 7000000, deuda_mensual: 0, uf_value_clp: 38000 },
      scenarioWithBono,
    );
    // 5% bono pie reduces minimum down payment from 10% (300 UF) to 5% (150 UF)
    expect(evalWithBono.pieMinimoUf).toBe(150);
  });

  it("validates bono_pie_pct in validateProject and accepts optional column in CSV import", () => {
    const valid = validateProject({
      inmobiliaria_id: "inmo-1",
      nombre: "Proyecto Bono",
      comuna: "Ñuñoa",
      tipo: "departamento",
      estado: "disponible",
      precio_min_uf: 2500,
      precio_max_uf: 3100,
      bono_pie_pct: 5,
    });
    expect(valid.ok).toBe(true);

    const invalid = validateProject({
      inmobiliaria_id: "inmo-1",
      nombre: "Proyecto Bono Inválido",
      comuna: "Ñuñoa",
      tipo: "departamento",
      estado: "disponible",
      precio_min_uf: 2500,
      precio_max_uf: 3100,
      bono_pie_pct: 45,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.bono_pie_pct).toMatch(/0 % y 30 %/);

    const csv = [
      "nombre;comuna;tipo;precio_min_uf;precio_max_uf;estado;descripcion;entrega_estimada;bono_pie_pct",
      "Mirador del Parque;Ñuñoa;departamento;2800;3500;disponible;Con bono pie;2027-06;5",
    ].join("\r\n");

    const analysis = analyzeProjectImport(csv, { inmobiliariaId: "inmo-1" });
    expect(analysis.canImport).toBe(true);
    expect(analysis.warnings).toEqual([]);
    const payload = toImportPayload(analysis);
    expect(payload[0].bono_pie_pct).toBe(5);
  });
});
