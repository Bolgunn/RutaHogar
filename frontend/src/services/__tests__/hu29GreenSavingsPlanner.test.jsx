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
  describeGreenSavingsGoalProgress,
  getEffectiveGreenSavingsGoal,
  GREEN_SAVINGS_GOAL_STORAGE_KEY,
  isTrackingPlanActive,
  persistGreenSavingsGoal,
  resolveGreenPlannerUfReference,
  resolveUnifiedTrackingGoal,
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

    it("evalúa el estado activo de seguimiento sin circularidad con metas previas", () => {
      // Si el tracking del backend dice 'not_started', no debe dar activo aunque exista meta previa
      const evalWithOldGoal = {
        id: "eval-old",
        housing_plan: { green_savings_goal: { cuota_mensual_uf: 20 } },
      };
      expect(isTrackingPlanActive(evalWithOldGoal, { status: "not_started" })).toBe(false);

      // Si el tracking del backend está 'active', es activo
      expect(isTrackingPlanActive(evalWithOldGoal, { status: "active" })).toBe(true);

      // Si no hay trackingState disponible (ej. local o cargando), evalúa plan_accepted_at o plan_type
      expect(isTrackingPlanActive({ plan_accepted_at: "2026-04-01" }, null)).toBe(true);
      expect(isTrackingPlanActive({ plan_type: "acelerado" }, null)).toBe(true);
      expect(isTrackingPlanActive({ housing_plan: {} }, null)).toBe(false);
    });

    it("persiste la meta con estado synced cuando la API responde y local_only si falla la sincronización", async () => {
      const schedule = calculateGreenSavingsSchedule({
        pieUf: 300,
        plazoMeses: 12,
        ufValueClp: 38500,
      });
      const payload = buildGreenSavingsGoalPayload({
        schedule,
        project: { id: "p-1", nombre: "Edificio Test" },
      });

      // Caso exitoso
      const onSaveSuccess = vi.fn().mockResolvedValue(payload);
      const syncedResult = await persistGreenSavingsGoal({
        payload,
        evaluationId: "eval-ok",
        onSave: onSaveSuccess,
      });
      expect(syncedResult.status).toBe("synced");
      expect(syncedResult.error).toBeNull();

      // Caso con error de red / backend
      const networkError = new Error("Network timeout");
      const onSaveFailure = vi.fn().mockRejectedValue(networkError);
      const failedResult = await persistGreenSavingsGoal({
        payload,
        evaluationId: "eval-fail",
        onSave: onSaveFailure,
      });
      expect(failedResult.status).toBe("local_only");
      expect(failedResult.error).toBe(networkError);
    });

    it("guarda en localStorage de forma aislada por evaluación sin contaminar clave global", () => {
      const fakeStorage = {};
      vi.stubGlobal("localStorage", {
        getItem: (k) => fakeStorage[k] || null,
        setItem: (k, v) => { fakeStorage[k] = v; },
      });

      const goalA = { cuota_mensual_uf: 15, plazo_meses: 12 };
      const goalB = { cuota_mensual_uf: 25, plazo_meses: 24 };

      saveLocalGreenSavingsGoal(goalA, "eval-user-1");
      saveLocalGreenSavingsGoal(goalB, "eval-user-2");

      const stored = JSON.parse(fakeStorage[GREEN_SAVINGS_GOAL_STORAGE_KEY]);
      expect(stored["eval-user-1"]).toEqual(goalA);
      expect(stored["eval-user-2"]).toEqual(goalB);
      expect(stored.latest).toBeUndefined(); // no existe clave latest que filtre datos entre usuarios
    });

    it("calcula el progreso estimado y acumulación de ahorro mediante describeGreenSavingsGoalProgress", () => {
      const goal = {
        pie_total_uf: 360,
        cuota_mensual_uf: 20,
        plazo_meses: 18,
        fixed_at: "2026-01-01T00:00:00Z",
      };

      // Al momento de fijar la meta (mes 1)
      const dayOne = describeGreenSavingsGoalProgress(goal, new Date("2026-01-02T00:00:00Z"));
      expect(dayOne).toMatchObject({
        mesActual: 1,
        plazoMeses: 18,
        finalizada: false,
        acumuladoEsperadoUf: 20,
        restanteEsperadoUf: 340,
        porcentajeEsperado: 6,
      });

      // A los 5 meses
      const monthFive = describeGreenSavingsGoalProgress(goal, new Date("2026-06-01T00:00:00Z"));
      expect(monthFive.mesActual).toBe(6);
      expect(monthFive.acumuladoEsperadoUf).toBe(120);

      // Cumplido el plazo de 18 meses
      const finished = describeGreenSavingsGoalProgress(goal, new Date("2027-08-01T00:00:00Z"));
      expect(finished.finalizada).toBe(true);
      expect(finished.mesActual).toBe(18);
      expect(finished.acumuladoEsperadoUf).toBe(360);
      expect(finished.restanteEsperadoUf).toBe(0);
    });

    it("muestra en ProgressPage y FinancialTracking el avance estimado periódico del pie", () => {
      const goalPayload = {
        type: "pie_en_verde_blanco",
        project_id: "proj-1",
        project_name: "Edificio Futuro",
        pie_total_uf: 450,
        cuota_mensual_uf: 25,
        cuota_mensual_clp: 962500,
        plazo_meses: 18,
        fixed_at: "2026-01-01T00:00:00Z",
      };

      const evalWithGoal = {
        ...baseEvaluation,
        housing_plan: { green_savings_goal: goalPayload },
      };

      // Simular visualización a 3 meses de fijada la meta
      const asOfDate = "2026-04-01T00:00:00Z";
      const trackingData = {
        ...activeTrackingState,
        cutoff_at: asOfDate,
      };

      const progressHtml = renderToStaticMarkup(
        <ProgressView
          data={trackingData}
          evaluation={evalWithGoal}
          projection={{ status: "not_projectable" }}
          onConfirm={vi.fn()}
          onOpenHistory={vi.fn()}
          onUpdate={vi.fn()}
        />,
      );

      // Debe mostrar el badge de avance con porcentaje y el esperado acumulado
      expect(progressHtml).toContain('data-testid="progress-green-savings-goal"');
      expect(progressHtml).toContain("En curso (mes 4 de 18)");
      expect(progressHtml).toContain("22%");
      expect(progressHtml).toContain("Esperado al mes 4:");
    });

    it("unifica la base matemática entre Meta de Pie (10%) y Ahorro Pie evitando descuadre y contradicciones", () => {
      // Caso reportado: Evaluación con pie mínimo genérico de $6.192.945 (ahorrado $1M + faltante $5.19M),
      // pero con proyecto Plaza Ñuñoa (5.800 UF, 10% = 580 UF = $23.852.500) y meta en verde de 32,22 UF ($1.325.066/mes) en 18 meses.
      const ufRate = 41125;
      const greenGoalPlazaNunoa = {
        type: "pie_en_verde_blanco",
        project_id: "p-plaza-nunoa",
        project_name: "Plaza Ñuñoa",
        property_uf: 5800,
        pie_total_uf: 580,
        pie_total_clp: 23852500,
        cuota_mensual_uf: 32.22,
        cuota_mensual_clp: 1325066,
        plazo_meses: 18,
        uf_value_clp: ufRate,
      };

      const evalWithNunoaGoal = {
        ...baseEvaluation,
        input: {
          ...baseEvaluation.input,
          uf_value_clp: ufRate,
          ahorro_disponible: 1000000,
          project_goal: {
            id: "p-plaza-nunoa",
            nombre: "Plaza Ñuñoa",
            precio_min_uf: 5800,
            estado: "en_construccion",
            entrega_estimada: "2028-05",
          },
        },
        result: {
          ...baseEvaluation.result,
          financial_indicators: {
            ...baseEvaluation.result.financial_indicators,
            capacidad_supuestos: {
              market_snapshot: {
                uf_value_clp: ufRate,
                effective_date: "2026-04-15",
              },
            },
            pie_minimo_clp: 6192945,
            brecha_pie_minimo: 5192945,
            ahorro_mensual_conservador: 244000,
            ahorro_mensual_acelerado: 488000,
            meses_conservador: 22,
          },
        },
        housing_plan: {
          green_savings_goal: greenGoalPlazaNunoa,
        },
      };

      // 1. Verificación de cálculo puro unificado
      const unified = resolveUnifiedTrackingGoal({
        evaluation: evalWithNunoaGoal,
        trackingState: activeTrackingState,
        projectGoal: evalWithNunoaGoal.input.project_goal,
        ufValueClp: ufRate,
      });

      expect(unified.isApplicable).toBe(true);
      expect(unified.pieTotalUf).toBe(580);
      expect(unified.pieTotalClp).toBe(23852500);
      expect(unified.currentAhorro).toBe(1000000);
      // Faltante real para la meta de 580 UF ($23.852.500 - $1.000.000)
      expect(unified.brechaPieClp).toBe(22852500);
      // Ahorro sugerido empata con la cuota real de la meta periódica en verde
      expect(unified.cuotaMensualClp).toBe(1325066);
      expect(unified.cuotaMensualUf).toBe(32.22);
      expect(unified.plazoMeses).toBe(18);

      // 2. Verificación de renderizado en FinancialTracking
      const dashboardHtml = renderToStaticMarkup(
        <FinancialTracking
          evaluation={evalWithNunoaGoal}
          trackingState={activeTrackingState}
          onAcceptPlan={vi.fn()}
          onStartEvaluation={vi.fn()}
          onOpenProgress={vi.fn()}
          onOpenHousingPlan={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      // Tarjeta 2: Ya NO muestra el faltante desactualizado de $5.192.945, sino los $22.852.500 del proyecto
      expect(dashboardHtml).toContain("Meta de Pie (10% · Plaza Ñuñoa)");
      expect(dashboardHtml).toContain("$22.852.500");
      expect(dashboardHtml).toContain("580,00 UF");

      // Tarjeta 4: El 'Ahorro sugerido' empata con $1.325.066/m (32,22 UF/mes) y el plazo con 18 meses (1 año y 6 meses)
      expect(dashboardHtml).toContain("Ahorro Pie (Venta en Verde)");
      expect(dashboardHtml).toContain("$1.325.066/m");
      expect(dashboardHtml).toContain("32,22 UF / mes");
      expect(dashboardHtml).toContain("1 año y 6 meses");

      // Advierte de forma responsable que la cuota de la venta en verde supera la capacidad ordinaria de $244.000/m
      expect(dashboardHtml).toContain("Exigencia de venta en verde");
      expect(dashboardHtml).toContain("supera tu ahorro ordinario");
    });
    it("permite al usuario regresar al ahorro de pie ordinario (sin plazo en verde), eliminando la etiqueta '(Venta en Verde)'", () => {
      const ufRate = 41125;
      const greenGoalPlazaNunoa = {
        type: "pie_en_verde_blanco",
        project_id: "p-plaza-nunoa",
        project_name: "Plaza Ñuñoa",
        property_uf: 5800,
        pie_total_uf: 580,
        pie_total_clp: 23852500,
        cuota_mensual_uf: 32.22,
        cuota_mensual_clp: 1325066,
        plazo_meses: 18,
        uf_value_clp: ufRate,
      };

      const evalWithNunoaGoal = {
        ...baseEvaluation,
        input: {
          ...baseEvaluation.input,
          uf_value_clp: ufRate,
          ahorro_disponible: 1000000,
          project_goal: {
            id: "p-plaza-nunoa",
            nombre: "Plaza Ñuñoa",
            precio_min_uf: 5800,
            estado: "en_construccion",
            entrega_estimada: "2028-05",
          },
        },
        result: {
          ...baseEvaluation.result,
          financial_indicators: {
            ...baseEvaluation.result.financial_indicators,
            capacidad_supuestos: {
              market_snapshot: {
                uf_value_clp: ufRate,
                effective_date: "2026-04-15",
              },
            },
            pie_minimo_clp: 6192945,
            brecha_pie_minimo: 5192945,
            ahorro_mensual_conservador: 244000,
            ahorro_mensual_acelerado: 488000,
            meses_conservador: 22,
          },
        },
        housing_plan: {
          green_savings_goal: greenGoalPlazaNunoa,
        },
      };

      // 1. Con venta en verde activa: muestra título con etiqueta y cuota exigida
      const htmlConVerde = renderToStaticMarkup(
        <FinancialTracking
          evaluation={evalWithNunoaGoal}
          trackingState={activeTrackingState}
          initialUseGreenSavingsPlan={true}
        />,
      );
      expect(htmlConVerde).toContain("Ahorro Pie (Venta en Verde)");
      expect(htmlConVerde).toContain("Meta de Pie (10% · Plaza Ñuñoa)");
      expect(htmlConVerde).toContain("$1.325.066/m");
      expect(htmlConVerde).toContain("Ahorro sin plazo en verde");
      expect(htmlConVerde).toContain('data-testid="btn-return-conventional-savings"');

      // 2. Al regresar al ahorro a su propio ritmo (sin plazo en verde):
      // - Se elimina estrictamente la etiqueta '(Venta en Verde)'
      // - El título de la tarjeta 4 vuelve a 'Ahorro Pie'
      // - El título de la tarjeta 2 vuelve a 'Meta de Pie (10%)'
      // - El ahorro sugerido y el plazo vuelven a los montos ordinarios ($244.000/mes, 22 meses = 1 año y 10 meses)
      // - Se muestra el aviso informativo con opción de volver al plazo en verde
      const htmlSinVerde = renderToStaticMarkup(
        <FinancialTracking
          evaluation={evalWithNunoaGoal}
          trackingState={activeTrackingState}
          initialUseGreenSavingsPlan={false}
        />,
      );

      expect(htmlSinVerde).not.toContain("Ahorro Pie (Venta en Verde)");
      expect(htmlSinVerde).toContain("Ahorro Pie");
      expect(htmlSinVerde).toContain("Meta de Pie (10%)");
      expect(htmlSinVerde).not.toContain("Meta de Pie (10% · Plaza Ñuñoa)");
      expect(htmlSinVerde).toContain("$244.000/m");
      expect(htmlSinVerde).toContain("1 año y 10 meses");
      expect(htmlSinVerde).not.toContain("(32,22 UF / mes)");
      expect(htmlSinVerde).not.toContain("⚠️ Exigencia de venta en verde");
      expect(htmlSinVerde).toContain('data-testid="conventional-savings-notice"');
      expect(htmlSinVerde).toContain("Ahorro a tu propio ritmo según tu capacidad mensual (sin exigir el plazo de 18 meses)");
      expect(htmlSinVerde).toContain("Volver a plazo en verde");
    });
  });
});
