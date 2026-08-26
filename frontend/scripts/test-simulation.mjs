import assert from "node:assert/strict";
import {
  buildAccessibleAlternatives,
  buildComparisonInsights,
  buildSimulationContext,
  evaluateScenario,
  getMaxValueRange,
  getScenarioFromManualValue,
} from "../src/lib/simulation/compatibility.js";
import {
  resolveActiveComparison,
  shouldShowComparisonWarning,
} from "../src/lib/simulation/comparisonState.js";
import { mockProjects } from "../src/data/mockProjects.js";
import {
  getSimulationProjectById,
  getSimulationProjects,
  isProjectAvailableForSimulation,
  projectToSimulationScenario,
} from "../src/services/projectSimulationService.js";

const UF = 40_000;
const statusRank = {
  Compatible: 0,
  Cercano: 1,
  "Requiere ajuste": 2,
};

function baseInput(overrides = {}) {
  return {
    ingreso_mensual: 4_000_000,
    deuda_mensual: 200_000,
    ahorro_disponible: 20_000_000,
    dividendo_estimado: 800_000,
    uf_value_clp: UF,
    classification: "Alto",
    score: 82,
    plazo_compra: "6_12_meses",
    ...overrides,
  };
}

function scenario(valueUf, overrides = {}) {
  return {
    id: `manual-${valueUf}`,
    source: "manual",
    label: `Manual ${valueUf} UF`,
    comuna: "Santiago",
    tipo_vivienda: "departamento",
    valueUf,
    valueClp: valueUf * UF,
    project: null,
    ...overrides,
  };
}

function approx(actual, expected, tolerance = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function assertSortedAlternatives(alternatives) {
  for (let index = 1; index < alternatives.length; index += 1) {
    const previous = alternatives[index - 1];
    const current = alternatives[index];
    assert.ok(
      statusRank[previous.status] <= statusRank[current.status],
      `Alternative ${previous.project.id} (${previous.status}) should not sort after ${current.project.id} (${current.status})`,
    );
    if (previous.status === current.status) {
      assert.ok(
        previous.gapAmount <= current.gapAmount,
        `Alternative ${previous.project.id} gap ${previous.gapAmount} should be <= ${current.project.id} gap ${current.gapAmount}`,
      );
    }
  }
}

const tests = [
  [
    "buildSimulationContext merges evaluation, onboarding and result",
    () => {
      const context = buildSimulationContext(
        {
          input: baseInput({ comuna_objetivo: "Macul" }),
          onboarding: { plazo_compra: "3_6_meses" },
          result: { classification: "Medio", score: 67, risks: ["pie"] },
        },
        { comuna_interes: "Santiago", tipo_propiedad: "departamento", plazo_compra: "0_3_meses" },
      );

      assert.equal(context.comuna_objetivo, "Santiago");
      assert.equal(context.tipo_vivienda_preferida, "departamento");
      assert.equal(context.plazo_compra, "0_3_meses");
      assert.equal(context.classification, "Medio");
      assert.equal(context.score, 67);
    },
  ],
  [
    "getMaxValueRange computes the reference housing range from savings",
    () => {
      const range = getMaxValueRange(baseInput({ ahorro_disponible: 20_000_000 }));

      assert.equal(range.minClp, 100_000_000);
      assert.equal(range.maxClp, 200_000_000);
      assert.equal(range.minUf, 2500);
      assert.equal(range.maxUf, 5000);
      assert.equal(range.ufValueClp, UF);
    },
  ],
  [
    "getScenarioFromManualValue keeps UF and CLP units consistent",
    () => {
      const manual = getScenarioFromManualValue(2800, UF);

      assert.equal(manual.source, "manual");
      assert.equal(manual.valueUf, 2800);
      assert.equal(manual.valueClp, 112_000_000);
    },
  ],
  [
    "getScenarioFromManualValue accepts CLP input and derives UF consistently",
    () => {
      const manual = getScenarioFromManualValue(112_000_000, UF, "clp");

      assert.equal(manual.source, "manual");
      assert.equal(manual.valueUnit, "clp");
      assert.equal(manual.valueClp, 112_000_000);
      assert.equal(manual.valueUf, 2800);
    },
  ],
  [
    "projectSimulationService exposes only projects available for HU6 simulation",
    () => {
      const sourceProjects = [
        { id: "activo", nombre: "Activo", comuna: "Santiago", tipo_vivienda: "departamento", valor_uf: 2000, estado: "referencial" },
        { id: "agotado", nombre: "Agotado", comuna: "Santiago", tipo_vivienda: "departamento", valor_uf: 1900, estado: "agotado" },
        { id: "inactivo", nombre: "Inactivo", comuna: "Santiago", tipo_vivienda: "departamento", valor_uf: 1800, estado: "inactivo" },
      ];

      assert.equal(isProjectAvailableForSimulation(sourceProjects[0]), true);
      assert.equal(isProjectAvailableForSimulation(sourceProjects[1]), false);
      assert.deepEqual(getSimulationProjects(sourceProjects).map((project) => project.id), ["activo"]);
      assert.equal(getSimulationProjectById("agotado", sourceProjects), null);
    },
  ],
  [
    "projectToSimulationScenario prepares HU7-like project data for compatibility evaluation",
    () => {
      const project = {
        id: "hu7-ready",
        nombre: "Proyecto HU7",
        comuna: "Macul",
        tipo_vivienda: "departamento",
        valor_uf: 2500,
        estado: "disponible",
      };
      const scenarioFromProject = projectToSimulationScenario(project, UF);

      assert.equal(scenarioFromProject.id, "hu7-ready");
      assert.equal(scenarioFromProject.valueUf, 2500);
      assert.equal(scenarioFromProject.valueClp, 100_000_000);
      assert.equal(scenarioFromProject.project, project);
    },
  ],
  [
    "evaluateScenario calculates down payments, gaps and prudent dividend",
    () => {
      const result = evaluateScenario(baseInput(), scenario(2000));

      assert.equal(result.valueClp, 80_000_000);
      assert.equal(result.pieMinimo, 8_000_000);
      assert.equal(result.pieRecomendado, 16_000_000);
      assert.equal(result.gapMinimo, 0);
      assert.equal(result.gapRecomendado, 0);
      assert.equal(result.prudentDividend, 1_000_000);
      approx(result.debtRatio, 0.05);
      assert.equal(result.status, "Compatible");
      assert.equal(result.mainGap, null);
    },
  ],
  [
    "evaluateScenario marks near cases when savings cover minimum but not recommended down payment",
    () => {
      const result = evaluateScenario(baseInput(), scenario(3000));

      assert.equal(result.pieMinimo, 12_000_000);
      assert.equal(result.pieRecomendado, 24_000_000);
      assert.equal(result.gapMinimo, 0);
      assert.equal(result.gapRecomendado, 4_000_000);
      assert.equal(result.status, "Cercano");
      assert.equal(result.mainGap, "pie");
    },
  ],
  [
    "evaluateScenario detects insufficient down payment as the main gap",
    () => {
      const result = evaluateScenario(
        baseInput({ ahorro_disponible: 5_000_000 }),
        scenario(3000),
      );

      assert.equal(result.status, "Requiere ajuste");
      assert.equal(result.mainGap, "pie");
      assert.equal(result.gapMinimo, 7_000_000);
      approx(result.gapMinimoUf, 175);
      assert.match(result.recommendation, /ahorro disponible|menor valor/i);
    },
  ],
  [
    "evaluateScenario detects high debt before dividend pressure when down payment is enough",
    () => {
      const result = evaluateScenario(
        baseInput({ deuda_mensual: 1_800_000, ahorro_disponible: 50_000_000 }),
        scenario(2000),
      );

      assert.equal(result.status, "Requiere ajuste");
      assert.equal(result.mainGap, "deuda");
      approx(result.debtRatio, 0.45);
    },
  ],
  [
    "evaluateScenario detects dividend pressure",
    () => {
      const result = evaluateScenario(
        baseInput({ dividendo_estimado: 1_300_000, ahorro_disponible: 50_000_000 }),
        scenario(2000),
      );

      assert.equal(result.status, "Requiere ajuste");
      assert.equal(result.mainGap, "plazo/dividendo");
      assert.equal(result.prudentDividend, 1_000_000);
    },
  ],
  [
    "buildAccessibleAlternatives sorts by compatibility and then lower gap",
    () => {
      const alternatives = buildAccessibleAlternatives(
        mockProjects,
        baseInput({ ahorro_disponible: 10_000_000, dividendo_estimado: 700_000 }),
        { comuna_interes: "Santiago", tipo_propiedad: "departamento" },
        5,
      );

      assert.equal(alternatives.length, 5);
      assertSortedAlternatives(alternatives);
      assert.equal(alternatives[0].project.id, "mock-puente-alto-2100-casa");
      assert.equal(alternatives[0].status, "Cercano");
    },
  ],
  [
    "buildAccessibleAlternatives uses preferences as tie breakers after financial criteria",
    () => {
      const alternatives = buildAccessibleAlternatives(
        mockProjects,
        baseInput({ ahorro_disponible: 50_000_000, dividendo_estimado: 700_000 }),
        { comuna_interes: "Santiago", tipo_propiedad: "departamento" },
        5,
      );

      assert.equal(alternatives[0].project.id, "mock-santiago-2300-depto");
      assert.equal(alternatives[0].preference.communeMatch, true);
      assert.equal(alternatives[0].preference.typeMatch, true);
    },
  ],
  [
    "buildComparisonInsights recommends the financially better alternative",
    () => {
      const current = evaluateScenario(
        baseInput({ ahorro_disponible: 8_000_000, dividendo_estimado: 700_000 }),
        scenario(4200, { label: "Objetivo alto", comuna: "Providencia" }),
      );
      const alternative = evaluateScenario(
        baseInput({ ahorro_disponible: 8_000_000, dividendo_estimado: 700_000 }),
        scenario(1800, { label: "Alternativa menor", comuna: "Santiago" }),
      );
      const insights = buildComparisonInsights(current, alternative, {
        comuna_objetivo: "Santiago",
        tipo_vivienda_preferida: "departamento",
      });

      assert.equal(insights.recommendation, "alternativa");
      assert.equal(insights.deltas.valueUf, -2400);
      assert.equal(insights.deltas.pieMinimoUf, -240);
      assert.equal(insights.deltas.statusChanged, true);
      assert.ok(insights.advantages.alternative.includes("Tiene mejor estado de compatibilidad."));
      assert.ok(insights.advantages.alternative.includes("Tiene menor valor de vivienda."));
    },
  ],
  [
    "buildComparisonInsights recommends the current scenario when it is financially stronger",
    () => {
      const input = baseInput({ ahorro_disponible: 10_000_000, dividendo_estimado: 700_000 });
      const current = evaluateScenario(input, scenario(1800, { label: "Escenario menor", comuna: "Santiago" }));
      const alternative = evaluateScenario(input, scenario(4000, { label: "Escenario exigente", comuna: "Providencia" }));
      const insights = buildComparisonInsights(current, alternative, {
        comuna_objetivo: "Santiago",
        tipo_vivienda_preferida: "departamento",
      });

      assert.equal(insights.recommendation, "escenario_actual");
      assert.ok(insights.advantages.current.includes("Tiene mejor estado de compatibilidad."));
      assert.ok(insights.advantages.current.includes("Tiene menor valor de vivienda."));
    },
  ],
  [
    "buildComparisonInsights surfaces preference tradeoffs when the cheaper alternative is less aligned",
    () => {
      const input = baseInput({ ahorro_disponible: 10_000_000, dividendo_estimado: 700_000 });
      const current = evaluateScenario(input, scenario(3000, { label: "Comuna objetivo", comuna: "Santiago", tipo_vivienda: "departamento" }));
      const alternative = evaluateScenario(input, scenario(2400, { label: "Menor valor", comuna: "Macul", tipo_vivienda: "casa" }));
      const insights = buildComparisonInsights(current, alternative, {
        comuna_objetivo: "Santiago",
        tipo_vivienda_preferida: "departamento",
      });

      assert.equal(insights.recommendation, "alternativa");
      assert.ok(insights.advantages.current.includes("Coincide con tu comuna objetivo."));
      assert.ok(insights.advantages.current.includes("Coincide con tu tipo de vivienda preferido."));
      assert.ok(insights.considerations.some((item) => item.includes("reduce la brecha de pie")));
    },
  ],
  [
    "buildComparisonInsights handles similar scenarios without forcing a winner",
    () => {
      const input = baseInput({ ahorro_disponible: 20_000_000, dividendo_estimado: 700_000 });
      const current = evaluateScenario(input, scenario(2500, { label: "Escenario A", comuna: "Santiago" }));
      const alternative = evaluateScenario(input, scenario(2500, { label: "Escenario B", comuna: "Santiago" }));
      const insights = buildComparisonInsights(current, alternative, {
        comuna_objetivo: "Santiago",
        tipo_vivienda_preferida: "departamento",
      });

      assert.equal(insights.recommendation, "similar");
      assert.equal(insights.deltas.valueUf, 0);
      assert.equal(insights.deltas.pieMinimoUf, 0);
      assert.equal(insights.deltas.gapMinimoUf, 0);
      assert.ok(insights.considerations.some((item) => item.includes("similares financieramente")));
    },
  ],
  [
    "buildComparisonInsights returns controlled output when data is missing",
    () => {
      const insights = buildComparisonInsights(null, null);

      assert.equal(insights.recommendation, "sin_datos_suficientes");
      assert.deepEqual(insights.metrics, []);
      assert.ok(insights.summary.includes("selecciona"));
    },
  ],
  [
    "resolveActiveComparison recovers when the comparison project was selected before the current scenario",
    () => {
      const input = baseInput();
      const current = evaluateScenario(input, scenario(2800, { label: "Escenario actual" }));
      const alternative = evaluateScenario(input, scenario(2400, { label: "Proyecto comparado" }));
      const active = resolveActiveComparison(
        { source: "project-selector", error: true },
        { source: "project-selector", current, alternative },
      );

      assert.equal(active.current.scenario.label, "Escenario actual");
      assert.equal(active.alternative.scenario.label, "Proyecto comparado");
      assert.equal(shouldShowComparisonWarning({ source: "project-selector", error: true }, active, false), false);
    },
  ],
  [
    "shouldShowComparisonWarning avoids duplicating the manual scenario warning",
    () => {
      assert.equal(
        shouldShowComparisonWarning({ source: "project-selector", error: true }, null, true),
        false,
      );
      assert.equal(
        shouldShowComparisonWarning({ source: "project-selector", error: true }, null, false),
        true,
      );
    },
  ],
  [
    "HU6 simulation calculations complete below the 30 second response limit",
    () => {
      const manyProjects = Array.from({ length: 1000 }, (_, batchIndex) =>
        mockProjects.map((project, projectIndex) => ({
          ...project,
          id: `${project.id}-${batchIndex}-${projectIndex}`,
        })),
      ).flat();
      const startedAt = performance.now();
      const alternatives = buildAccessibleAlternatives(
        manyProjects,
        baseInput({ ahorro_disponible: 12_000_000, dividendo_estimado: 700_000 }),
        { comuna_interes: "Santiago", tipo_propiedad: "departamento" },
        8,
      );
      const elapsedMs = performance.now() - startedAt;

      assert.equal(alternatives.length, 8);
      assert.ok(elapsedMs < 30_000, `Simulation took ${elapsedMs}ms and exceeded the HU6 limit`);
    },
  ],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

console.log(`\n${passed} simulation tests passed`);
