import assert from "node:assert";
import test from "node:test";
import {
  CHECKLIST_ITEMS,
  DISCLAIMER_TEXTS,
  getActiveRiskCodesAndFactors,
  getChecklistForRegime,
  getPriorityChecklistItems,
} from "./checklist.js";

test("getChecklistForRegime returns correct structure for dependiente", () => {
  const list = getChecklistForRegime("dependiente");
  assert.strictEqual(Array.isArray(list), true);
  assert.strictEqual(list.some((item) => item.id === "liquidaciones"), true);
  assert.strictEqual(list.some((item) => item.id === "f22_sii"), false);
});

test("getChecklistForRegime returns correct structure for independiente", () => {
  const list = getChecklistForRegime("independiente");
  assert.strictEqual(Array.isArray(list), true);
  assert.strictEqual(list.some((item) => item.id === "f22_sii"), true);
  assert.strictEqual(list.some((item) => item.id === "liquidaciones"), false);
});

test("getActiveRiskCodesAndFactors extracts risk codes from backend result", () => {
  const result = {
    risk_codes: ["ahorro_bajo", "morosidad_alta"],
    blockers: [{ code: "contrato_independiente" }],
    main_blocker: { code: "deuda_alta" },
    factors: [
      { title: "Nivel de Endeudamiento", description: "Carga financiera mayor a 40%" },
      { title: "Estabilidad Laboral", description: "Menos de 1 año en empleo actual" },
    ],
  };
  const input = {};

  const { activeRiskCodes, activeFactors } = getActiveRiskCodesAndFactors(result, input);

  assert.strictEqual(activeRiskCodes.has("ahorro_bajo"), true);
  assert.strictEqual(activeRiskCodes.has("morosidad_alta"), true);
  assert.strictEqual(activeRiskCodes.has("contrato_independiente"), true);
  assert.strictEqual(activeRiskCodes.has("deuda_alta"), true);

  assert.strictEqual(activeFactors.has("nivel_endeudamiento"), true);
  assert.strictEqual(activeFactors.has("estabilidad_laboral"), true);
});

test("getPriorityChecklistItems dynamically highlights items matching active risks/factors (E2)", () => {
  const items = getChecklistForRegime("dependiente");
  const activeRiskCodes = new Set(["ahorro_bajo"]);
  const activeFactors = new Set(["estabilidad_laboral"]);

  const priorityItems = getPriorityChecklistItems(items, activeRiskCodes, activeFactors);

  assert.strictEqual(priorityItems.some((item) => item.id === "ahorro_pie"), true);
  assert.strictEqual(priorityItems.some((item) => item.id === "cotizaciones_afp"), true);
  assert.strictEqual(priorityItems.some((item) => item.id === "cedula"), false);
});

test("All checklist items have valid Academia mappings (E4)", () => {
  const allItems = [
    ...CHECKLIST_ITEMS.common,
    ...CHECKLIST_ITEMS.dependiente,
    ...CHECKLIST_ITEMS.independiente,
    ...CHECKLIST_ITEMS.mitigacion,
  ];

  allItems.forEach((item) => {
    assert.strictEqual(typeof item.academyArticleId, "string", `Item ${item.id} must have academyArticleId`);
    assert.strictEqual(typeof item.academyTopicId, "string", `Item ${item.id} must have academyTopicId`);
  });
});

test("DISCLAIMER_TEXTS satisfies S1, S5, and S7 safeguards (E3)", () => {
  assert.strictEqual(DISCLAIMER_TEXTS.bannerText.includes("No se deben subir ni ingresar documentos sensibles"), true);
  assert.strictEqual(DISCLAIMER_TEXTS.legalNote.includes("orientativo y educacional"), true);
});
