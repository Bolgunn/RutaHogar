import { describe, expect, it } from "vitest";

import { displayItemBenefit, displayItemText, normalizeDisplayList } from "../text";

// El motor emite recomendaciones como {text, benefit} desde HU 4, pero las
// evaluaciones antiguas guardaron strings. normalizeDisplayList conserva ambas
// formas a proposito, asi que renderizar un item crudo tumba React con
// "Objects are not valid as a React child" -- una pagina en blanco, no un error
// visible. Es lo que rompia el detalle del lead para las evaluaciones recientes.
describe("items de listas mixtas", () => {
  it("lee un item string", () => {
    expect(displayItemText("Reducir la deuda")).toBe("Reducir la deuda");
    expect(displayItemBenefit("Reducir la deuda")).toBeNull();
  });

  it("lee un item objeto", () => {
    const item = { text: "Revisar el dividendo", benefit: "Mejora tu clasificación" };
    expect(displayItemText(item)).toBe("Revisar el dividendo");
    expect(displayItemBenefit(item)).toBe("Mejora tu clasificación");
  });

  it("nunca devuelve un objeto, que es lo que rompe el render", () => {
    for (const item of [null, undefined, {}, { benefit: "sin texto" }, 42]) {
      expect(typeof displayItemText(item)).toBe("string");
    }
  });

  it("normalizeDisplayList sigue entregando las dos formas", () => {
    const salida = normalizeDisplayList(["un string", { text: "un objeto", benefit: "algo" }]);
    expect(salida.map(displayItemText)).toEqual(["un string", "un objeto"]);
  });
});
