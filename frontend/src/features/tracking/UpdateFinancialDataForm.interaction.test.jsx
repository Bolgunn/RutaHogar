import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpdateFinancialDataForm from "./UpdateFinancialDataForm";
import { calculateMortgageDividend } from "../../lib/mortgage";

// Exercise the actual form callbacks without adding a DOM test dependency.
const hooks = vi.hoisted(() => ({ states: [], refs: [], stateIndex: 0, refIndex: 0 }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal(),
  useState: (initial) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next) => {
      hooks.states[index] = typeof next === "function" ? next(hooks.states[index]) : next;
    }];
  },
  useRef: (initial) => {
    const index = hooks.refIndex++;
    return hooks.refs[index] ??= { current: initial };
  },
}));

function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return null;
  return predicate(node) ? node : find(node.props.children, predicate);
}

afterEach(() => {
  hooks.states = [];
  hooks.refs = [];
  vi.unstubAllGlobals();
});

describe("HU13 calculated dividend form interactions", () => {
  it("previews, cancels and submits only the changed fields through the normal update callback", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const dividend = (savingsClp) => calculateMortgageDividend({
      propertyValueClp: 108000000, savingsClp, termYears: 20, annualRate: 0.049,
    }).dividend;
    const snapshot = { property_value_clp: 108000000, ahorro_disponible: 10000000,
      plazo_credito_hipotecario: 20, dividendo_tasa_anual_referencial: 0.049,
      dividendo_estimado_origen: "calculado_referencial", dividendo_estimado: dividend(10000000),
      dividendo_estimado_calculado: dividend(10000000) };
    const original = structuredClone(snapshot);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const render = () => {
      hooks.stateIndex = 0;
      hooks.refIndex = 0;
      return UpdateFinancialDataForm({ snapshot, previous: "event-1", onSubmit });
    };
    const input = (tree, label) => find(tree, (node) => node.props["aria-label"] === label);
    const editSavings = (tree) => input(tree, "Ahorro disponible").props.onChange({
      target: { value: "60000000", selectionStart: 8 },
    });
    let tree = render();
    expect(input(tree, "Dividendo estimado").props.readOnly).toBe(true);
    editSavings(tree);
    tree = render();
    expect(Number(input(tree, "Dividendo estimado").props.value.replaceAll(".", ""))).toBe(dividend(60000000));
    find(tree, (node) => node.type === "button" && node.props.children === "Cancelar").props.onClick();
    tree = render();
    expect(Number(input(tree, "Dividendo estimado").props.value.replaceAll(".", ""))).toBe(snapshot.dividendo_estimado);
    expect(input(tree, "Ahorro disponible").props.value).toBe("10.000.000");
    editSavings(tree);
    tree = render();
    find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "Aumentó mi ahorro" } });
    await render().props.onSubmit({ preventDefault: vi.fn() });
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ previous_event_id: "event-1", patch: {
      ahorro_disponible: 60000000, dividendo_estimado: dividend(60000000),
      dividendo_estimado_calculado: dividend(60000000),
    } });
    expect(Object.keys(onSubmit.mock.calls[0][0].patch)).toHaveLength(3);
    expect(snapshot).toEqual(original);
  });
});
