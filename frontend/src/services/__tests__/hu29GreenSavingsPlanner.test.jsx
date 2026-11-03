import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GreenSavingsPlanner from "../../components/GreenSavingsPlanner";
import FinancialTracking from "../../components/FinancialTracking";
import { ProgressView } from "../../features/tracking/ProgressPage";
import {
  buildDeveloperInstallmentComparison,
  buildGreenSavingsGoalPayload,
  calculateGreenSavingsSchedule,
  calculateMonthsUntilDelivery,
  DEFAULT_ANNUAL_UF_INFLATION_RATE,
  DEFAULT_DAP_NOMINAL_ANNUAL_RATE,
  DEFAULT_GREEN_UF_CLP,
  DEFAULT_UF_ACCOUNT_REAL_RATE,
  getEffectiveGreenSavingsGoal,
  GREEN_SAVINGS_GOAL_STORAGE_KEY,
  isTrackingPlanActive,
  resolveGreenPlannerUfReference,
  saveLocalGreenSavingsGoal,
  simulateInflationProtection,
} from "../greenSavingsPlannerService";

const baseEvaluation = {
  id: "eval-hu29-1",
  createdAt: "2026-04-15T12:00:00Z",
  plan_type: "improvement_plan",
  plan_accepted_at: "2026-04-15T12:05:00Z",
  input: {
    ingreso_mensual: 1800000,
    deuda_mensual: 200000,
    ahorro_disponible: 5000000,
    dividendo_estimado: 550000,
    valor_propiedad: 115500000,
    property_value_uf: 3000,
    uf_value_clp: 38500,
    project_goal: {
      id: "proj-verde-01",
      nombre: "Edificio Parque Verde",
      inmobiliaria: "Inmobiliaria Horizonte",
      comuna: "Ñuñoa",
      region: "Región Metropolitana",
      estado_proyecto: "verde",
      entrega_estimada: "2027-10",
      precio_min_uf: 3000,
    },
  },
  result: {
    score: 68,
    classification: "Medio",
    financial_indicators: {
      dti: 0.11,
      ltv: 0.85,
      pie_porcentaje: 0.15,
      ahorro_mensual_acelerado: 450000,
      ahorro_mensual_conservador: 300000,
      brecha_pie_minimo: 6550000,
      pie_minimo_clp: 11550000,
      capacidad_compra_estimada_uf: 3100,
      capacidad_supuestos: {
        market_snapshot: {
          uf_value_clp: 38500,
          effective_date: "2026-04-15",
          source: {
            uf_value_clp: {
              provider: "CMF Chile",
            },
          },
        },
      },
    },
    recommendations: [],
  },
  housing_plan: {},
};

const activeTrackingState = {
  status: "active",
  current_evaluation_id: "eval-hu29-1",
  baseline: {
    root_event_id: "evt-baseline-1",
    baseline_at: "2026-04-15T12:05:00Z",
    target_project_snapshot: {
      id: "proj-verde-01",
      nombre: "Edificio Parque Verde",
    },
  },
  active_line: [],
  audit_line: [
    {
      event_id: "evt-baseline-1",
      effective_at: "2026-04-15T12:05:00Z",
      evaluation: { score: 68 },
      recorded_complete_snapshot: {},
    },
  ],
  excluded_from_metrics: [],
  current_evaluation: {
    score: 68,
    classification: "Medio",
    financial_indicators: { capacidad_compra_estimada_uf: 3100 },
    project_fit: { classification: "compatible" },
  },
  latest_effective_snapshot: {
    ingreso_mensual: 1800000,
    deuda_mensual: 200000,
    ahorro_disponible: 5000000,
    project_goal: {
      id: "proj-verde-01",
      nombre: "Edificio Parque Verde",
    },
  },
  goals: [],
  latest_event_id: "evt-baseline-1",
  update_due: false,
};

describe("HU 29 - Planificador Interactivo de Metas de Ahorro para Compras en Verde/Blanco", () => {
  beforeEach(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(GREEN_SAVINGS_GOAL_STORAGE_KEY);
      }
    } catch {
      // ignore in environments without localStorage
    }
  });

  describe("E1: Cálculo de cuotas de ahorro (plazos 12, 18, 24 y 30 meses)", () => {
    it.each([
      { plazoMeses: 12, pieUf: 450, ufValueClp: 38500, expectedCuotaUf: 37.5, expectedCuotaClp: 1443750 },
      { plazoMeses: 18, pieUf: 450, ufValueClp: 38500, expectedCuotaUf: 25, expectedCuotaClp: 962500 },
      { plazoMeses: 24, pieUf: 450, ufValueClp: 38500, expectedCuotaUf: 18.75, expectedCuotaClp: 721875 },
      { plazoMeses: 30, pieUf: 450, ufValueClp: 38500, expectedCuotaUf: 15, expectedCuotaClp: 577500 },
    ])(
      "calcula la cuota mensual sugerida en UF y su equivalente en pesos a valor de hoy para plazo de $plazoMeses meses",
      ({ plazoMeses, pieUf, ufValueClp, expectedCuotaUf, expectedCuotaClp }) => {
        // Dado el valor del pie en UF (450 UF) y la fecha estimada de entrega del proyecto
        // Cuando el usuario ingresa los meses restantes ($plazoMeses)
        const result = calculateGreenSavingsSchedule({
          pieUf,
          plazoMeses,
          ufValueClp,
          entregaEstimada: "2027-10",
        });

        // Entonces el sistema calcula la cuota mensual sugerida de ahorro en UF y su equivalente en pesos a valor de hoy
        expect(result.isValid).toBe(true);
        expect(result.plazoMeses).toBe(plazoMeses);
        expect(result.pieUf).toBe(450);
        expect(result.cuotaMensualUf).toBeCloseTo(expectedCuotaUf, 4);
        expect(result.cuotaMensualClpHoy).toBe(expectedCuotaClp);
        expect(result.cronograma).toHaveLength(plazoMeses);
        expect(result.cronograma[plazoMeses - 1].acumuladoUf).toBeCloseTo(pieUf, 2);
        expect(result.cronograma[plazoMeses - 1].restanteUf).toBeCloseTo(0, 2);

        const html = renderToStaticMarkup(
          <GreenSavingsPlanner
            evaluation={baseEvaluation}
            trackingState={activeTrackingState}
            project={baseEvaluation.input.project_goal}
            initialPieUf={pieUf}
            initialPlazoMeses={plazoMeses}
          />,
        );

        expect(html).toContain(`Para reunir 450,00 UF en ${plazoMeses} meses`);
        expect(html).toContain(
          `$${expectedCuotaClp.toLocaleString("es-CL")}`,
        );
      },
    );

    it("calcula los meses sugeridos desde la fecha de entrega del proyecto y expone los supuestos del valor UF", () => {
      const months = calculateMonthsUntilDelivery("2027-10", new Date("2026-04-15T12:00:00Z"));
      expect(months).toBe(18);

      const ufRef = resolveGreenPlannerUfReference(baseEvaluation);
      expect(ufRef.ufValueClp).toBe(38500);
      expect(ufRef.effectiveDate).toBe("2026-04-15");
      expect(ufRef.sourceLabel).toBe("CMF Chile");
      expect(ufRef.isFallback).toBe(false);

      const fallbackRef = resolveGreenPlannerUfReference({});
      expect(fallbackRef.ufValueClp).toBe(DEFAULT_GREEN_UF_CLP);
      expect(fallbackRef.isFallback).toBe(true);
    });
  });

  describe("E2: Comparación con esquemas comerciales de la inmobiliaria", () => {
    it("no muestra la comparación cuando el proyecto NO ofrece pago de pie en cuotas con tarjeta de crédito o pagarés", () => {
      // Dado el proyecto seleccionado que NO ofrece esquema de cuotas de pie (política sin cuotas)
      const projectWithoutInstallments = {
        ...baseEvaluation.input.project_goal,
        esquema_pie_inmobiliaria: { ofrece_cuotas: false },
      };

      const comparison = buildDeveloperInstallmentComparison({
        pieUf: 450,
        plazoPersonalMeses: 18,
        ufValueClp: 38500,
        project: projectWithoutInstallments,
      });

      expect(comparison.disponible).toBe(false);

      const html = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={baseEvaluation}
          trackingState={activeTrackingState}
          project={projectWithoutInstallments}
          initialPieUf={450}
          initialPlazoMeses={18}
        />,
      );

      expect(html).not.toContain('data-testid="green-developer-comparison"');
    });

    it("no inventa condiciones comerciales cuando la inmobiliaria no informó un esquema de cuotas", () => {
      // Dado un proyecto en verde con entrega estimada pero sin esquema_pie_inmobiliaria informado
      const projectWithoutScheme = {
        ...baseEvaluation.input.project_goal,
      };

      const comparison = buildDeveloperInstallmentComparison({
        pieUf: 450,
        plazoPersonalMeses: 18,
        ufValueClp: 38500,
        project: projectWithoutScheme,
      });

      expect(comparison.disponible).toBe(false);
      expect(comparison.estado).toBe("no_informado");

      const html = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={baseEvaluation}
          trackingState={activeTrackingState}
          project={projectWithoutScheme}
          initialPieUf={450}
          initialPlazoMeses={18}
        />,
      );

      expect(html).not.toContain('data-testid="green-developer-comparison"');
      expect(html).toContain('data-testid="green-developer-comparison-empty"');
    });

    it("usa plazos y recargos distintos por modalidad y calcula diferencias frente al plan personal", () => {
      // Dado un proyecto que informa tarjeta en 12 cuotas sin recargo y pagarés en 24 cuotas con 3% de recargo
      const project = {
        ...baseEvaluation.input.project_goal,
        esquema_pie_inmobiliaria: {
          ofrece_cuotas: true,
          modalidades: ["tarjeta_credito", "pagares"],
          condiciones: {
            tarjeta_credito: { numero_cuotas: 12, recargo_porcentaje: 0 },
            pagares: { numero_cuotas: 24, recargo_porcentaje: 3 },
          },
        },
      };

      // Cuando el plan personal es de 450 UF en 18 meses (25 UF/mes)
      const comparison = buildDeveloperInstallmentComparison({
        pieUf: 450,
        plazoPersonalMeses: 18,
        ufValueClp: 38500,
        project,
      });

      const [tarjeta, pagares] = comparison.esquemas;

      // Tarjeta: 450 / 12 = 37,5 UF/mes -> 12,5 UF más al mes, 6 meses menos, sin costo adicional
      expect(tarjeta.numeroCuotas).toBe(12);
      expect(tarjeta.cuotaMensualUf).toBeCloseTo(37.5, 2);
      expect(tarjeta.diferenciaMensualUf).toBeCloseTo(12.5, 2);
      expect(tarjeta.diferenciaMensualClpHoy).toBe(481250);
      expect(tarjeta.diferenciaPlazoMeses).toBe(-6);
      expect(tarjeta.costoAdicionalUf).toBe(0);

      // Pagarés: 463,5 / 24 = 19,3125 UF/mes -> menor cuota, pero 13,5 UF más en total
      expect(pagares.numeroCuotas).toBe(24);
      expect(pagares.pieTotalUf).toBeCloseTo(463.5, 2);
      expect(pagares.cuotaMensualUf).toBeCloseTo(19.31, 2);
      expect(pagares.diferenciaMensualUf).toBeLessThan(0);
      expect(pagares.costoAdicionalUf).toBeCloseTo(13.5, 2);
      expect(pagares.costoAdicionalClpHoy).toBe(519750);

      // El calendario comparativo cubre el plazo más largo
      expect(comparison.calendarioComparativo).toHaveLength(24);
      expect(comparison.calendarioComparativo[12].tarjeta_credito.cuotaUf).toBe(0);
      expect(comparison.calendarioComparativo[18].cuotaPersonalUf).toBe(0);
      expect(comparison.calendarioComparativo[23].pagares.cuotaUf).toBeCloseTo(19.31, 2);
    });

    it("contrasta el plan de ahorro personal frente al calendario de cuotas de la inmobiliaria cuando el proyecto ofrece tarjeta de crédito o pagarés", () => {
      // Dado el proyecto seleccionado que ofrece facilidad de pagar el pie en cuotas con tarjeta de crédito o pagarés
      const projectWithInstallments = {
        ...baseEvaluation.input.project_goal,
        esquema_pie_inmobiliaria: {
          ofrece_cuotas: true,
          modalidades: ["tarjeta_credito", "pagares"],
          numero_cuotas: 18,
          recargo_porcentaje: 2,
        },
      };

      // Cuando se contrasta el plan personal (450 UF en 24 meses) con el esquema inmobiliario (18 cuotas con 2% de recargo)
      const comparison = buildDeveloperInstallmentComparison({
        pieUf: 450,
        plazoPersonalMeses: 24,
        ufValueClp: 38500,
        project: projectWithInstallments,
      });

      // Entonces el sistema contrasta ambas opciones con montos transparentes
      expect(comparison.disponible).toBe(true);
      expect(comparison.planPersonal.cuotaMensualUf).toBeCloseTo(18.75, 2);
      expect(comparison.esquemas).toHaveLength(2);
      expect(comparison.esquemas.map((e) => e.id)).toEqual(["tarjeta_credito", "pagares"]);
      expect(comparison.esquemas[0].numeroCuotas).toBe(18);
      expect(comparison.esquemas[0].pieTotalUf).toBeCloseTo(459, 2);
      expect(comparison.esquemas[0].cuotaMensualUf).toBeCloseTo(25.5, 2);

      const html = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={baseEvaluation}
          trackingState={activeTrackingState}
          project={projectWithInstallments}
          initialPieUf={450}
          initialPlazoMeses={24}
        />,
      );

      expect(html).toContain('data-testid="green-developer-comparison"');
      expect(html).toContain("Cuotas con Tarjeta de Crédito");
      expect(html).toContain("Pagarés Directos Inmobiliaria");
      expect(html).toContain("Plan de Ahorro Personal");
    });
  });

  describe("E3: Simulación de protección inflacionaria", () => {
    it("estima cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo) protege el poder adquisitivo frente al alza de la UF", () => {
      // Dado que las propiedades se venden en UF y el usuario ahorra en pesos
      // Cuando se proyecta el plan en el tiempo (450 UF en 24 meses)
      const simulation = simulateInflationProtection({
        pieUf: 450,
        plazoMeses: 24,
        ufValueClp: 38500,
        propertyUf: 3000,
        annualInflationRate: DEFAULT_ANNUAL_UF_INFLATION_RATE,
        ufAccountRealRate: DEFAULT_UF_ACCOUNT_REAL_RATE,
        dapNominalAnnualRate: DEFAULT_DAP_NOMINAL_ANNUAL_RATE,
      });

      // Entonces el sistema estima cómo el ahorro en UF o DAP protege el poder adquisitivo frente al ahorro sin reajuste
      expect(simulation.isValid).toBe(true);
      expect(simulation.supuestos.ufFinalEstimadaClp).toBeGreaterThan(38500);
      expect(simulation.pie.valorClpEntrega).toBeGreaterThan(simulation.pie.valorClpHoy);
      expect(simulation.propiedad.encarecimientoClp).toBeGreaterThan(0);

      const sinReajuste = simulation.instrumentos.find((s) => s.id === "sin_reajuste");
      const cuentaUf = simulation.instrumentos.find((s) => s.id === "cuenta_uf");
      const depositoPlazo = simulation.instrumentos.find((s) => s.id === "deposito_plazo");

      expect(sinReajuste.coberturaPiePct).toBeLessThan(100);
      expect(sinReajuste.perdidaPoderAdquisitivoUf).toBeGreaterThan(0);

      expect(cuentaUf.coberturaPiePct).toBeGreaterThanOrEqual(100);
      expect(cuentaUf.protegePoderAdquisitivo).toBe(true);
      expect(cuentaUf.proteccionGanadaClp).toBeGreaterThan(0);

      expect(depositoPlazo.coberturaPiePct).toBeGreaterThanOrEqual(95);
      expect(depositoPlazo.protegePoderAdquisitivo).toBe(true);
      expect(depositoPlazo.proteccionGanadaClp).toBeGreaterThan(0);

      const html = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={baseEvaluation}
          trackingState={activeTrackingState}
          project={baseEvaluation.input.project_goal}
          initialPieUf={450}
          initialPlazoMeses={24}
        />,
      );

      expect(html).toContain('data-testid="green-inflation-protection"');
      expect(html).toContain("Cuenta de Ahorro en UF (Reajustable)");
      expect(html).toContain("Depósito a Plazo Renovable (DAP)");
      expect(html).toContain("Supuestos de proyección inflacionaria (E3):");
    });
  });

  describe("E4: Conexión con seguimiento mensual (HU 13)", () => {
    it("registra la cuota mensual como meta de ahorro periódica en el dashboard personal cuando el seguimiento HU 13 está activo", () => {
      // Dado que el usuario tiene activo el seguimiento del plan de mejora (HU 13)
      expect(isTrackingPlanActive(baseEvaluation, activeTrackingState)).toBe(true);

      // Cuando fija su meta de pie en verde (450 UF en 18 meses = 25 UF/mes = $962.500/mes)
      const schedule = calculateGreenSavingsSchedule({
        pieUf: 450,
        plazoMeses: 18,
        ufValueClp: 38500,
        entregaEstimada: "2027-10",
      });

      const goalPayload = buildGreenSavingsGoalPayload({
        schedule,
        project: baseEvaluation.input.project_goal,
        instrument: "cuenta_uf",
      });

      expect(goalPayload.cuota_mensual_uf).toBeCloseTo(25, 2);
      expect(goalPayload.cuota_mensual_clp).toBe(962500);
      expect(goalPayload.plazo_meses).toBe(18);

      saveLocalGreenSavingsGoal(goalPayload, baseEvaluation.id);

      const evaluationWithGoal = {
        ...baseEvaluation,
        housing_plan: {
          green_savings_goal: goalPayload,
        },
      };

      expect(getEffectiveGreenSavingsGoal(evaluationWithGoal, activeTrackingState)).toMatchObject({
        cuota_mensual_uf: 25,
        cuota_mensual_clp: 962500,
        plazo_meses: 18,
      });

      // Entonces el monto mensual queda registrado como una meta de ahorro periódica en su dashboard personal (FinancialTracking y ProgressPage)
      const plannerHtml = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={evaluationWithGoal}
          trackingState={activeTrackingState}
          project={baseEvaluation.input.project_goal}
        />,
      );
      expect(plannerHtml).toContain("Meta periódica activa:");
      expect(plannerHtml).toContain("25,00 UF / mes");

      const financialTrackingHtml = renderToStaticMarkup(
        <FinancialTracking
          evaluation={evaluationWithGoal}
          trackingState={activeTrackingState}
          onAcceptPlan={vi.fn()}
          onStartEvaluation={vi.fn()}
          onOpenProgress={vi.fn()}
          onOpenHousingPlan={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );
      expect(financialTrackingHtml).toContain('data-testid="dashboard-green-savings-goal"');
      expect(financialTrackingHtml).toContain("Meta periódica en verde fijada:");
      expect(financialTrackingHtml).toContain("25,00 UF/mes");

      const progressViewHtml = renderToStaticMarkup(
        <ProgressView
          data={activeTrackingState}
          evaluation={evaluationWithGoal}
          projection={{ status: "not_projectable" }}
          onConfirm={vi.fn()}
          onOpenHistory={vi.fn()}
          onUpdate={vi.fn()}
        />,
      );
      expect(progressViewHtml).toContain('data-testid="progress-green-savings-goal"');
      expect(progressViewHtml).toContain("Meta de ahorro periódica — Pie en verde/blanco");
      expect(progressViewHtml).toContain("25,00 UF / mes");
    });

    it("deshabilita la fijación de la meta periódica cuando el usuario aún no tiene activo el seguimiento del plan de mejora (HU 13)", () => {
      const evaluationWithoutTracking = {
        ...baseEvaluation,
        plan_type: null,
        plan_accepted_at: null,
        housing_plan: {},
      };
      const inactiveTrackingState = { status: "inactive", baseline: null, active_line: [] };

      expect(isTrackingPlanActive(evaluationWithoutTracking, inactiveTrackingState)).toBe(false);

      const html = renderToStaticMarkup(
        <GreenSavingsPlanner
          evaluation={evaluationWithoutTracking}
          trackingState={inactiveTrackingState}
          project={baseEvaluation.input.project_goal}
        />,
      );

      expect(html).toContain(
        "Activa primero el seguimiento de tu Plan de Mejora (HU 13) para poder fijar esta cuota mensual en tu dashboard personal.",
      );
    });
  });
});
