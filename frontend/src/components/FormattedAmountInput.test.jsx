import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import FormattedAmountInput, { formattedAmountCursorPosition } from "./FormattedAmountInput";
import { reviewCommand } from "../services/coDebtorReview";

vi.mock("react", async original => ({ ...await original(), useRef: () => ({ current: null }) }));

afterEach(() => vi.unstubAllGlobals());

it.each([[1000000, "1.000.000"], [0, "0"], ["", ""]])("formats CLP %s using Chilean thousands", (value, label) => {
  const html = renderToStaticMarkup(<FormattedAmountInput value={value} allowEmpty onChange={() => {}} />);
  expect(html).toContain(`value="${label}"`);
  expect(html).toContain('inputMode="numeric"');
});

it("preserves the financing default of zero and disabled inputs", () => {
  expect(renderToStaticMarkup(<FormattedAmountInput value="" disabled onChange={() => {}} />))
    .toContain('value="0"');
  expect(renderToStaticMarkup(<FormattedAmountInput value={1000000} disabled onChange={() => {}} />))
    .toContain('disabled=""');
});

it("keeps cursor positions around separators", () => {
  expect(formattedAmountCursorPosition("1.000.000", 4)).toBe(5);
  expect(formattedAmountCursorPosition("1.000.000", 0)).toBe(0);
});

it("emits numeric CLP values accepted by the existing confirmation contract", () => {
  const change = vi.fn();
  const input = FormattedAmountInput({ value: "", allowEmpty: true, onChange: change }).props;
  vi.stubGlobal("requestAnimationFrame", () => {});
  input.onChange({ target: { value: "$1.000.000", selectionStart: 10 } });
  expect(change).toHaveBeenLastCalledWith(1000000);
  const command = reviewCommand({ revision_number: 0, relation: { event_id: "relation" } }, {
    ingreso_mensual_complementario: change.mock.lastCall[0], deuda_mensual_complementario: 0,
    tipo_contrato_complementario: "indefinido", continuidad_laboral_complementario: "mas_3_anios", morosidad_complementario: "no",
  }, false, true);
  expect(command.values.ingreso_mensual_complementario).toBe(1000000);
  input.onChange({ target: { value: "", selectionStart: 0 } });
  expect(change).toHaveBeenLastCalledWith("");
});
