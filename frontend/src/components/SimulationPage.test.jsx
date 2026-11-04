import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

// Follow the existing component interaction-test convention: run the catalogue
// effect and render again with its resolved state, without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ states: [], refs: [], effects: [], si: 0, ri: 0 }));
vi.mock("react", async (original) => ({
  ...await original(),
  useState: (initial) => {
    const i = hooks.si++;
    if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[i], (value) => { hooks.states[i] = typeof value === "function" ? value(hooks.states[i]) : value; }];
  },
  useRef: (initial) => hooks.refs[hooks.ri++] ??= { current: initial },
  useMemo: (factory) => factory(),
  useEffect: (effect) => hooks.effects.push(effect),
}));
vi.mock("../services/projectService", () => ({ getAvailableProjects: vi.fn() }));
vi.mock("./financing/FinancingSimulatorPanel", () => ({ default: () => null }));

import SimulationPage from "./SimulationPage";
import { getAvailableProjects } from "../services/projectService";

const evaluation = {
  // HU23 has a financial baseline and deliberately no property preferences.
  input: { ingreso_mensual: 1450000, deuda_mensual: 0, ahorro_disponible: 20000000, dividendo_estimado: 300000, uf_value_clp: 40695 },
  result: { score: 75, classification: "Alto" },
  onboarding: null,
};
const catalog = [{ id: "local-project", nombre: "Proyecto local", comuna: "Ñuñoa", tipo: "departamento",
  precio_min_uf: 1500, precio_max_uf: 2000, estado: "disponible" }];

function render(props) {
  hooks.si = 0;
  hooks.ri = 0;
  hooks.effects = [];
  return renderToStaticMarkup(<SimulationPage evaluation={evaluation} {...props} />);
}

afterEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  vi.resetAllMocks();
});

it.each([null, undefined, {}])("renderiza sin preferencias (%s), incluso después de cargar proyectos", async (onboarding) => {
  getAvailableProjects.mockResolvedValue(catalog);
  expect(render({ onboarding })).toContain("Compatibilidad y alternativas");
  hooks.effects[0]();
  await getAvailableProjects.mock.results[0].value;
  await Promise.resolve();
  const html = render({ onboarding });
  expect(getAvailableProjects).toHaveBeenCalledOnce();
  expect(html).toContain("Proyecto local");
  expect(html).toContain("Sin comuna");
  expect(html).toContain("Sin preferencia");
  expect(html).toContain("Sin objetivo declarado");
  expect(html).not.toContain("Cargando proyectos del catálogo");
});

it("conserva las preferencias declaradas después de cargar proyectos", async () => {
  const props = { onboarding: { comuna_interes: "Ñuñoa", tipo_propiedad: "departamento", plazo_compra: "6_12_meses" } };
  getAvailableProjects.mockResolvedValue(catalog);
  render(props);
  hooks.effects[0]();
  await getAvailableProjects.mock.results[0].value;
  await Promise.resolve();
  const html = render(props);
  expect(html).toContain("Proyecto local");
  expect(html).not.toContain("Sin comuna");
  expect(html).not.toContain("Sin preferencia");
});
